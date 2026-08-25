import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, AetherError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { successEmbed } from '../../utils/embeds.js';
import { getErlcConfig } from '../../services/erlc/erlcService.js';
import { startSession, attachSessionMessage, shutdownSession, startSessionVote } from '../../services/erlc/erlcOperationsService.js';
import { buildSessionAnnouncementPanel, buildSessionVotePanel, buildSessionShutdownPanel } from '../../interactions/buttons/erlc/erlcSessionButtons.js';

// Split out from /erlc on request — session management gets its own
// top-level command rather than living as a subcommand group there.

function requireManageGuild(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        throw new AetherError('session: missing permission', ErrorTypes.PERMISSION,
            'You need the **Manage Server** permission to use this.');
    }
}

async function handleStart(interaction) {
    requireManageGuild(interaction);
    await InteractionHelper.safeDefer(interaction);

    const { state, roleId } = await startSession(interaction.guild, interaction.user.id);
    const config = await getErlcConfig(interaction.guildId);
    const panel = buildSessionAnnouncementPanel({ startedByUserId: state.startedBy, roleId });

    const channel = config?.sessionChannelId
        ? await interaction.guild.channels.fetch(config.sessionChannelId).catch(() => null)
        : interaction.channel;

    if (!channel) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Could not find the configured session channel. Set one with `/erlc setup`.' });
    }

    const sent = await channel.send({ components: [panel], flags: MessageFlags.IsComponentsV2 });
    await attachSessionMessage(interaction.guildId, sent.id);

    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Session Started', channel.id === interaction.channelId ? 'Announced above.' : `Announced in <#${channel.id}>.`)],
    });
}

async function handleVote(interaction) {
    const threshold = interaction.options.getInteger('threshold') || 5;
    await InteractionHelper.safeDefer(interaction);

    const config = await getErlcConfig(interaction.guildId);
    const { vote, roleId } = await startSessionVote(interaction.guild, interaction.user.id, threshold);
    const panel = buildSessionVotePanel({ startedByUserId: vote.startedBy, voters: vote.voters, threshold: vote.threshold, roleId });

    const channel = config?.sessionChannelId
        ? await interaction.guild.channels.fetch(config.sessionChannelId).catch(() => null)
        : interaction.channel;

    if (channel) {
        await channel.send({ components: [panel], flags: MessageFlags.IsComponentsV2 });
    }

    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Vote Started', `Needs ${threshold} votes to auto-start a session.${channel && channel.id !== interaction.channelId ? ` Posted in <#${channel.id}>.` : ''}`)],
    });
}

async function handleShutdown(interaction) {
    requireManageGuild(interaction);
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const state = await shutdownSession(interaction.guildId);

    if (state.channelId && state.messageId) {
        const channel = await interaction.guild.channels.fetch(state.channelId).catch(() => null);
        const message = channel ? await channel.messages.fetch(state.messageId).catch(() => null) : null;
        if (message) {
            await message.edit({ components: [buildSessionShutdownPanel(state)] }).catch(() => {});
        }
    }

    await InteractionHelper.safeReply(interaction, { embeds: [successEmbed('Session Ended', 'Marked as no longer active.')] });
}

export default {
    data: new SlashCommandBuilder()
        .setName('session')
        .setDescription('ER:LC roleplay session management')
        .addSubcommand((sub) => sub
            .setName('start')
            .setDescription('Announce that a session is starting (staff only)'))
        .addSubcommand((sub) => sub
            .setName('vote')
            .setDescription('Start a vote to gauge interest in a session')
            .addIntegerOption((opt) => opt
                .setName('threshold')
                .setDescription('Votes needed to auto-start (default 5)')
                .setMinValue(2).setMaxValue(50).setRequired(false)))
        .addSubcommand((sub) => sub
            .setName('shutdown')
            .setDescription('Mark the active session as ended (staff only)')),

    async execute(interaction) {
        try {
            switch (interaction.options.getSubcommand()) {
                case 'start': return await handleStart(interaction);
                case 'vote': return await handleVote(interaction);
                case 'shutdown': return await handleShutdown(interaction);
            }
        } catch (error) {
            if (error instanceof AetherError) {
                return await replyUserError(interaction, { type: error.type || ErrorTypes.VALIDATION, message: error.userMessage || 'Something went wrong.' });
            }
            await handleInteractionError(interaction, error, { command: 'session' });
        }
    },
};
