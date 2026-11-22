import { getSecurityConfig, isWhitelisted } from './securityConfigService.js';
import { recordActionAndCheck } from './actionTracker.js';
import { applyNukeAction, recordAndAlert } from './securityActionsService.js';
import { logger } from '../../utils/logger.js';

export async function handleNukeEvent(guild, category, entry) {
    const { id, executorId, targetId, createdTimestamp } = entry;
    const age = Date.now() - createdTimestamp;
    if (!id || !executorId || executorId === guild.client.user.id || executorId === guild.ownerId
        || !Number.isFinite(age) || age < -5000 || age > 60_000) return;

    try {
        const config = await getSecurityConfig(guild.id);
        const protection = config.antinuke[category];
        if (!protection?.enabled) return;

        const member = await guild.members.fetch({ user: executorId, force: true }).catch(() => null);
        if (!member || isWhitelisted(config, member)) return;

        const { count, breached } = await recordActionAndCheck(
            guild.id, category, executorId, protection.windowSeconds, protection.threshold, { id, at: createdTimestamp },
        );
        if (!breached) return;

        const result = await applyNukeAction(member, protection.action, `Anti-nuke: ${category} threshold breached`);
        await recordAndAlert(guild, {
            category, executorId, targetId, count, threshold: protection.threshold,
            actionResult: result, alertChannelId: protection.alertChannelId,
        });
    } catch (error) {
        logger.error(`[security] Error handling audit event "${category}":`, error);
    }
}
