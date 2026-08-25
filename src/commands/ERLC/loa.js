import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, AetherError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { successEmbed, infoEmbed, createEmbed } from '../../utils/embeds.js';
import { getErlcConfig } from '../../services/erlc/erlcService.js';
import { requestLoa, endLoa, listActiveLoas } from '../../services/erlc/erlcOperationsService.js';

// Split out from /erlc on request — LOA gets its own top-level command
// rather than living as a subcommand group there.

async function handleRequest(interaction) {
    const reason = interaction.options.getString('reason', true);
    const durationDays = interaction.options.getInteger('days') || null;

    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    await requestLoa(interaction.guildId, interaction.user.id, { reason, durationDays });

    const config = await getErlcConfig(interaction.guildId);
    if (config?.loaRoleId) {
        await interaction.member.roles.add(config.loaRoleId, 'LOA requested').catch(() => {});
    }

    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('LOA Submitted', durationDays ? `Active for ${durationDays} day(s). Use \`/loa end\` to return early.` : 'No end date set — use `/loa end` when you\'re back.')],
    });
}

async function handleEnd(interaction) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const ended = await endLoa(interaction.guildId, interaction.user.id);
    if (!ended) {
        return await InteractionHelper.safeReply(interaction, { embeds: [infoEmbed('No Active LOA', 'You don\'t have an active LOA.')] });
    }

    const config = await getErlcConfig(interaction.guildId);
    if (config?.loaRoleId) {
        await interaction.member.roles.remove(config.loaRoleId, 'LOA ended').catch(() => {});
    }

    await InteractionHelper.safeReply(interaction, { embeds: [successEmbed('Welcome Back', 'Your LOA has been ended.')] });
}

async function handleList(interaction) {
    await InteractionHelper.safeDefer(interaction);

    const active = await listActiveLoas(interaction.guildId);
    if (active.length === 0) {
        return await InteractionHelper.safeReply(interaction, { embeds: [infoEmbed('No Active LOAs', 'Nobody is currently on LOA.')] });
    }

    const lines = active.map((l) => `<@${l.userId}> — ${l.reason}${l.endsAt ? ` (back <t:${Math.floor(l.endsAt / 1000)}:R>)` : ' (no end date)'}`);
    await InteractionHelper.safeReply(interaction, { embeds: [createEmbed({ title: `Active LOAs (${active.length})`, description: lines.join('\n'), color: 'info' })] });
}

export default {
    data: new SlashCommandBuilder()
        .setName('loa')
        .setDescription('Leave of Absence for ER:LC staff')
        .addSubcommand((sub) => sub
            .setName('request')
            .setDescription('Request a Leave of Absence')
            .addStringOption((opt) => opt.setName('reason').setDescription('Reason for LOA').setRequired(true))
            .addIntegerOption((opt) => opt.setName('days').setDescription('Duration in days (leave blank for open-ended)').setMinValue(1).setMaxValue(365).setRequired(false)))
        .addSubcommand((sub) => sub
            .setName('end')
            .setDescription('End your active LOA early'))
        .addSubcommand((sub) => sub
            .setName('list')
            .setDescription('List everyone currently on LOA')),

    async execute(interaction) {
        try {
            switch (interaction.options.getSubcommand()) {
                case 'request': return await handleRequest(interaction);
                case 'end': return await handleEnd(interaction);
                case 'list': return await handleList(interaction);
            }
        } catch (error) {
            if (error instanceof AetherError) {
                return await replyUserError(interaction, { type: error.type || ErrorTypes.VALIDATION, message: error.userMessage || 'Something went wrong.' });
            }
            await handleInteractionError(interaction, error, { command: 'loa' });
        }
    },
};
