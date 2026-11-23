import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getCadState, getCadGuildConfig, setCadGuildConfig } from '../../../services/cad/cadService.js';
import {
  getMdtState,searchMdt,createMdtRecord,archiveMdtRecord,createMdtBolo,clearMdtBolo,logBaseBulletin,
} from '../../../services/cad/mdtService.js';
import { isBoloActive } from '../../../services/cad/mdtCore.js';
import { buildMdtLookupEmbeds, buildBoloAlert, cadModeLabel, cadWebUrl } from '../../../services/cad/cadDiscordPresentation.js';
import {
  joinBaseStation,leaveBaseStation,getBaseStation,signalBaseStation,
} from '../../../services/cad/baseStationService.js';
import { getPlayerSnapshot, matchesPlayer } from '../../../web/cad/assets/mapModel.js';
const actor=i=>({id:i.user.id,username:i.user.username});
const brief=value=>String(value||'').replace(/[\r\n]+/g,' ').slice(0,160);
const fmt=id=>id?.slice(0,8).toUpperCase();
const privateError='You must have an Aether CAD dispatch role or Manage Server permission.';
function playerSummary(p){
  return `• **${brief(p.player)}** · ${brief(p.team||'Team unknown')} · ${brief(p.location||'No current position')}`;
}
export async function handleCadExtended(interaction,access,group,sub){
  if(!access.canDispatch)return interaction.editReply(privateError);
  const guildId=interaction.guildId;
  if(group==='mdt'){
    if(sub==='open'){
      const mode=access.config?.experienceMode||'hybrid';
      const url=cadWebUrl('mdt');
      return interaction.editReply(
        `**Officer MDT • ${cadModeLabel(mode)}**\n`+
        (mode==='discord'?
          'This server prefers Discord commands. Use `/cad mdt search`, `/cad bolo list`, and `/cad calls` to access the same data.\n':
          'Use the authenticated officer MDT in your browser for full record details and dispatch history.\n')+
        (url||'Your CAD administrator must configure the public HTTPS CAD domain.')
      );
    }
    if(sub==='my-calls'){
      const state=await getCadState(guildId);
      const own=state.calls.filter(c=>c.status!=='closed'&&c.assignedUnitIds?.includes(interaction.user.id));
      return interaction.editReply(own.slice(0,10).map(c=>`**${fmt(c.id)}** · ${brief(c.title)} · ${brief(c.location)}`).join('\n')||'No active calls are assigned to your unit.');
    }
    if(sub==='search'){
      const q=interaction.options.getString('query',true).trim();
      if(q.length<2)return interaction.editReply('Search term must contain at least two characters.');
      const [mdt,cad]=await Promise.all([searchMdt(guildId,q,12),getCadState(guildId)]);
      const players=getPlayerSnapshot(cad).players.filter(p=>matchesPlayer(p,q)).slice(0,8);
      const records=mdt.records.slice(0,8).map(r=>`• **${fmt(r.id)}** [${r.kind}] ${brief(r.subject)}${r.plate?' · '+brief(r.plate):''}`);
      const bolos=mdt.bolos.slice(0,5).map(b=>`• 🚨 **${fmt(b.id)}** ${brief(b.subject)} · ${brief(b.location)}`);
      const body=[players.length?'**Current ER:LC players**\n'+players.map(playerSummary).join('\n'):'',records.length?'**Fictional records**\n'+records.join('\n'):'',bolos.length?'**Active BOLOs**\n'+bolos.join('\n'):''].filter(Boolean).join('\n\n');
      const embeds=buildMdtLookupEmbeds({query:q,records:mdt.records,bolos:mdt.bolos});
      const plain=(body||'No results found in this guild’s CAD records or fresh ER:LC snapshot.').slice(0,1850);
      return interaction.editReply({content:plain,embeds,allowedMentions:{parse:[]}});
    }
    if(sub==='add-record'){
      const kind=interaction.options.getString('kind',true);
      const record=await createMdtRecord(guildId,actor(interaction),{
        kind,subject:interaction.options.getString('subject',true),notes:interaction.options.getString('notes')||'',
        plate:interaction.options.getString('plate')||'',robloxUsername:interaction.options.getString('roblox_username')||'',
        description:interaction.options.getString('description')||'',
      });
      return interaction.editReply(`✅ Fictional ${record.kind} MDT record **${fmt(record.id)}** created. Open the CAD MDT to edit it.`);
    }
    if(sub==='archive-record'){
      if(!access.isManager)return interaction.editReply('Manage Server permission is required to archive roleplay records.');
      const record=await archiveMdtRecord(guildId,actor(interaction),interaction.options.getString('id',true));
      return interaction.editReply(record?`Record **${fmt(record.id)}** archived.`:'Record not found (or already archived).');
    }
  }
  if(group==='bolo'){
    if(sub==='list'){
      const {bolos}=await getMdtState(guildId);
      const active=bolos.filter(x=>isBoloActive(x)).slice(-12).reverse();
      return interaction.editReply({content:active.map(b=>`🚨 **${fmt(b.id)}** · **${brief(b.subject)}** · ${b.kind} · ${b.priority}\n${brief(b.details)}${b.location?' · '+brief(b.location):''}`).join('\n\n').slice(0,1900)||'No active roleplay BOLO alerts.',allowedMentions:{parse:[]}});
    }
    if(sub==='add'){
      const bolo=await createMdtBolo(guildId,actor(interaction),{
        kind:interaction.options.getString('kind',true),subject:interaction.options.getString('subject',true),
        details:interaction.options.getString('details',true),location:interaction.options.getString('location')||'',
        priority:interaction.options.getString('priority')||'normal',expiresInHours:interaction.options.getInteger('expiry_hours')??48,
      });
      const station=await getCadGuildConfig(guildId);
      if(station.dispatchChannelId){
        const channel=await interaction.guild.channels.fetch(station.dispatchChannelId).catch(()=>null);
        if(channel?.isTextBased() && channel.send)await channel.send(buildBoloAlert(bolo,station)).catch(()=>{});
      }
      await signalBaseStation(guildId);
      return interaction.editReply(`✅ Roleplay BOLO **${fmt(bolo.id)}** issued; expires in ${Math.ceil((bolo.expiresAt-Date.now())/3_600_000)} hours.`);
    }
    if(sub==='clear'){
      const bolo=await clearMdtBolo(guildId,actor(interaction),interaction.options.getString('id',true));
      return interaction.editReply(bolo?`BOLO **${fmt(bolo.id)}** cleared.`:'BOLO not found or already cleared.');
    }
  }
  if(group==='base'){
    if(sub==='status'){
      const base=getBaseStation(guildId),cfg=await getCadGuildConfig(guildId);
      return interaction.editReply(`**Base Dispatch**\nText dispatch: ${cfg.dispatchChannelId?'<#'+cfg.dispatchChannelId+'>':'Not configured'}\nVoice station: ${base?.connected?'<#'+base.channelId+'>':'Not connected'}\nVoice mode plays alert tones only; it does **not** record, transcribe or understand speech.`);
    }
    if(sub==='join'){
      const member=await interaction.guild.members.fetch(interaction.user.id);
      const channel=member.voice?.channel;
      if(!channel || channel.type!==ChannelType.GuildVoice)return interaction.editReply('Join a regular voice channel first, then run `/cad base join`.');
      const botMember=interaction.guild.members.me||await interaction.guild.members.fetchMe();
      if (botMember.voice?.channelId && !getBaseStation(guildId)) return interaction.editReply('Aether is already using voice (possibly music). Stop music before enabling Base Dispatch radio.');
      const perms=channel.permissionsFor(botMember);
      if(!perms?.has([PermissionFlagsBits.Connect,PermissionFlagsBits.Speak,PermissionFlagsBits.ViewChannel]))return interaction.editReply('Aether needs View Channel, Connect and Speak permissions in that voice channel.');
      const status=await joinBaseStation(interaction.guild,channel);
      return interaction.editReply(`✅ Base Dispatch joined <#${status.channelId}>. Only outbound radio alert tones are sent; nobody’s microphone audio is captured. Use "/cad base bulletin" to send a dispatch message.`);
    }
    if(sub==='leave')return interaction.editReply(leaveBaseStation(guildId)?'✅ Base Dispatch left the voice channel.':'Base Dispatch is not connected to a voice channel.');
    if(sub==='bulletin'){
      const cfg=await getCadGuildConfig(guildId);
      if(!cfg.dispatchChannelId)return interaction.editReply('Set a dispatch text channel first with `/cad dispatch-channel`.');
      const channel=await interaction.guild.channels.fetch(cfg.dispatchChannelId).catch(()=>null);
      if(!channel?.isTextBased())return interaction.editReply('Configured dispatch text channel is inaccessible.');
      const message=interaction.options.getString('message',true).trim().slice(0,280);
      const state = await getMdtState(guildId);
      if(state.bulletins.some(b=>b.actorId===interaction.user.id && Date.now()-b.at<15_000))
        return interaction.editReply('Wait 15 seconds between Base Dispatch bulletins.');
      await channel.send({content:`📻 **BASE DISPATCH • ROLEPLAY**\n${message}\n— ${brief(interaction.user.username)}`,allowedMentions:{parse:[]}});
      await logBaseBulletin(guildId,actor(interaction),message,cfg.dispatchChannelId);
      const alerted=await signalBaseStation(guildId);
      return interaction.editReply(`✅ Bulletin sent to <#${cfg.dispatchChannelId}>${alerted?' with a voice alert tone':''}.`);
    }
  }
  return interaction.editReply('Unknown CAD action.');
}
