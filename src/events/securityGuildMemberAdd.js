import { Events } from 'discord.js';
import { getSecurityConfig, isWhitelisted } from '../services/security/securityConfigService.js';
import { recordJoinAndCheck } from '../services/security/actionTracker.js';
import { applyRaidAction, recordAndAlert } from '../services/security/securityActionsService.js';
import { logger } from '../utils/logger.js';

const severity = ['alert', 'timeout', 'quarantine', 'kick', 'ban'];

export default {
    name: Events.GuildMemberAdd,
    async execute(member) {
        if (member.user.bot) return;
        try {
            const config = await getSecurityConfig(member.guild.id);
            if (isWhitelisted(config, member)) return;
            const { joinSpike, newAccount } = config.antiraid;
            const detections = [];
            if (joinSpike.enabled) {
                const { count, breached } = await recordJoinAndCheck(member.guild.id, joinSpike.windowSeconds, joinSpike.threshold, member);
                if (breached) detections.push({ category: 'Join Spike', count, threshold: joinSpike.threshold, rule: joinSpike });
            }
            const ageHours = (Date.now() - member.user.createdTimestamp) / 3_600_000;
            if (newAccount.enabled && ageHours < newAccount.minAgeHours) {
                detections.push({ category: 'New Account', count: 1, threshold: 1, rule: newAccount });
            }
            if (!detections.length) return;
            detections.sort((a, b) => severity.indexOf(b.rule.action) - severity.indexOf(a.rule.action));
            const { category, count, threshold, rule } = detections[0];
            const result = await applyRaidAction(member, rule.action, `Anti-raid: ${category}`, config.quarantineRoleId);
            await recordAndAlert(member.guild, {
                category, targetId: member.id, count, threshold, actionResult: result, alertChannelId: rule.alertChannelId,
            });
        } catch (error) {
            logger.error('[security] Error in anti-raid join handler:', error);
        }
    },
};
