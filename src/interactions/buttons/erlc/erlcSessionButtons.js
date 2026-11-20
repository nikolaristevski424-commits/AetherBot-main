import {
    ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SeparatorBuilder, MessageFlags,
} from 'discord.js';
import { castSessionVote, startSession, attachSessionMessage, getSessionState, boostSession } from '../../../services/erlc/erlcOperationsService.js';
import { getServerStatus, getErlcConfig } from '../../../services/erlc/erlcService.js';
import { AetherError, handleInteractionError } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';

// ER:LC private servers don't support a one-click "deep link" straight into
// a specific server — Roblox requires entering the join code manually via
// the in-game SERVERS menu. This links to the game itself and displays the
// code prominently to copy in, which is the actual working flow.
const ERLC_GAME_URL = 'https://www.roblox.com/games/2534724415/Emergency-Response-Liberty-County';

export function buildSessionAnnouncementPanel({ startedByUserId, roleId, joinKey }) {
    const container = new ContainerBuilder().setAccentColor(0x57F287);
    const lines = ['## 🟢  Session is Live!'];
    if (roleId) lines.push(`<@&${roleId}>`);
    lines.push('', `Started by <@${startedByUserId}> — come join in-game!`);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

    if (joinKey) {
        container.addSeparatorComponents(new SeparatorBuilder());
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Join Code**\n\`\`\`${joinKey}\`\`\`\nOpen the game, go to **MENU → SERVERS**, and paste this code.`,
        ));
    }

    const buttons = [];
    if (joinKey) buttons.push(new ButtonBuilder().setLabel('Open ER:LC').setStyle(ButtonStyle.Link).setURL(ERLC_GAME_URL));
    if (roleId) buttons.push(new ButtonBuilder().setCustomId('erlc_notify_toggle').setLabel('Notify Me For Sessions').setEmoji('🔔').setStyle(ButtonStyle.Secondary));
    if (buttons.length) container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons));

    return container;
}

export function buildSessionShutdownPanel({ startedByUserId, startedAt }) {
    const container = new ContainerBuilder().setAccentColor(0xED4245);
    const durationMin = Math.round((Date.now() - startedAt) / 60000);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
        '## 🔴  Session Ended',
        `Session started by <@${startedByUserId}> has ended — ran about ${durationMin} minute(s). Thanks for playing!`,
    ].join('\n')));
    return container;
}

export function buildSessionVotePanel({ startedByUserId, voters, threshold, roleId }) {
    const container = new ContainerBuilder().setAccentColor(0x3498DB);
    const lines = ['## 🗳️  Session Vote'];
    if (roleId) lines.push(`<@&${roleId}>`);
    lines.push('', `<@${startedByUserId}> wants to start a session — vote to help make it happen!`);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${voters.length} / ${threshold} votes`));
    const voteButtons = [new ButtonBuilder().setCustomId('erlc_session_vote').setLabel('Vote').setEmoji('🗳️').setStyle(ButtonStyle.Primary)];
    if (roleId) voteButtons.push(new ButtonBuilder().setCustomId('erlc_notify_toggle').setLabel('Notify Me For Sessions').setEmoji('🔔').setStyle(ButtonStyle.Secondary));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(...voteButtons));
    return container;
}

export function buildSessionEndedVotePanel() {
    const container = new ContainerBuilder().setAccentColor(0x99AAB5);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🗳️  Vote Ended\nThis vote is no longer active.'));
    return container;
}

export function buildSessionBoostPanel({ roleId }) {
    const container = new ContainerBuilder().setAccentColor(0xFEE75C);
    const lines = ['## 📢  Session Needs More Players!'];
    if (roleId) lines.push(`<@&${roleId}>`);
    lines.push('', 'The session is running but could use a few more people — come join in!');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
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

            let joinKey = null;
            try {
                const status = await getServerStatus(interaction.guildId);
                joinKey = status?.JoinKey || null;
            } catch {
                // Non-fatal — announcement still posts, just without the join code.
            }

            const panel = buildSessionAnnouncementPanel({ startedByUserId: state.startedBy, roleId, joinKey });

            const channel = config?.sessionChannelId
                ? await interaction.guild.channels.fetch(config.sessionChannelId).catch(() => null)
                : interaction.channel;

            if (channel) {
                const sent = await channel.send({ components: [panel], flags: MessageFlags.IsComponentsV2 });
                await attachSessionMessage(interaction.guildId, sent.id);
            }

            if (interaction.message) {
                await interaction.message.edit({ components: [buildSessionEndedVotePanel()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
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
                flags: MessageFlags.IsComponentsV2,
            }).catch(() => {});
        }
        await interaction.editReply({ content: `Vote recorded (${result.vote.voters.length}/${result.vote.threshold}).` });
    } catch (error) {
        if (error instanceof AetherError) {
            // A stale/expired vote is expected, not a bug — update the panel
            // to say so instead of leaving a dead button behind.
            if (interaction.message) {
                await interaction.message.edit({ components: [buildSessionEndedVotePanel()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            }
            await interaction.editReply({ content: `❌ ${error.userMessage}` });
            return;
        }
        logger.error('[erlc] Unexpected error casting session vote:', error);
        await handleInteractionError(interaction, error, { command: 'erlc_session_vote' });
    }
}

async function toggleNotify(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const config = await getErlcConfig(interaction.guildId);
        if (!config?.sessionRoleId) {
            await interaction.editReply({ content: 'No session notification role is configured for this server.' });
            return;
        }

        const member = await interaction.guild.members.fetch(interaction.user.id);
        const hasRole = member.roles.cache.has(config.sessionRoleId);

        if (hasRole) {
            await member.roles.remove(config.sessionRoleId, 'Opted out of session notifications');
            await interaction.editReply({ content: '🔕 You will no longer be pinged for sessions.' });
        } else {
            await member.roles.add(config.sessionRoleId, 'Opted in to session notifications');
            await interaction.editReply({ content: '🔔 You will now be pinged when a session starts.' });
        }
    } catch (error) {
        logger.error('[erlc] Failed to toggle session notification role:', error);
        await interaction.editReply({ content: '❌ Could not update your notification role — I may be missing permission to manage that role.' });
    }
}

export default [
    { name: 'erlc_session_vote', execute: vote },
    { name: 'erlc_notify_toggle', execute: toggleNotify },
];
