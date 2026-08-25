import { MessageFlags, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { completeVerification } from '../../../services/roblox/robloxVerificationService.js';
import { buildUsernameModal } from '../../modals/roblox/robloxUsernameModal.js';
import { AetherError, handleInteractionError } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';

async function startOrRestart(interaction) {
    return interaction.showModal(buildUsernameModal());
}

function notVerifiedYetPanel() {
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
        '## Not Verified Yet',
        'I couldn\'t find your verification phrase in your Roblox profile description.',
        '',
        'Make sure you saved the change on Roblox, wait a few seconds for it to propagate, then try again.',
    ].join('\n')));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('roblox_verify_done').setLabel('Check Again').setStyle(ButtonStyle.Primary),
    ));
    return container;
}

function verifiedPanel(result) {
    const container = new ContainerBuilder();
    const lines = [
        '## ✅ Verification Complete',
        `Your Discord account is now linked to **${result.profile.robloxUsername}**.`,
        '',
        result.role ? `Verified role: <@&${result.role.id}>` : '⚠️ Could not assign the verified role — contact staff.',
        `Roblox User ID: \`${result.profile.robloxUserId}\``,
    ];
    if (result.groupSync?.added?.length) {
        lines.push('', `Group roles added: ${result.groupSync.added.map((id) => `<@&${id}>`).join(', ')}`);
    }
    lines.push('', 'You may now remove the verification phrase from your Roblox description.');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
    return container;
}

async function done(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const result = await completeVerification(interaction.guild, member);

        if (!result.verified) {
            await interaction.editReply({ components: [notVerifiedYetPanel()], flags: MessageFlags.IsComponentsV2 });
            return;
        }

        await interaction.editReply({ components: [verifiedPanel(result)], flags: MessageFlags.IsComponentsV2 });
    } catch (error) {
        if (error instanceof AetherError) {
            await interaction.editReply({ content: `❌ ${error.userMessage}` });
            return;
        }
        logger.error('[roblox] Unexpected error completing verification:', error);
        await handleInteractionError(interaction, error, { command: 'roblox_verify_done' });
    }
}

export default [
    { name: 'roblox_verify_start', execute: startOrRestart },
    { name: 'roblox_verify_restart', execute: startOrRestart },
    { name: 'roblox_verify_done', execute: done },
];
