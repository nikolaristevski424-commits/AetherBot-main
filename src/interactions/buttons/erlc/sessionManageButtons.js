import { MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { AetherError, handleInteractionError } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';
import { getErlcConfig, getServerStatus } from '../../../services/erlc/erlcService.js';
import { startSession, attachSessionMessage, startSessionVote, shutdownSession, boostSession, getSessionState } from '../../../services/erlc/erlcOperationsService.js';
import { buildControlPanel } from '../../../commands/ERLC/sessionManage.js';
import { buildSessionAnnouncementPanel, buildSessionVotePanel, buildSessionShutdownPanel, buildSessionBoostPanel } from './erlcSessionButtons.js';

async function refreshPanel(interaction) {
    const state = await getSessionState(interaction.guildId);
    const panel = buildControlPanel({ active: !!state?.active, startedBy: state?.startedBy, startedAt: state?.startedAt });
    await interaction.editReply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
}

async function announce(interaction, guild, config, panel) {
    const channel = config?.sessionChannelId
        ? await guild.channels.fetch(config.sessionChannelId).catch(() => null)
        : interaction.channel;
    if (!channel) return null;
    return channel.send({ components: [panel], flags: MessageFlags.IsComponentsV2 });
}

async function handleStart(interaction) {
    await interaction.deferUpdate();
    const config = await getErlcConfig(interaction.guildId);
    const { state, roleId } = await startSession(interaction.guild, interaction.user.id);

    let joinKey = null;
    try {
        const status = await getServerStatus(interaction.guildId);
        joinKey = status?.JoinKey || null;
    } catch (error) {
        logger.warn(`[erlc] Could not fetch join code for session start: ${error.message}`);
    }

    const sent = await announce(interaction, interaction.guild, config, buildSessionAnnouncementPanel({ startedByUserId: state.startedBy, roleId, joinKey }));
    if (sent) await attachSessionMessage(interaction.guildId, sent.id);

    await refreshPanel(interaction);
}

async function handleVote(interaction) {
    await interaction.deferUpdate();
    const config = await getErlcConfig(interaction.guildId);
    const { vote, roleId } = await startSessionVote(interaction.guild, interaction.user.id, 5);
    await announce(interaction, interaction.guild, config, buildSessionVotePanel({ startedByUserId: vote.startedBy, voters: vote.voters, threshold: vote.threshold, roleId }));
    await refreshPanel(interaction);
}

async function handleBoost(interaction) {
    await interaction.deferUpdate();
    const config = await getErlcConfig(interaction.guildId);
    await boostSession(interaction.guildId);
    await announce(interaction, interaction.guild, config, buildSessionBoostPanel({ roleId: config?.sessionRoleId }));
    await refreshPanel(interaction);
}

async function handleShutdown(interaction) {
    await interaction.deferUpdate();
    const state = await shutdownSession(interaction.guildId);

    if (state.channelId && state.messageId) {
        const channel = await interaction.guild.channels.fetch(state.channelId).catch(() => null);
        const message = channel ? await channel.messages.fetch(state.messageId).catch(() => null) : null;
        if (message) {
            await message.edit({ components: [buildSessionShutdownPanel(state)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }

    await refreshPanel(interaction);
}

function wrap(handler, label) {
    return async (interaction) => {
        try {
            await handler(interaction);
        } catch (error) {
            if (error instanceof AetherError) {
                await interaction.followUp({ content: `❌ ${error.userMessage}`, flags: MessageFlags.Ephemeral }).catch(() => {});
                return;
            }
            logger.error(`[erlc] Unexpected error in session-manage "${label}":`, error);
            await handleInteractionError(interaction, error, { command: `session_manage_${label}` });
        }
    };
}

export default [
    { name: 'session_manage_start', execute: wrap(handleStart, 'start') },
    { name: 'session_manage_vote', execute: wrap(handleVote, 'vote') },
    { name: 'session_manage_boost', execute: wrap(handleBoost, 'boost') },
    { name: 'session_manage_shutdown', execute: wrap(handleShutdown, 'shutdown') },
];
