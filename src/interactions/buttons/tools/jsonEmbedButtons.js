import { MessageFlags } from 'discord.js';
import { getFromDb, deleteFromDb } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';

function pendingKey(guildId, previewId) {
    return `guild:${guildId}:jsonembed:pending:${previewId}`;
}

async function confirm(interaction, args) {
    const [previewId] = args;
    await interaction.deferUpdate();

    const pending = await getFromDb(pendingKey(interaction.guildId, previewId), null);
    if (!pending) {
        await interaction.editReply({ content: '❌ This preview has expired (previews last 5 minutes) — run `/tools json-embed` again.', embeds: [], components: [] });
        return;
    }

    try {
        const channel = await interaction.guild.channels.fetch(pending.channelId);
        const sendPayload = { content: pending.payload.content || undefined, embeds: pending.payload.embeds, components: pending.payload.components || [] };

        if (pending.editMessageId) {
            const message = await channel.messages.fetch(pending.editMessageId);
            await message.edit(sendPayload);
            await interaction.editReply({ content: `✅ Edited the message in ${channel}.`, embeds: [], components: [] });
        } else {
            await channel.send(sendPayload);
            await interaction.editReply({ content: `✅ Posted to ${channel}.`, embeds: [], components: [] });
        }
    } catch (error) {
        logger.error('[jsonembed] Failed to send/edit on confirm:', error);
        await interaction.editReply({ content: `❌ Discord rejected that payload: ${error.message}`, embeds: [], components: [] });
    } finally {
        await deleteFromDb(pendingKey(interaction.guildId, previewId));
    }
}

async function cancel(interaction, args) {
    const [previewId] = args;
    await interaction.deferUpdate();
    await deleteFromDb(pendingKey(interaction.guildId, previewId));
    await interaction.editReply({ content: 'Cancelled — nothing was posted.', embeds: [], components: [] });
}

export default [
    { name: 'jsonembed_confirm', execute: confirm },
    { name: 'jsonembed_cancel', execute: cancel },
];
