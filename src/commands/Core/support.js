import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("Get link to the support server"),

  async execute(interaction, guildConfig, client) {
    try {
      const supportUrl = interaction.client?.config?.links?.supportServer;

      if (!supportUrl) {
        await InteractionHelper.safeReply(interaction, {
          embeds: [
            createEmbed({ title: "Need Help?", description: "No support server is configured for this bot yet. Set `SUPPORT_SERVER_URL` in your environment to enable this command." }),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const supportButton = new ButtonBuilder()
        .setLabel("Join Support Server")
        .setStyle(ButtonStyle.Link)
        .setURL(supportUrl);

      const actionRow = new ActionRowBuilder().addComponents(supportButton);

      await InteractionHelper.safeReply(interaction, {
        embeds: [
          createEmbed({ title: "Need Help?", description: "Join our official support server for assistance, report bugs, or suggest features." }),
        ],
        components: [actionRow],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('Support command error:', error);
      
      try {
        return await InteractionHelper.safeReply(interaction, {
          embeds: [createEmbed({ title: 'System Error', description: 'Could not display support information.', color: 'error' })],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  },
};