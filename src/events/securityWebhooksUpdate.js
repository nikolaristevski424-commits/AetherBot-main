// securityWebhooksUpdate.js
//
// Discord's webhooksUpdate event just says "something about webhooks
// changed in this channel" — no detail on what or who. There's no separate
// "webhook created" gateway event to listen for directly, so this treats
// any webhooksUpdate as a signal to check the audit log for a recent
// WebhookCreate entry, same attribution approach as the other anti-nuke
// listeners. A webhook is a real persistence risk — unlike a kicked/banned
// member, a webhook a raider created keeps working until someone deletes
// it, so catching creation itself (not just the spam sent through it)
// matters here specifically.

import { Events, AuditLogEvent } from 'discord.js';
import { handleNukeEvent } from '../services/security/nukeEventHandler.js';

export default {
    name: Events.WebhooksUpdate,
    once: false,
    async execute(channel) {
        if (!channel.guild) return;
        await handleNukeEvent({
            guild: channel.guild,
            category: 'webhookCreate',
            targetId: null, // no single "target" for a webhook creation the way a deleted channel/role has one
            auditLogEventType: AuditLogEvent.WebhookCreate,
        });
    },
};
