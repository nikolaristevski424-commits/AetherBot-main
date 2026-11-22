import { MessageFlags } from 'discord.js';
import { getCadGuildAccess, getCadState, getCadGuildConfig, updateCadCall } from '../../../services/cad/cadService.js';
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
    const state = await getCadState(interaction.guildId);
    const call = state.calls.find(entry => entry.id === id);
    if (!call) return interaction.editReply('This roleplay call no longer exists.');
    if (call.status === 'closed') return interaction.editReply('This roleplay call is already closed.');
    const actor = { id: interaction.user.id, username: interaction.user.username };
    let patch;
    if (action === 'respond') {
      const unit = state.units.find(entry => entry.userId === actor.id && entry.status !== 'off_duty');
      if (!unit) return interaction.editReply('Register as an on-duty officer using `/cad unit` before responding.');
      patch = { status: 'assigned', assignedUnitIds: [...new Set([...(call.assignedUnitIds || []), actor.id])] };
    } else {
      // Closing a call is reserved for a server manager. Any on-duty dispatcher
      // can respond, but arbitrary responders cannot dismiss other people's calls.
      if (!access.isManager) return interaction.editReply('Only server managers can close a call from the Discord alert. Dispatchers can use their CAD role to respond.');
      patch = { status: 'closed' };
    }
    const updated = await updateCadCall(interaction.guildId, actor, id, patch);
    if (!updated) return interaction.editReply('The call could not be found or updated.');
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
