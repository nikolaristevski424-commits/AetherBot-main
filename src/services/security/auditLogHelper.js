// auditLogHelper.js
//
// Gateway events like channelDelete don't say who did it — only Discord's
// audit log does. This resolves the executor for a just-happened action by
// fetching recent matching entries and picking the one for the right
// target created within the last few seconds. Audit log entries aren't
// always instant, so a short delay before the first fetch attempt helps;
// this still isn't 100% guaranteed (Discord doesn't promise audit log
// latency), so callers should treat a null result as "couldn't attribute
// it" rather than "nothing happened."

import { logger } from '../../utils/logger.js';

const RECENCY_WINDOW_MS = 8000;

export async function resolveExecutor(guild, auditLogEventType, targetId) {
    try {
        // Audit log entries can lag slightly behind the gateway event that
        // tells us something happened.
        await new Promise((resolve) => setTimeout(resolve, 750));

        const logs = await guild.fetchAuditLogs({ type: auditLogEventType, limit: 5 });
        const entry = logs.entries.find((e) => {
            const matchesTarget = targetId ? e.target?.id === targetId : true;
            const isRecent = Date.now() - e.createdTimestamp < RECENCY_WINDOW_MS;
            return matchesTarget && isRecent;
        });

        return entry?.executor || null;
    } catch (error) {
        logger.warn(`[security] Failed to resolve audit log executor: ${error.message}`);
        return null;
    }
}
