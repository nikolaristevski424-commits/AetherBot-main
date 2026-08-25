import { Events, AuditLogEvent } from 'discord.js';
import { handleNukeEvent } from '../services/security/nukeEventHandler.js';

export default {
    name: Events.ChannelDelete,
    once: false,
    async execute(channel) {
        if (!channel.guild) return;
        await handleNukeEvent({
            guild: channel.guild,
            category: 'channelDelete',
            targetId: channel.id,
            auditLogEventType: AuditLogEvent.ChannelDelete,
        });
    },
};
