import { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getReportState, setReportStatus } from '../../../services/bugreports/bugReportService.js';
import { createEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';

function isDeveloper(interaction) {
    const devRoleId = process.env.BUG_REPORT_DEV_ROLE_ID;
    if (!devRoleId) return false;
    return interaction.member?.roles?.cache?.has(devRoleId);
}

export function buildStatusButtonsRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bugreport_fix_planned').setLabel('Fix Planned').setEmoji('🔧').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bugreport_fixed').setLabel('Bug Fixed').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('bugreport_denied').setLabel('Deny').setEmoji('✖️').setStyle(ButtonStyle.Danger),
    );
}

async function handleStatus(interaction, status, { title, description, color, lockThread }) {
    if (!isDeveloper(interaction)) {
        await interaction.reply({ content: 'This is for the dev team only.', flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply();

    const state = await setReportStatus(interaction.channelId, status);
    if (!state) {
        await interaction.editReply({ content: 'Could not find a tracked report for this thread.' });
        return;
    }

    await interaction.editReply({
        embeds: [createEmbed({
            title, description, color,
            footer: lockThread ? `Support Team • Bug Reports | Your thread has been locked.` : 'Support Team • Bug Reports',
        })],
    });

    if (lockThread && interaction.channel?.setLocked) {
        await interaction.channel.setLocked(true, `Bug report ${status}`).catch((error) => {
            logger.warn(`[bugreports] Failed to lock thread ${interaction.channelId}: ${error.message}`);
        });
    }
}

export default [
    {
        name: 'bugreport_fix_planned',
        execute: (interaction) => handleStatus(interaction, 'fix_planned', {
            title: '🔧 Fix Planned',
            description: 'Your bug report has been reviewed and is in progress to be fixed!\n\nYou don\'t need to take any further action. We\'ll work on resolving this issue.',
            color: 'info',
            lockThread: false,
        }),
    },
    {
        name: 'bugreport_fixed',
        execute: (interaction) => handleStatus(interaction, 'fixed', {
            title: '✅ Bug Fixed',
            description: 'A fix has been applied for this bug.\n\nThank you for reporting this issue — your report helped us improve the experience for everyone.',
            color: 'success',
            lockThread: true,
        }),
    },
    {
        name: 'bugreport_denied',
        execute: (interaction) => handleStatus(interaction, 'denied', {
            title: '✖️ Bug Report Denied',
            description: 'This bug report has been reviewed and denied by the support team.\n\nThis may be because the issue could not be reproduced, was working as intended, or lacked sufficient information.\nIf you have additional information, feel free to submit a new report.',
            color: 'error',
            lockThread: true,
        }),
    },
];
