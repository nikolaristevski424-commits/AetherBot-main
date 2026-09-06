// securityMessageCreate.js
//
// Anti-raid mention-spam detection — registered as its own messageCreate
// listener (see loadEvents — multiple files can share an event name) so
// this never touches the existing messageCreate.js, which handles prefix
// command parsing and stays untouched. This doesn't need the audit-log
// attribution the other anti-nuke listeners use — the message author IS
// the person to act on, no resolution needed.

import { Events } from 'discord.js';
import { getSecurityConfig, isWhitelisted } from '../services/security/securityConfigService.js';
import { applyRaidAction, recordAndAlert } from '../services/security/securityActionsService.js';
import { logger } from '../utils/logger.js';

export default {
    name: Events.MessageCreate,
    once: false,
    async execute(message) {
        if (!message.guild || message.author.bot) return;

        try {
            const config = await getSecurityConfig(message.guild.id);
            const { mentionSpam } = config.antiraid;
            if (!mentionSpam.enabled) return;

            const mentionCount = message.mentions.users.size + message.mentions.roles.size;
            if (mentionCount < mentionSpam.threshold) return;

            const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
            if (!member || isWhitelisted(config, member)) return;

            await message.delete().catch(() => {});

            const result = await applyRaidAction(member, mentionSpam.action, 'Anti-raid: mention spam', config.quarantineRoleId);
            await recordAndAlert(message.guild, {
                category: 'Mention Spam', targetId: member.id, count: mentionCount, threshold: mentionSpam.threshold,
                actionResult: result, alertChannelId: mentionSpam.alertChannelId,
            });
        } catch (error) {
            logger.error('[security] Error in anti-raid mention-spam handler:', error);
        }
    },
};
