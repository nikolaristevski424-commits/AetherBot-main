// jsonembed.js
//
// Posts a message/embed from raw Discohook-exported JSON. Rebuilt from a
// snippet the user provided: same idea (paste Discohook JSON, bot posts
// it), but wired into Aether's actual conventions — the original used a
// non-existent `executeSlash` handler name (Aether's dispatcher calls
// `execute`, so as written it would never have actually run), no
// permission gate, and old-style `ephemeral: true` instead of the
// MessageFlags Aether uses elsewhere. Fixed all three, and added a cap on
// embed count/size since Discord itself will reject oversized payloads
// with a much less clear error otherwise.

import { PermissionFlagsBits, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { AetherError, ErrorTypes, replyUserError, handleInteractionError } from '../../../utils/errorHandler.js';
import { successEmbed } from '../../../utils/embeds.js';

const MAX_EMBEDS = 10; // Discord's own per-message embed cap

function extractPayload(parsed) {
    // Discohook exports vary: a raw { content, embeds } message, or a
    // { messages: [...] } backup/export containing one or more messages.
    if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
        const first = parsed.messages[0];
        return { content: first.content || null, embeds: first.embeds || [] };
    }
    return { content: parsed.content || null, embeds: parsed.embeds || [] };
}

export default {
    // .setName() here is discarded — tools.js sets the subcommand name from
    // the TOOL_MODULES key, matching every other module in this folder.
    data: new SlashCommandBuilder()
        .setName('jsonembed')
        .setDescription('Post a message/embed from raw Discohook JSON')
        .addStringOption((option) => option
            .setName('json')
            .setDescription('Paste your raw Discohook JSON here')
            .setRequired(true)),

    async execute(interaction) {
        try {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
                return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the **Manage Messages** permission to use this.' });
            }

            const jsonString = interaction.options.getString('json', true);

            let parsed;
            try {
                parsed = JSON.parse(jsonString);
            } catch (parseError) {
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `That's not valid JSON: ${parseError.message}` });
            }

            const { content, embeds } = extractPayload(parsed);

            if (!content && embeds.length === 0) {
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'That JSON has no `content` or `embeds` to post.' });
            }

            if (embeds.length > MAX_EMBEDS) {
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `Discord allows at most ${MAX_EMBEDS} embeds per message — that JSON has ${embeds.length}.` });
            }

            const perms = interaction.channel?.permissionsFor(interaction.client.user);
            if (!perms?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: "I need **Send Messages** and **Embed Links** permission in this channel." });
            }

            try {
                await interaction.channel.send({ content: content || undefined, embeds });
            } catch (sendError) {
                // Most likely cause: the JSON is structurally valid but fails
                // Discord's own embed schema (bad color type, url not a URL,
                // field name/value too long, etc.) — surface that directly
                // rather than a generic failure.
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `Discord rejected that payload: ${sendError.message}` });
            }

            await InteractionHelper.safeReply(interaction, { embeds: [successEmbed('Posted', 'Your embed has been sent.')], flags: MessageFlags.Ephemeral });
        } catch (error) {
            if (error instanceof AetherError) {
                return await replyUserError(interaction, { type: error.type || ErrorTypes.VALIDATION, message: error.userMessage || 'Something went wrong.' });
            }
            await handleInteractionError(interaction, error, { command: 'tools jsonembed' });
        }
    },
};
