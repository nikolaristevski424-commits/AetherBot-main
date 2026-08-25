// nukeEventHandler.js
//
// Shared logic behind every anti-nuke event listener (channel delete, role
// delete, ban spam): resolve who did it, skip if we can't safely attribute
// it or if they're whitelisted (including the bot itself — its own routine
// actions, like ticket cleanup deleting a channel, must never trigger
// anti-nuke on itself), track it, and act if the threshold is breached.

import { getSecurityConfig, isWhitelisted } from './securityConfigService.js';
import { recordActionAndCheck } from './actionTracker.js';
import { resolveExecutor } from './auditLogHelper.js';
import { applyNukeAction, recordAndAlert } from './securityActionsService.js';
import { logger } from '../../utils/logger.js';

export async function handleNukeEvent({ guild, category, targetId, auditLogEventType }) {
    try {
        const config = await getSecurityConfig(guild.id);
        const protectionConfig = config.antinuke[category];
        if (!protectionConfig?.enabled) return;

        const executor = await resolveExecutor(guild, auditLogEventType, targetId);
        if (!executor) return; // can't safely attribute — don't guess

        if (executor.id === guild.client.user.id) return; // never trigger on the bot's own actions

        const executorMember = await guild.members.fetch(executor.id).catch(() => null);
        if (!executorMember) return; // e.g. executor already left

        if (isWhitelisted(config, executorMember)) return;

        const { count, breached } = await recordActionAndCheck(
            guild.id, category, executor.id, protectionConfig.windowSeconds, protectionConfig.threshold,
        );
        if (!breached) return;

        const result = await applyNukeAction(executorMember, protectionConfig.action, `Anti-nuke: ${category} threshold breached`);
        await recordAndAlert(guild, {
            category, executorId: executor.id, count, threshold: protectionConfig.threshold,
            actionResult: result, alertChannelId: protectionConfig.alertChannelId,
        });
    } catch (error) {
        logger.error(`[security] Error handling nuke event "${category}":`, error);
    }
}
