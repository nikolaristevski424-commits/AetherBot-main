import { Events } from 'discord.js';
import { getSecurityConfig, isWhitelisted } from '../services/security/securityConfigService.js';
import { recordMentionAndCheck } from '../services/security/actionTracker.js';
import { applyRaidAction, recordAndAlert } from '../services/security/securityActionsService.js';
import { logger } from '../utils/logger.js';

export default {
    name: Events.MessageCreate,
    async execute(message) {
        if (!message.guild || message.author.bot || message.webhookId) return;
        const userMentions = message.mentions.parsedUsers?.size ?? message.mentions.users.size;
        const mentionCount = userMentions + message.mentions.roles.size + Number(Boolean(message.mentions.everyone));
        if (!mentionCount) return;

        try {
            const config = await getSecurityConfig(message.guild.id);
            const { mentionSpam, mentionBurst } = config.antiraid;
            if (!mentionSpam.enabled && !mentionBurst.enabled) return;

            const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
            if (!member || isWhitelisted(config, member)) return;

            const burst = mentionBurst.enabled ? await recordMentionAndCheck(
                message.guild.id, member.id, mentionBurst.windowSeconds, mentionBurst.threshold, message.id, mentionCount,
            ) : null;
            const spike = mentionSpam.enabled && mentionCount >= mentionSpam.threshold;
            if (!spike && !burst?.breached) return;

            const rule = spike ? mentionSpam : mentionBurst;
            const category = spike ? 'Mention Spam' : 'Mention Burst';
            if ((spike || rule.action !== 'alert') && message.deletable) {
                await message.delete().catch(() => {});
            }

            const result = await applyRaidAction(member, rule.action, `Anti-raid: ${category}`, config.quarantineRoleId);
            await recordAndAlert(message.guild, {
                category, targetId: member.id, count: spike ? mentionCount : burst.count, threshold: rule.threshold,
                actionResult: result, alertChannelId: rule.alertChannelId,
            });
        } catch (error) {
            logger.error('[security] Error in anti-raid mention handler:', error);
        }
    },
};
