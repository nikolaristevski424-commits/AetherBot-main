import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { createDiscord911Call, getCadGuildConfig } from '../../services/cad/cadService.js';

/** Roleplay-only emergency report, not a real-world emergency service. */
export default {
  data: new SlashCommandBuilder()
    .setName('911').setDescription('Create an ER:LC ROLEPLAY 911 call in Aether CAD (not real emergencies).')
    .setDMPermission(false)
    .addStringOption(o => o.setName('incident').setDescription('What happened? (5–100 characters)').setMinLength(5).setMaxLength(100).setRequired(true))
    .addStringOption(o => o.setName('location').setDescription('In-game street name or postal (3–100 characters)').setMinLength(3).setMaxLength(100).setRequired(true))
    .addStringOption(o => o.setName('details').setDescription('Describe the situation (10–1,000 characters)').setMinLength(10).setMaxLength(1000).setRequired(true))
    .addNumberOption(o => o.setName('x').setDescription('Optional ER:LC in-game X coordinate').setMinValue(-2677.5).setMaxValue(2677.5))
    .addNumberOption(o => o.setName('z').setDescription('Optional ER:LC in-game Z coordinate').setMinValue(-2677.5).setMaxValue(2677.5)),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: 'Use this in a Discord server.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const x = interaction.options.getNumber('x');
      const z = interaction.options.getNumber('z');
      if ((x === null) !== (z === null)) throw new Error('Provide both X and Z coordinates or leave both empty.');
      const input = {
        title: interaction.options.getString('incident', true),
        location: interaction.options.getString('location', true),
        details: interaction.options.getString('details', true),
        ...(x === null ? {} : { x, z }),
      };
      const actor = { id: interaction.user.id, username: interaction.user.username };
      const call = await createDiscord911Call(interaction.guildId, actor, input);
      let dispatchedToChannel = false;
      try {
        const config = await getCadGuildConfig(interaction.guildId);
        const channel = config.dispatchChannelId ? await interaction.guild.channels.fetch(config.dispatchChannelId).catch(() => null) : null;
        if (channel?.isTextBased?.() && channel.send) {
          const embed = new EmbedBuilder().setColor(0xe35a54)
            .setTitle(`ROLEPLAY 911 · ${call.id.slice(0, 8).toUpperCase()}`)
            .addFields(
              { name: 'Incident', value: call.title },
              { name: 'Location', value: call.location },
              { name: 'Details', value: call.details.slice(0, 1000) },
            ).setFooter({ text: 'ER:LC roleplay dispatch only • Aether CAD' }).setTimestamp();
          await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
          dispatchedToChannel = true;
        }
      } catch { /* CAD stores the report even when dispatch channel delivery fails. */ }
      return interaction.editReply({ content: `✅ **ER:LC roleplay report submitted** — case **${call.id.slice(0, 8).toUpperCase()}**.\nLocation: **${call.location}**\n${dispatchedToChannel ? 'Dispatch channel notified.' : 'Recorded in CAD. A dispatcher can review it with \`/cad calls\`.'}\n\n**Real emergency? Call your local emergency services. This command is only for the Roblox roleplay game.**`, allowedMentions: { parse: [] } });
    } catch (error) {
      return interaction.editReply({ content: `Could not submit roleplay report: ${String(error?.message || 'Unknown error').slice(0, 250)}`, allowedMentions: { parse: [] } });
    }
  },
};
