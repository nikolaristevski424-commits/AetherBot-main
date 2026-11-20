import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { createReportThread } from '../../../services/bugreports/bugReportService.js';
import { createEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';

const MODAL_ID = 'bug_report_modal';

export function buildBugReportModal() {
    return new ModalBuilder()
        .setCustomId(MODAL_ID)
        .setTitle('Report a Bug')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('title').setLabel('Short summary').setStyle(TextInputStyle.Short).setMaxLength(90).setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('description').setLabel('What happened? (80+ characters)').setStyle(TextInputStyle.Paragraph).setMaxLength(1800).setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('steps').setLabel('Steps to reproduce (optional)').setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(false),
            ),
        );
}

export default {
    name: MODAL_ID,
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const title = interaction.fields.getTextInputValue('title');
        const description = interaction.fields.getTextInputValue('description');
        const steps = interaction.fields.getTextInputValue('steps') || null;

        try {
            const { thread } = await createReportThread(interaction.client, {
                title, description, steps, reporterId: interaction.user.id,
            });

            await interaction.editReply({
                embeds: [createEmbed({
                    title: '✅ Report Submitted',
                    description: `Thanks — your report has been posted: ${thread}\n\nStay available in that thread in case the team needs more info.`,
                    color: 'success',
                })],
            });
        } catch (error) {
            logger.error('[bugreports] Failed to create report thread:', error);
            await interaction.editReply({
                content: '❌ Something went wrong submitting your report. The bug reporting system may not be configured yet — let staff know directly.',
            });
        }
    },
};
