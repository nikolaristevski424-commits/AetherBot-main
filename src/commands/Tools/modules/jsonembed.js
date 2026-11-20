// jsonembed.js
//
// Posts (or edits) a message from raw Discohook-exported JSON. V2: adds a
// preview-before-posting step (nothing goes out until you confirm — the
// original version fired immediately, so a typo went straight to the
// channel with no chance to catch it), a target channel option, edit-an-
// existing-message support, and carries through any `components` Discohook
// exported alongside the embeds, not just the embeds themselves.

import { PermissionFlagsBits, MessageFlags, SlashCommandBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import crypto from 'node:crypto';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { AetherError, ErrorTypes, replyUserError, handleInteractionError } from '../../../utils/errorHandler.js';
import { successEmbed, infoEmbed } from '../../../utils/embeds.js';
import { getFromDb, setInDb, deleteFromDb } from '../../../utils/database.js';

const MAX_EMBEDS = 10; // Discord's own per-message embed cap
const PREVIEW_TTL_SECONDS = 5 * 60;

function pendingKey(guildId, previewId) {
    return `guild:${guildId}:jsonembed:pending:${previewId}`;
}

function extractPayload(parsed) {
    // Discohook exports vary: a raw { content, embeds, components } message,
    // or a { messages: [...] } backup/export containing one or more messages.
    const source = Array.isArray(parsed.messages) && parsed.messages.length > 0 ? parsed.messages[0] : parsed;
    return {
        content: source.content || null,
        embeds: source.embeds || [],
        components: source.components || [],
    };
}

function validate(payload) {
    if (!payload.content && payload.embeds.length === 0 && payload.components.length === 0) {
        return 'That JSON has no `content`, `embeds`, or `components` to post.';
    }
    if (payload.embeds.length > MAX_EMBEDS) {
        return `Discord allows at most ${MAX_EMBEDS} embeds per message — that JSON has ${payload.embeds.length}.`;
    }
    return null;
}

export default {
    // .setName() here is discarded — tools.js sets the subcommand name from
    // the TOOL_MODULES key, matching every other module in this folder.
    data: new SlashCommandBuilder()
        .setName('jsonembed')
        .setDescription('Post (or edit) a message from raw Discohook JSON')
        .addStringOption((option) => option
            .setName('json')
            .setDescription('Paste your raw Discohook JSON here')
            .setRequired(true))
        .addChannelOption((option) => option
            .setName('channel')
            .setDescription('Channel to post in (defaults to this channel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false))
        .addStringOption((option) => option
            .setName('edit_message_id')
            .setDescription('Edit this existing message instead of posting a new one')
            .setRequired(false)),

    async execute(interaction) {
        try {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
                return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the **Manage Messages** permission to use this.' });
            }

            const jsonString = interaction.options.getString('json', true);
            const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
            const editMessageId = interaction.options.getString('edit_message_id');

            let parsed;
            try {
                parsed = JSON.parse(jsonString);
            } catch (parseError) {
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `That's not valid JSON: ${parseError.message}` });
            }

            const payload = extractPayload(parsed);
            const validationError = validate(payload);
            if (validationError) {
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: validationError });
            }

            const perms = targetChannel?.permissionsFor?.(interaction.client.user);
            if (!perms?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `I need **Send Messages** and **Embed Links** permission in ${targetChannel}.` });
            }

            if (editMessageId) {
                const existing = await targetChannel.messages.fetch(editMessageId).catch(() => null);
                if (!existing) {
                    return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `Couldn't find message \`${editMessageId}\` in ${targetChannel}.` });
                }
                if (existing.author.id !== interaction.client.user.id) {
                    return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'That message wasn\'t sent by me — I can only edit my own messages.' });
                }
            }

            const previewId = crypto.randomUUID();
            await setInDb(pendingKey(interaction.guildId, previewId), {
                payload, channelId: targetChannel.id, editMessageId: editMessageId || null,
            }, PREVIEW_TTL_SECONDS);

            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`jsonembed_confirm:${previewId}`).setLabel(editMessageId ? 'Apply Edit' : 'Post').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`jsonembed_cancel:${previewId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
            );

            await InteractionHelper.safeReply(interaction, {
                content: [
                    `**Preview** — ${editMessageId ? `will edit a message in ${targetChannel}` : `will post to ${targetChannel}`}. Nothing has been sent yet.`,
                    payload.content ? `\n**Message content:**\n${payload.content}` : null,
                ].filter(Boolean).join('\n'),
                embeds: payload.embeds,
                components: [...(payload.components || []), confirmRow],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            if (error instanceof AetherError) {
                return await replyUserError(interaction, { type: error.type || ErrorTypes.VALIDATION, message: error.userMessage || 'Something went wrong.' });
            }
            await handleInteractionError(interaction, error, { command: 'tools jsonembed' });
        }
    },
};
