// securityGuildMemberAdd.js
//
// Anti-raid detection on member join: guild-wide join-rate spikes, and
// individual accounts younger than the configured minimum age. Registered
// as its own listener (see loadEvents — multiple files can share an event
// name) so this never touches the existing guildMemberAdd.js, which
// handles welcome messages/logging and stays untouched.

import { Events } from 'discord.js';
import { getSecurityConfig } from '../services/security/securityConfigService.js';
import { recordJoinAndCheck } from '../services/security/actionTracker.js';
import { applyRaidAction, recordAndAlert } from '../services/security/securityActionsService.js';
import { logger } from '../utils/logger.js';

export default {
    name: Events.GuildMemberAdd,
    once: false,
    async execute(member) {
        try {
            const config = await getSecurityConfig(member.guild.id);

            const { joinSpike, newAccount } = config.antiraid;

            if (joinSpike.enabled) {
                const { count, breached } = await recordJoinAndCheck(member.guild.id, joinSpike.windowSeconds, joinSpike.threshold);
                if (breached) {
                    const result = await applyRaidAction(member, joinSpike.action, 'Anti-raid: join spike detected', config.quarantineRoleId);
                    await recordAndAlert(member.guild, {
                        category: 'Join Spike', targetId: member.id, count, threshold: joinSpike.threshold,
                        actionResult: result, alertChannelId: joinSpike.alertChannelId,
                    });
                }
            }

            if (newAccount.enabled) {
                const ageHours = (Date.now() - member.user.createdTimestamp) / (60 * 60 * 1000);
                if (ageHours < newAccount.minAgeHours) {
                    const result = await applyRaidAction(member, newAccount.action, 'Anti-raid: account below minimum age', config.quarantineRoleId);
                    await recordAndAlert(member.guild, {
                        category: 'New Account', targetId: member.id, count: 1, threshold: 1,
                        actionResult: result, alertChannelId: newAccount.alertChannelId,
                    });
                }
            }
        } catch (error) {
            logger.error('[security] Error in anti-raid join handler:', error);
        }
    },
};
