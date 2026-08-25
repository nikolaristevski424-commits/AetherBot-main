import { Events, AuditLogEvent } from 'discord.js';
import { handleNukeEvent } from '../services/security/nukeEventHandler.js';

export default {
    name: Events.GuildBanAdd,
    once: false,
    async execute(ban) {
        if (!ban.guild) return;
        await handleNukeEvent({
            guild: ban.guild,
            category: 'banSpam',
            targetId: ban.user?.id,
            auditLogEventType: AuditLogEvent.MemberBanAdd,
        });
    },
};
