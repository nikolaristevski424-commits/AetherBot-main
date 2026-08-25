import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, AetherError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { successEmbed, infoEmbed, createEmbed } from '../../utils/embeds.js';
import { getErlcConfig } from '../../services/erlc/erlcService.js';
import { startShift, endShift, getShiftLeaderboard } from '../../services/erlc/erlcOperationsService.js';

// Split out from /erlc on request — duty shifts get their own top-level
// command rather than living as a subcommand group there.

function fmt(ms) {
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

async function handleStart(interaction) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    await startShift(interaction.guildId, interaction.user.id);

    const config = await getErlcConfig(interaction.guildId);
    if (config?.onDutyRoleId) {
        await interaction.member.roles.add(config.onDutyRoleId, 'Shift started').catch(() => {});
    }

    await InteractionHelper.safeReply(interaction, { embeds: [successEmbed('Shift Started', 'Use `/shift end` when you\'re done.')] });
}

async function handleEnd(interaction) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const { durationMs, totalMs } = await endShift(interaction.guildId, interaction.user.id);

    const config = await getErlcConfig(interaction.guildId);
    if (config?.onDutyRoleId) {
        await interaction.member.roles.remove(config.onDutyRoleId, 'Shift ended').catch(() => {});
    }

    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Shift Ended', `This shift: ${fmt(durationMs)}\nTotal tracked: ${fmt(totalMs)}`)],
    });
}

async function handleLeaderboard(interaction) {
    await InteractionHelper.safeDefer(interaction);

    const board = await getShiftLeaderboard(interaction.guildId, 10);
    if (board.length === 0) {
        return await InteractionHelper.safeReply(interaction, { embeds: [infoEmbed('No Shifts Logged', 'No completed shifts yet.')] });
    }

    const lines = board.map((e, i) => `**${i + 1}.** <@${e.userId}> — ${fmt(e.totalMs)}`);
    await InteractionHelper.safeReply(interaction, { embeds: [createEmbed({ title: 'Shift Leaderboard', description: lines.join('\n'), color: 'info' })] });
}

export default {
    data: new SlashCommandBuilder()
        .setName('shift')
        .setDescription('ER:LC staff duty shift tracking')
        .addSubcommand((sub) => sub
            .setName('start')
            .setDescription('Clock in for a duty shift'))
        .addSubcommand((sub) => sub
            .setName('end')
            .setDescription('Clock out and log your shift time'))
        .addSubcommand((sub) => sub
            .setName('leaderboard')
            .setDescription('See top staff by tracked duty time')),

    async execute(interaction) {
        try {
            switch (interaction.options.getSubcommand()) {
                case 'start': return await handleStart(interaction);
                case 'end': return await handleEnd(interaction);
                case 'leaderboard': return await handleLeaderboard(interaction);
            }
        } catch (error) {
            if (error instanceof AetherError) {
                return await replyUserError(interaction, { type: error.type || ErrorTypes.VALIDATION, message: error.userMessage || 'Something went wrong.' });
            }
            await handleInteractionError(interaction, error, { command: 'shift' });
        }
    },
};
