import { Events, AuditLogEvent } from 'discord.js';
import { handleNukeEvent } from '../services/security/nukeEventHandler.js';

export default {
    name: Events.GuildRoleDelete,
    once: false,
    async execute(role) {
        if (!role.guild) return;
        await handleNukeEvent({
            guild: role.guild,
            category: 'roleDelete',
            targetId: role.id,
            auditLogEventType: AuditLogEvent.RoleDelete,
        });
    },
};
