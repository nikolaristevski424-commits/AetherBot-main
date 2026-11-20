import { MessageFlags } from 'discord.js';
import { isBotOwner } from '../../../config/bot.js';
import { createEmbed } from '../../../utils/embeds.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';

async function execute(interaction, client, args) {
    if (!isBotOwner(interaction.user.id)) {
        await interaction.reply({ content: 'This isn\'t for you.', flags: MessageFlags.Ephemeral });
        return;
    }

    const [originalMessageId] = args;
    const text = interaction.fields.getTextInputValue('followup_text');

    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const embed = createEmbed({
            title: '📝 Follow-up Update',
            description: text,
            color: 'info',
        });

        const options = { embeds: [embed] };
        if (originalMessageId) {
            options.reply = { messageReference: originalMessageId };
        }
        await interaction.channel.send(options);

        await interaction.editReply({ content: 'Follow-up posted.' });
    } catch (error) {
        logger.error('[developers] Failed to post status follow-up:', error);
        await handleInteractionError(interaction, error, { command: 'dev_status_followup_modal' });
    }
}

export default { name: 'dev_status_followup_modal', execute };
