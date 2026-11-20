import {
    ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
    ContainerBuilder, TextDisplayBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} from 'discord.js';
import { beginVerification } from '../../../services/roblox/robloxVerificationService.js';
import { AetherError, handleInteractionError } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';

const MODAL_ID = 'roblox_username_modal';

export function buildUsernameModal() {
    const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle('Link Roblox Account');
    const usernameInput = new TextInputBuilder()
        .setCustomId('roblox_username')
        .setLabel('Roblox username')
        .setPlaceholder('Enter your exact Roblox username')
        .setStyle(TextInputStyle.Short)
        .setMinLength(3)
        .setMaxLength(20)
        .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(usernameInput));
    return modal;
}

function instructionPanel(record) {
    const container = new ContainerBuilder();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
        '## Roblox Verification Code',
        `Roblox account: **${record.robloxUsername}**`,
        '',
        'Copy this exact phrase into your Roblox **About / Description**:',
        '',
        `### ${record.phrase}`,
        '',
        'After saving your Roblox profile, come back and click **Done**.',
        'You can remove the phrase afterwards.',
    ].join('\n')));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('roblox_verify_done').setLabel('Done').setEmoji('🔎').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('roblox_verify_restart').setLabel('New Code').setStyle(ButtonStyle.Secondary),
    ));
    return container;
}

export default {
    name: MODAL_ID,
    async execute(interaction) {
        const username = interaction.fields.getTextInputValue('roblox_username');
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const record = await beginVerification(interaction.guildId, interaction.user.id, username);
            await interaction.editReply({ components: [instructionPanel(record)], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            if (error instanceof AetherError) {
                await interaction.editReply({ content: `❌ ${error.userMessage}` });
                return;
            }
            logger.error('[roblox] Unexpected error starting verification:', error);
            await handleInteractionError(interaction, error, { command: 'roblox_link_modal' });
        }
    },
};
