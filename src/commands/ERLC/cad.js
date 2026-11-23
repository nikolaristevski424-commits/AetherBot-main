import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getCadState, getCadGuildAccess, getCadGuildConfig, setCadGuildConfig, updateCadUnit, createCadCall, assignCadCallUnit, closeCadCall } from '../../services/cad/cadService.js';
import { buildCadCallAnnouncement, cadModeLabel, cadWebUrl } from '../../services/cad/cadDiscordPresentation.js';
import { buildCadTrackingReply } from '../../services/cad/cadTrackingPresentation.js';
import { findCallByReference } from '../../services/cad/dispatchCore.js';
import { handleCadExtended } from './modules/cadExtended.js';

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
    .addSubcommand(c => c.setName('dashboard').setDescription('Open the shared CAD or use Discord commands, based on your server preference.'))
    .addSubcommand(c => c.setName('setup').setDescription('Choose Discord, Web or Hybrid CAD with a guided setup (Manage Server).'))
    .addSubcommand(c => c.setName('interface').setDescription('View or set the server CAD experience (Manage Server to change).')
      .addStringOption(o => o.setName('mode').setDescription('Preferred CAD interface; leave blank to view current choice')
        .addChoices({name:'Discord commands and dispatch cards',value:'discord'},
          {name:'Web CAD and officer MDT',value:'web'},
          {name:'Hybrid — both interfaces',value:'hybrid'})))
    .addSubcommand(c => c.setName('panic').setDescription('On-duty roleplay unit: send a high-priority panic call to dispatch.')
      .addStringOption(o => o.setName('location').setDescription('In-game road, location or postal').setMinLength(3).setMaxLength(100).setRequired(true))
      .addStringOption(o => o.setName('details').setDescription('What happened? Roleplay details only').setMaxLength(240)))
    .addSubcommand(c => c.setName('map').setDescription('Render a position snapshot on the Liberty County map.')
      .addStringOption(o => o.setName('player').setDescription('Optional Roblox name, callsign or postal').setMaxLength(70))
      .addStringOption(o => o.setName('season').setDescription('Optional map season').addChoices(
        {name:'Autumn',value:'fall-postals'},{name:'Winter',value:'snow-postals'},
        {name:'Spring',value:'spring-postals'},{name:'Summer',value:'summer-postals'})))
    .addSubcommand(c => c.setName('players').setDescription('Check the current ER:LC roster and locations.')
      .addStringOption(o => o.setName('search').setDescription('Optional Roblox name, team, callsign or postal').setMaxLength(70)))
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

      .addChannelOption(o => o.setName('channel').setDescription('Dispatch text channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommandGroup(g => g.setName('mdt').setDescription('Officer mobile data terminal and fictional record searches')
      .addSubcommand(c => c.setName('open').setDescription('Open your authenticated officer MDT.'))
      .addSubcommand(c => c.setName('my-calls').setDescription('View dispatch incidents assigned to your unit.'))
      .addSubcommand(c => c.setName('search').setDescription('Search roleplay records, BOLOs and live ER:LC players.')
        .addStringOption(o => o.setName('query').setDescription('Person, plate, Roblox username or callsign').setMinLength(2).setMaxLength(100).setRequired(true)))
      .addSubcommand(c => c.setName('add-record').setDescription('Create a fictional civilian or in-game vehicle record.')
        .addStringOption(o => o.setName('kind').setDescription('Record type').addChoices({name:'Person / civilian',value:'person'},{name:'Vehicle',value:'vehicle'}).setRequired(true))
        .addStringOption(o => o.setName('subject').setDescription('Fictional character or vehicle name').setMinLength(2).setMaxLength(90).setRequired(true))
        .addStringOption(o => o.setName('plate').setDescription('In-game plate (required for vehicles)').setMaxLength(16))
        .addStringOption(o => o.setName('roblox_username').setDescription('Optional Roblox username').setMaxLength(40))
        .addStringOption(o => o.setName('description').setDescription('In-game appearance/model').setMaxLength(240))
        .addStringOption(o => o.setName('notes').setDescription('Roleplay notes only (no real personal data)').setMaxLength(1000)))
      .addSubcommand(c => c.setName('archive-record').setDescription('Archive a fictional record (Manage Server only).')
        .addStringOption(o => o.setName('id').setDescription('First 8 characters of record ID').setRequired(true))))
    .addSubcommandGroup(g => g.setName('bolo').setDescription('In-game roleplay BOLO alerts for dispatch')
      .addSubcommand(c => c.setName('list').setDescription('List active BOLO alerts.'))
      .addSubcommand(c => c.setName('add').setDescription('Issue a new roleplay BOLO.')
        .addStringOption(o => o.setName('kind').setDescription('Person or vehicle').addChoices({name:'Person',value:'person'},{name:'Vehicle',value:'vehicle'}).setRequired(true))
        .addStringOption(o => o.setName('subject').setDescription('Fictional name or vehicle description').setMinLength(2).setMaxLength(90).setRequired(true))
        .addStringOption(o => o.setName('details').setDescription('Reason for BOLO (roleplay only)').setMinLength(8).setMaxLength(1000).setRequired(true))
        .addStringOption(o => o.setName('location').setDescription('Last seen in-game postal or road').setMaxLength(90))
        .addStringOption(o => o.setName('priority').setDescription('Alert priority').addChoices({name:'Normal',value:'normal'},{name:'Urgent',value:'urgent'}))
        .addIntegerOption(o => o.setName('expiry_hours').setDescription('Expire after 1–168 hours (default 48)').setMinValue(1).setMaxValue(168)))
      .addSubcommand(c => c.setName('clear').setDescription('Clear an active BOLO.')
        .addStringOption(o => o.setName('id').setDescription('BOLO ID prefix from /cad bolo list').setRequired(true))))
    .addSubcommandGroup(g => g.setName('base').setDescription('Dispatch radio in Discord voice and text')
      .addSubcommand(c => c.setName('join').setDescription('Join your voice channel as a dispatch alert station.'))
      .addSubcommand(c => c.setName('leave').setDescription('Leave the dispatch voice channel.'))
      .addSubcommand(c => c.setName('status').setDescription('Display voice/text Base Dispatch status.'))
      .addSubcommand(c => c.setName('bulletin').setDescription('Send a roleplay radio bulletin in the dispatch text channel.')
        .addStringOption(o => o.setName('message').setDescription('Message up to 280 characters').setMinLength(5).setMaxLength(280).setRequired(true)))),
  async execute(interaction, config, client) {
    if (!interaction.inGuild()) return interaction.reply({ content:'Run this in a server.', flags:MessageFlags.Ephemeral });
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    try {
      const sub = interaction.options.getSubcommand(true);
      const access = await getCadGuildAccess(client, interaction.user.id, interaction.guildId);
      if (!access) return interaction.editReply('Your account does not have access to this server.');
      const group = interaction.options.getSubcommandGroup(false);
      if (['mdt', 'bolo', 'base'].includes(group)) {
        return await handleCadExtended(interaction, access, group, sub);
      }
      if (sub === 'setup') {
        if (!access.isManager) return interaction.editReply('Only server managers can configure a CAD interface.');
        const current=await getCadGuildConfig(interaction.guildId);
        const row=new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('aether_cad_mode:discord').setLabel('Discord commands').setEmoji('⌨️').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('aether_cad_mode:web').setLabel('Web CAD').setEmoji('🖥️').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('aether_cad_mode:hybrid').setLabel('Hybrid • both').setEmoji('🔗').setStyle(ButtonStyle.Success),
        );
        return interaction.editReply({
          content:`## Aether CAD • Setup\n**Current preference:** ${cadModeLabel(current.experienceMode)}\n\nChoose how your staff will normally run dispatch. **Discord and Web always share the same persistent records and role permissions**.\n\nAfter choosing, set a dispatch channel with \`/cad dispatch-channel\` and assign CAD roles using the authenticated web CAD settings.`,
          components:[row],allowedMentions:{parse:[]}
        });
      }
      if (sub === 'interface') {
        const selected = interaction.options.getString('mode');
        if (selected && !access.isManager) return interaction.editReply('Only server managers can change the CAD experience.');
        const current = selected
          ? await setCadGuildConfig(interaction.guildId, {experienceMode:selected})
          : await getCadGuildConfig(interaction.guildId);
        const url = cadWebUrl();
        return interaction.editReply({content:
          `**Aether CAD experience: ${cadModeLabel(current.experienceMode)}**\n`+
          `• **Discord:** /cad calls, /cad mdt search, /911 and dispatch cards.\n`+
          `• **Web:** ${url||'Wispbyte CAD needs a verified public HTTPS URL.'}\n`+
          `• **Hybrid:** Use both, with a single shared CAD database.\n`+
          (access.isManager?'Set with `/cad interface mode:` or through the CAD settings page.':'Ask a server manager to change the preference.'),
          allowedMentions:{parse:[]}
        });
      }
      if (sub === 'dispatch-channel') {
        if (!access.isManager) return interaction.editReply('Manage Server permission required.');
        const channel = interaction.options.getChannel('channel',true);
        const saved = await setCadGuildConfig(interaction.guildId,{ dispatchChannelId:channel.id });
        return interaction.editReply(`✅ Roleplay 911 reports will be sent to <#${saved.dispatchChannelId}>.`);
      }
      if (!access.canDispatch) return interaction.editReply('You need a CAD dispatch role, or Manage Server, to use these tools.');
      if (sub === 'panic') {
        const state = await getCadState(interaction.guildId);
        const unit = state.units.find(u => u.userId===interaction.user.id && u.status!=='off_duty');
        if (!unit) return interaction.editReply('Register as an on-duty unit using `/cad unit` before issuing a panic.');
        const recent = state.calls.some(c => c.source==='cad_panic' && c.createdBy===interaction.user.id
          && Date.now()-c.createdAt<120000 && c.status!=='closed');
        if (recent) return interaction.editReply('You already sent a panic alert recently. Update your open call or wait two minutes.');
        const call = await createCadCall(interaction.guildId,
          {id:interaction.user.id,username:interaction.user.username},
          {title:`Panic button — ${unit.callsign||interaction.user.username}`.slice(0,100),
            location:interaction.options.getString('location',true),
            details:interaction.options.getString('details')||'Unit requesting immediate roleplay assistance.',
            priority:'urgent',source:'cad_panic'});
        const config = await getCadGuildConfig(interaction.guildId);
        const channel = config.dispatchChannelId ? await interaction.guild.channels.fetch(config.dispatchChannelId).catch(()=>null) : null;
        if(channel?.isTextBased?.() && channel.send){
          await channel.send(buildCadCallAnnouncement(call, config)).catch(()=>{});
        }
        return interaction.editReply(`🚨 **Panic submitted** • #${call.id.slice(0,8).toUpperCase()} • ${call.location}\nThe urgent call was saved in CAD. The dispatch channel is notified when configured and accessible. This is roleplay only; contact local emergency services for real emergencies.`);
      }
      if (sub === 'map' || sub === 'players') {
        const image = sub === 'map';
        const query = interaction.options.getString(image ? 'player' : 'search') || '';
        const layer = image ? interaction.options.getString('season') || undefined : undefined;
        return interaction.editReply(await buildCadTrackingReply(interaction.guildId, { image, query, layer }));
      }
      if (sub === 'dashboard') {
        const current=await getCadGuildConfig(interaction.guildId);
        const url=cadWebUrl();
        const pref=current.experienceMode || 'hybrid';
        const message=pref==='discord'
          ? 'Your server prefers Discord commands: `/cad calls`, `/cad mdt search`, `/cad bolo list` and `/cad unit`. The web view is still available.'
          : pref==='web'
            ? 'Your server prefers Web CAD. Open the dispatch board or map below; Discord commands still work for field officers.'
            : 'Your server uses Hybrid CAD. Discord actions and the browser stay synchronized using the same case records.';
        return interaction.editReply({
          content:`**Aether CAD • ${cadModeLabel(pref)}**\n${message}\n${url || 'A public CAD URL has not been configured.'}`,
          allowedMentions:{parse:[]}
        });
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
        const actor={id:interaction.user.id,username:interaction.user.username};
        if (sub === 'close') {
          const result=await closeCadCall(interaction.guildId,actor,call.id);
          if (!result?.changed) return interaction.editReply('This case is already closed or no longer exists.');
          return interaction.editReply(`✅ Closed case **${call.id.slice(0,8).toUpperCase()}**.`);
        }
        const userId=sub==='respond'?interaction.user.id:interaction.options.getUser('officer',true).id;
        const result=await assignCadCallUnit(interaction.guildId,actor,call.id,userId);
        if (!result) return interaction.editReply('The call no longer exists.');
        const unit=state.units.find(u=>u.userId===userId);
        return interaction.editReply(result.changed
          ? `✅ **${unit?.callsign||unit?.username||'Officer'}** assigned to **${call.id.slice(0,8).toUpperCase()}**.`
          : 'This officer is already assigned to that call.');
      }
    } catch(error) {
      return interaction.editReply(`CAD error: ${errorText(error)}`).catch(()=>{});
    }
  },
};
