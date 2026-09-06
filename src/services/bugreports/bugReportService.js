// bugReportService.js
//
// Bug reports become forum threads (not just a plain message) so each one
// has its own space for follow-up: developers can ask questions, the
// reporter can post screenshots as replies (Discord modals can't accept
// file uploads, so this is the actual mechanism for attaching evidence —
// not a limitation worth working around, just how it has to work), and the
// thread's own status (open/locked) doubles as a visible resolution state.

import { ChannelType } from 'discord.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { buildStatusButtonsRow } from '../../interactions/buttons/bugreport/bugReportStatusButtons.js';

const MIN_DESCRIPTION_LENGTH = 80;

function getBugReportStateKey(threadId) {
    return `bugreport:${threadId}`;
}

export function validateReport({ description }) {
    const issues = [];
    if (!description || description.length < MIN_DESCRIPTION_LENGTH) {
        issues.push(`• Report is too short (${description?.length || 0} characters). Please provide more detail — at least ${MIN_DESCRIPTION_LENGTH} characters are required.`);
    }
    return issues;
}

export async function createReportThread(client, { title, description, steps, reporterId }) {
    const forumChannelId = process.env.BUG_REPORT_FORUM_CHANNEL_ID;
    if (!forumChannelId) {
        throw new Error('BUG_REPORT_FORUM_CHANNEL_ID is not configured.');
    }

    const forum = await client.channels.fetch(forumChannelId).catch(() => null);
    if (!forum || forum.type !== ChannelType.GuildForum) {
        throw new Error('BUG_REPORT_FORUM_CHANNEL_ID does not point to a valid forum channel.');
    }

    const devRoleId = process.env.BUG_REPORT_DEV_ROLE_ID;
    const issues = validateReport({ description });

    const bodyLines = [
        `👋 **Reported by:** <@${reporterId}>`,
        '',
        '**Description**',
        description || '_No description provided._',
    ];
    if (steps) {
        bodyLines.push('', '**Steps to Reproduce**', steps);
    }
    bodyLines.push('', '_Have a screenshot or recording? Reply in this thread with it — it helps a lot._');
    // Modals can't carry file attachments, so a fresh report never has one yet —
    // always worth the reminder, not something to conditionally check for.
    issues.push('• No screenshots or attachments were provided yet. Reply in this thread with any evidence you have.');

    const thread = await forum.threads.create({
        name: title.slice(0, 90),
        message: {
            content: devRoleId ? `<@&${devRoleId}>` : undefined,
            embeds: [{
                title: '🐛 Bug Report Submitted',
                description: bodyLines.join('\n'),
                color: 0xED4245,
                fields: issues.length ? [{ name: '⚠️ Needs Action', value: issues.join('\n') }] : [],
                footer: { text: 'Support Team • Bug Reports' },
                timestamp: new Date().toISOString(),
            }],
            components: [buildStatusButtonsRow()],
        },
    });

    await setInDb(getBugReportStateKey(thread.id), {
        reporterId, title, status: 'open', createdAt: Date.now(),
    });

    if (process.env.BUG_REPORT_WEBHOOK_URL) {
        fetch(process.env.BUG_REPORT_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: `New bug report from <@${reporterId}>: **${title}**\n${thread.url || `Thread ID: ${thread.id}`}`,
            }),
        }).catch((error) => logger.warn(`[bugreports] Webhook post failed: ${error.message}`));
    }

    return { thread, hasIssues: issues.length > 0 };
}

export async function getReportState(threadId) {
    return await getFromDb(getBugReportStateKey(threadId), null);
}

export async function setReportStatus(threadId, status) {
    const state = await getFromDb(getBugReportStateKey(threadId), null);
    if (!state) return null;
    state.status = status;
    state.resolvedAt = Date.now();
    await setInDb(getBugReportStateKey(threadId), state);
    return state;
}
