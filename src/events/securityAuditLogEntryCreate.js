import { AuditLogEvent, Events } from 'discord.js';
import { handleNukeEvent } from '../services/security/nukeEventHandler.js';

const categories = new Map([
    [AuditLogEvent.ChannelDelete, 'channelDelete'],
    [AuditLogEvent.RoleDelete, 'roleDelete'],
    [AuditLogEvent.MemberBanAdd, 'banSpam'],
    [AuditLogEvent.WebhookCreate, 'webhookCreate'],
]);

export default {
    name: Events.GuildAuditLogEntryCreate,
    async execute(entry, guild) {
        const category = categories.get(entry.action);
        if (category) await handleNukeEvent(guild, category, entry);
    },
};
