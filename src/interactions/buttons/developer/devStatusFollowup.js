import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { isBotOwner } from '../../../config/bot.js';
import { logger } from '../../../utils/logger.js';

async function execute(interaction) {
    // The command that posted this button is developer-only, but the
    // button itself sits on a public message anyone in the channel can
    // click — the check has to be re-applied here, not just at /developers.
    if (!isBotOwner(interaction.user.id)) {
        await interaction.reply({ content: 'This isn\'t for you.', ephemeral: true });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`dev_status_followup_modal:${interaction.message.id}`)
        .setTitle('Post Follow-up Update')
        .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('followup_text')
                .setLabel('Update text')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1500),
        ));

    await interaction.showModal(modal);
}

export default [{ name: 'dev_status_followup', execute }];
