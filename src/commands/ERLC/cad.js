import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, EmbedBuilder } from 'discord.js';
import { getCadState, getCadGuildAccess, getCadGuildConfig, setCadGuildConfig, updateCadUnit, updateCadCall } from '../../services/cad/cadService.js';
import { findCallByReference } from '../../services/cad/dispatchCore.js';

function cadUrl() {
  const input = process.env.CAD_PUBLIC_URL || process.env.CAD_REDIRECT_URI || '';
  try {
    const parsed = new URL(input);
    return parsed.protocol === 'https:' ? `${parsed.origin}/cad/` : null;
  } catch { return null; }
}
const statuses = [
  { name:'Available', value:'available' }, { name:'Busy',value:'busy' },
  { name:'On scene',value:'on_scene' }, { name:'Off duty',value:'off_duty' },
];
function errorText(e) { return String(e?.message || 'Operation failed.').slice(0, 200); }
const createCallRow = c => `**${c.id.slice(0, 8).toUpperCase()}** · ${c.status.toUpperCase()} · ${c.priority === 'urgent' ? '🔴' : '🔵'} ${c.title.slice(0, 80)}\n↳ ${c.location.slice(0, 90)}${c.source === 'erlc_911' ? ' · ER:LC 911' : ''}`;

export default {
  data: new SlashCommandBuilder()
    .setName('cad').setDescription('Aether CAD dispatch, calls, units and ER:LC map.').setDMPermission(false)
    .addSubcommand(c => c.setName('dashboard').setDescription('Open the authenticated Aether CAD website.'))
    .addSubcommand(c => c.setName('map').setDescription('Open live ER:LC position map (dispatchers only).'))
    .addSubcommand(c => c.setName('calls').setDescription('List active dispatch/911 calls.'))
    .addSubcommand(c => c.setName('unit').setDescription('Set your on-duty callsign and dispatch status.')
      .addStringOption(o => o.setName('status').setDescription('Your status').addChoices(...statuses).setRequired(true))
      .addStringOption(o => o.setName('callsign').setDescription('Unit callsign (e.g. 1-Adam-12)').setMinLength(1).setMaxLength(24)))
    .addSubcommand(c => c.setName('respond').setDescription('Assign yourself to a call (requires on-duty unit).')
      .addStringOption(o => o.setName('case').setDescription('Case ID: first 8 characters shown in /cad calls').setMinLength(8).setRequired(true)))
    .addSubcommand(c => c.setName('assign').setDescription('Dispatch a registered unit to a call.')
      .addStringOption(o => o.setName('case').setDescription('Case ID: first 8 characters').setMinLength(8).setRequired(true))
      .addUserOption(o => o.setName('officer').setDescription('Registered CAD unit').setRequired(true)))
    .addSubcommand(c => c.setName('close').setDescription('Close a completed dispatch call.')
      .addStringOption(o => o.setName('case').setDescription('Case ID: first 8 characters').setMinLength(8).setRequired(true)))
    .addSubcommand(c => c.setName('dispatch-channel').setDescription('Set where roleplay /911 reports are announced (Manage Server only).')
      .addChannelOption(o => o.setName('channel').setDescription('Dispatch text channel').addChannelTypes(ChannelType.GuildText).setRequired(true))),
  async execute(interaction, config, client) {
    if (!interaction.inGuild()) return interaction.reply({ content:'Run this in a server.', flags:MessageFlags.Ephemeral });
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    try {
      const sub = interaction.options.getSubcommand(true);
      const access = await getCadGuildAccess(client, interaction.user.id, interaction.guildId);
      if (!access) return interaction.editReply('Your account does not have access to this server.');
      if (sub === 'dispatch-channel') {
        if (!access.isManager) return interaction.editReply('Manage Server permission required.');
        const channel = interaction.options.getChannel('channel',true);
        const saved = await setCadGuildConfig(interaction.guildId,{ dispatchChannelId:channel.id });
        return interaction.editReply(`✅ Roleplay 911 reports will be sent to <#${saved.dispatchChannelId}>.`);
      }
      if (!access.canDispatch) return interaction.editReply('You need a CAD dispatch role, or Manage Server, to use these tools.');
      if (sub === 'dashboard' || sub === 'map') {
        const url=cadUrl();
        return interaction.editReply(url
          ? `**Aether CAD** — ${url}${sub === 'map' ? '\nOpen the **Live Map** section to see ER:LC player locations.' : ''}\nDiscord sign-in and your server's CAD roles are required.`
          : 'The bot CAD website is not configured for public HTTPS access yet. Set `CAD_REDIRECT_URI` and configure Discord OAuth.');
      }
      if (sub === 'calls') {
        const state=await getCadState(interaction.guildId);
        const calls=state.calls.filter(c=>c.status !== 'closed').sort((a,b)=>(a.priority==='urgent'?0:1)-(b.priority==='urgent'?0:1)||b.createdAt-a.createdAt);
        const body=calls.slice(0,10).map(createCallRow).join('\n\n')||'No open calls. Members can use `/911` to file in-game roleplay reports.';
        return interaction.editReply({embeds:[new EmbedBuilder().setColor(0x5243a6).setTitle(`Aether Dispatch · ${calls.length} active calls`).setDescription(body.slice(0,4000))],allowedMentions:{parse:[]}});
      }
      if (sub === 'unit') {
        const status=interaction.options.getString('status',true);
        const callsign=interaction.options.getString('callsign');
        const unit=await updateCadUnit(interaction.guildId,{id:interaction.user.id,username:interaction.user.username},{status,...(callsign?{callsign}:{})});
        return interaction.editReply(`Unit **${unit.callsign || interaction.user.username}** is now **${status.replace('_',' ')}**.`);
      }
      if (sub === 'assign' || sub === 'respond' || sub === 'close') {
        const state=await getCadState(interaction.guildId);
        const reference=interaction.options.getString('case',true);
        const call=findCallByReference(state.calls,reference);
        if (!call) return interaction.editReply('Case not found or reference ambiguous. Use `/cad calls` for IDs.');
        if (sub === 'close') {
          if (call.status==='closed') return interaction.editReply('This case is already closed.');
          await updateCadCall(interaction.guildId,{id:interaction.user.id,username:interaction.user.username},call.id,{status:'closed'});
          return interaction.editReply(`✅ Closed case **${call.id.slice(0,8).toUpperCase()}**.`);
        }
        if (call.status==='closed') return interaction.editReply('Cannot assign a closed case.');
        const userId=sub==='respond'?interaction.user.id:interaction.options.getUser('officer',true).id;
        const unit=state.units.find(u=>u.userId===userId && u.status!=='off_duty');
        if (!unit) return interaction.editReply('The officer must register as an on-duty CAD unit first using `/cad unit`.');
        const assigned=[...new Set([...(call.assignedUnitIds||[]),userId])];
        await updateCadCall(interaction.guildId,{id:interaction.user.id,username:interaction.user.username},call.id,{status:'assigned',assignedUnitIds:assigned});
        return interaction.editReply(`✅ **${unit.callsign||unit.username}** assigned to **${call.id.slice(0,8).toUpperCase()}**.`);
      }
    } catch(error) {
      return interaction.editReply(`CAD error: ${errorText(error)}`).catch(()=>{});
    }
  },
};
