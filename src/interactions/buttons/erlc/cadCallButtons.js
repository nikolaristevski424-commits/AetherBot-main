import { MessageFlags } from 'discord.js';
import { getCadGuildAccess, getCadGuildConfig, assignCadCallUnit, closeCadCall } from '../../../services/cad/cadService.js';
import { buildCadCallAnnouncement } from '../../../services/cad/cadDiscordPresentation.js';

const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function act(interaction, client, [id], action) {
  if (!interaction.inGuild()) return interaction.reply({ content: 'CAD actions only work in a Discord server.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!validUuid.test(String(id || ''))) return interaction.editReply('Invalid dispatch call reference.');
  try {
    // Re-evaluate Discord roles for every button click, not when the alert was sent.
    const access = await getCadGuildAccess(client, interaction.user.id, interaction.guildId);
    if (!access?.canDispatch) return interaction.editReply('A dispatch role or Manage Server permission is required.');
    const actor = { id: interaction.user.id, username: interaction.user.username };
    let result;
    if (action === 'respond') {
      result = await assignCadCallUnit(interaction.guildId, actor, id, actor.id);
    } else {
      if (!access.isManager) return interaction.editReply('Only server managers can close a call from a Discord alert. Dispatchers can still respond.');
      result = await closeCadCall(interaction.guildId, actor, id);
    }
    if (!result) return interaction.editReply('This roleplay call no longer exists.');
    if (!result.changed) return interaction.editReply(action === 'respond'
      ? 'You are already assigned to this roleplay call.'
      : 'This roleplay call has already been closed.');
    const updated = result.call;
    const config = await getCadGuildConfig(interaction.guildId);
    // Always persist the update first. The channel message is an optional view.
    if (interaction.message?.editable) {
      await interaction.message.edit(buildCadCallAnnouncement(updated, config)).catch(() => {});
    }
    return interaction.editReply(action === 'respond'
      ? `✅ You are assigned to **${updated.title.slice(0,80)}** (#${updated.id.slice(0,8).toUpperCase()}). Open CAD for the full call.`
      : `✅ Closed roleplay call **#${updated.id.slice(0,8).toUpperCase()}**. The CAD audit log has been updated.`);
  } catch {
    return interaction.editReply('Could not complete that dispatch action. Check the server CAD connection and try again.');
  }
}

export default [
  { name: 'aether_cad_respond', execute: (interaction, client, args) => act(interaction, client, args, 'respond') },
  { name: 'aether_cad_dismiss', execute: (interaction, client, args) => act(interaction, client, args, 'dismiss') },
];
