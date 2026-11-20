// securityActionsService.js
//
// Executes the configured response once a protection threshold is breached,
// and handles alerting. Kept separate from detection (the event listeners)
// and config (securityConfigService) so each piece is independently
// testable — this file only knows "given a target and an action, do it and
// report what happened," nothing about *when* to call it.

import { logger } from '../../utils/logger.js';
import { createEmbed } from '../../utils/embeds.js';
import { logSecurityEvent } from './securityConfigService.js';

/**
 * Anti-raid actions target a newly-joined member suspected of being part of
 * a raid.
 */
export async function applyRaidAction(member, action, reason, quarantineRoleId) {
    try {
        switch (action) {
            case 'alert':
                return { applied: true, action: 'alert' };
            case 'timeout':
                await member.timeout(10 * 60 * 1000, reason); // 10 minutes — long enough for staff to react
                return { applied: true, action: 'timeout' };
            case 'kick':
                await member.kick(reason);
                return { applied: true, action: 'kick' };
            case 'ban':
                await member.ban({ reason });
                return { applied: true, action: 'ban' };
            case 'quarantine':
                if (!quarantineRoleId) {
                    return { applied: false, action: 'quarantine', error: 'No quarantine role configured.' };
                }
                await member.roles.set([quarantineRoleId], reason);
                return { applied: true, action: 'quarantine' };
            default:
                return { applied: false, action, error: `Unknown action: ${action}` };
        }
    } catch (error) {
        logger.warn(`[security] Failed to apply raid action "${action}" to ${member.id}: ${error.message}`);
        return { applied: false, action, error: error.message };
    }
}

/**
 * Anti-nuke actions target the member who triggered a destructive-action
 * threshold. `strip_roles` is the "soft" option — it neutralizes their
 * permissions without removing them from the server, useful when the
 * account might just be compromised rather than malicious.
 */
export async function applyNukeAction(member, action, reason) {
    try {
        switch (action) {
            case 'alert':
                return { applied: true, action: 'alert' };
            case 'strip_roles': {
                const removable = member.roles.cache.filter((r) => r.id !== member.guild.id && r.editable);
                await member.roles.remove(removable, reason);
                return { applied: true, action: 'strip_roles', rolesRemoved: removable.size };
            }
            case 'kick':
                await member.kick(reason);
                return { applied: true, action: 'kick' };
            case 'ban':
                await member.ban({ reason, deleteMessageSeconds: 0 });
                return { applied: true, action: 'ban' };
            default:
                return { applied: false, action, error: `Unknown action: ${action}` };
        }
    } catch (error) {
        // Most common cause: the bot's role sits below the executor's in
        // the hierarchy, so Discord refuses the action outright. Still
        // worth surfacing — staff need to know the auto-response failed.
        logger.warn(`[security] Failed to apply nuke action "${action}" to ${member.id}: ${error.message}`);
        return { applied: false, action, error: error.message };
    }
}

export async function alertStaff(guild, alertChannelId, { title, description, fields }) {
    if (!alertChannelId) return false;
    const channel = await guild.channels.fetch(alertChannelId).catch(() => null);
    if (!channel?.isTextBased()) return false;

    const embed = createEmbed({ title, description, color: 'error', fields: fields || [] });
    await channel.send({ embeds: [embed] }).catch((error) => {
        logger.warn(`[security] Failed to send alert to channel ${alertChannelId}: ${error.message}`);
    });
    return true;
}

export async function recordAndAlert(guild, { category, executorId, targetId, count, threshold, actionResult, alertChannelId }) {
    await logSecurityEvent(guild.id, { category, executorId, targetId, count, threshold, action: actionResult.action, applied: actionResult.applied });

    await alertStaff(guild, alertChannelId, {
        title: `🚨 Security: ${category}`,
        description: [
            executorId ? `**Executor:** <@${executorId}>` : null,
            targetId ? `**Target:** <@${targetId}>` : null,
            `**Count:** ${count} (threshold: ${threshold})`,
            `**Action:** ${actionResult.action}${actionResult.applied ? '' : ` (FAILED: ${actionResult.error})`}`,
        ].filter(Boolean).join('\n'),
    });
}
