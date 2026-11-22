import { Events } from 'discord.js';
import { classifyAuditEntry } from '../services/security/auditCategories.js';
import { handleNukeEvent } from '../services/security/nukeEventHandler.js';

export default {
    name: Events.GuildAuditLogEntryCreate,
    async execute(entry, guild) {
        const category = classifyAuditEntry(entry);
        if (category) await handleNukeEvent(guild, category, entry);
    },
};
