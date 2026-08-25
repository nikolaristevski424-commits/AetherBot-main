import {
    ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';
import { castSessionVote, startSession, attachSessionMessage, getSessionState } from '../../../services/erlc/erlcOperationsService.js';
import { getErlcConfig } from '../../../services/erlc/erlcService.js';
import { AetherError, handleInteractionError } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';

export function buildSessionAnnouncementPanel({ startedByUserId, roleId }) {
    const container = new ContainerBuilder();
    const lines = ['## 🟢 Session Starting'];
    if (roleId) lines.push(`<@&${roleId}>`);
    lines.push(
        '',
        `Started by <@${startedByUserId}>.`,
        'Join in-game now! Use `/erlc status` for the current join code.',
    );
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    return container;
}

export function buildSessionShutdownPanel({ startedByUserId, startedAt }) {
    const container = new ContainerBuilder();
    const durationMin = Math.round((Date.now() - startedAt) / 60000);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
        '## 🔴 Session Ended',
        `Session started by <@${startedByUserId}> has ended (ran ~${durationMin} min).`,
    ].join('\n')));
    return container;
}

export function buildSessionVotePanel({ startedByUserId, voters, threshold, roleId }) {
    const container = new ContainerBuilder();
    const lines = ['## 🗳️ Session Vote'];
    if (roleId) lines.push(`<@&${roleId}>`);
    lines.push(
        '',
        `<@${startedByUserId}> wants to start a session — vote to help make it happen!`,
        `**${voters.length}/${threshold}** votes`,
    );
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('erlc_session_vote').setLabel('Vote').setEmoji('🗳️').setStyle(ButtonStyle.Primary),
    ));
    return container;
}

async function vote(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const result = await castSessionVote(interaction.guildId, interaction.user.id);

        if (result.alreadyVoted) {
            await interaction.editReply({ content: 'You already voted on this session.' });
            return;
        }

        if (result.reachedThreshold) {
            const config = await getErlcConfig(interaction.guildId);
            const { state, roleId } = await startSession(interaction.guild, result.vote.startedBy);

            const panel = (await import('./erlcSessionButtons.js')).buildSessionAnnouncementPanel({
                startedByUserId: state.startedBy, roleId,
            });

            const channel = config?.sessionChannelId
                ? await interaction.guild.channels.fetch(config.sessionChannelId).catch(() => null)
                : interaction.channel;

            if (channel) {
                const sent = await channel.send({ components: [panel], flags: MessageFlags.IsComponentsV2 });
                await attachSessionMessage(interaction.guildId, sent.id);
            }

            if (interaction.message) {
                await interaction.message.edit({
                    components: [new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent('## ✅ Vote threshold reached — session started!'),
                    )],
                }).catch(() => {});
            }

            await interaction.editReply({ content: 'Vote recorded — threshold reached, session started!' });
            return;
        }

        if (interaction.message) {
            await interaction.message.edit({
                components: [buildSessionVotePanel({
                    startedByUserId: result.vote.startedBy,
                    voters: result.vote.voters,
                    threshold: result.vote.threshold,
                })],
            }).catch(() => {});
        }
        await interaction.editReply({ content: `Vote recorded (${result.vote.voters.length}/${result.vote.threshold}).` });
    } catch (error) {
        if (error instanceof AetherError) {
            await interaction.editReply({ content: `❌ ${error.userMessage}` });
            return;
        }
        logger.error('[erlc] Unexpected error casting session vote:', error);
        await handleInteractionError(interaction, error, { command: 'erlc_session_vote' });
    }
}

export default [
    { name: 'erlc_session_vote', execute: vote },
];
