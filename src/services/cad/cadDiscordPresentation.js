import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { normalizeCadExperienceMode } from './cadService.js';

// Present the SAME persistent CAD records in Discord. UI modes are preferences,
// not separate stores, privilege levels, or a way around authorization.
const clean = (value, limit = 900) => String(value ?? '—').replace(/[\r\n\u0000-\u001f]+/g, ' ').trim().slice(0, limit) || '—';
export function cadWebUrl(view = '') {
  const raw = process.env.CAD_PUBLIC_URL || process.env.CAD_REDIRECT_URI || '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.origin + '/cad/' + (view ? '?view=' + encodeURIComponent(view) : '');
  } catch { return null; }
}
export function cadModeLabel(value) {
  return { discord: 'Discord commands', web: 'Web CAD', hybrid: 'Hybrid · Discord + Web' }[normalizeCadExperienceMode(value)];
}
export function buildCadCallAnnouncement(call, config = {}) {
  if (!/^[0-9a-f-]{36}$/i.test(String(call?.id || ''))) throw new Error('Invalid CAD call ID.');
  const mode = normalizeCadExperienceMode(config.experienceMode);
  const urgent = call.priority === 'urgent';
  const closed = call.status === 'closed';
  const title = urgent ? 'PANIC / HIGH-PRIORITY DISPATCH' : '9-1-1 / INCOMING ROLEPLAY CALL';
  const status = closed ? 'CLOSED' : call.status === 'assigned' ? 'UNITS ASSIGNED' : 'AWAITING RESPONSE';
  const assignedCount = Array.isArray(call.assignedUnitIds) ? call.assignedUnitIds.length : 0;
  const source = {
    discord_911: 'Discord /911', erlc_911: 'ER:LC private server',
    cad_panic: 'Officer panic button',
  }[call.source] || 'CAD dispatch';
  const embed = new EmbedBuilder()
    .setColor(closed ? 0x7d899e : urgent ? 0xf45a65 : 0x4d9fff)
    .setAuthor({ name: 'AETHER • DISPATCH OPERATIONS' })
    .setTitle(title)
    .setDescription(clean(call.title, 160))
    .addFields(
      { name: 'INCIDENT', value: '`#' + clean(call.id.slice(0,8).toUpperCase(), 12) + '` • ' + status, inline: false },
      { name: 'LOCATION', value: clean(call.location, 150), inline: true },
      { name: 'PRIORITY', value: urgent ? '🔴 Urgent' : '🔵 Routine', inline: true },
      { name: 'CALLER', value: clean(call.createdByName, 75), inline: true },
      { name: 'UNITS ASSIGNED', value: String(assignedCount), inline: true },
      { name: 'SOURCE', value: source, inline: true },
      { name: 'DETAILS', value: clean(call.details, 950), inline: false },
    )
    .setFooter({ text: 'ER:LC roleplay only • Live CAD case • Never for real emergencies' })
    .setTimestamp(new Date(call.createdAt || Date.now()));
  const components = [];
  const buttons = [];
  if (!closed && mode !== 'web') {
    buttons.push(new ButtonBuilder().setCustomId('aether_cad_respond:' + call.id).setLabel('Respond').setStyle(ButtonStyle.Success).setEmoji('📡'));
    buttons.push(new ButtonBuilder().setCustomId('aether_cad_dismiss:' + call.id).setLabel('Close call').setStyle(ButtonStyle.Danger));
  }
  const link = cadWebUrl();
  if (link && mode !== 'discord') buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link).setLabel('Open CAD').setEmoji('🗺️'));
  if (buttons.length) components.push(new ActionRowBuilder().addComponents(...buttons));
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}
export function buildBoloAlert(bolo, config = {}) {
  const embed = new EmbedBuilder()
    .setAuthor({name:'AETHER • DISPATCH INTELLIGENCE'})
    .setColor(bolo.priority === 'urgent' ? 0xe14960 : 0xf0a848)
    .setTitle('⚠ ACTIVE BOLO — ' + clean(bolo.subject, 90))
    .setDescription(clean(bolo.details, 900))
    .addFields(
      {name:'TYPE',value:bolo.kind === 'vehicle'?'Vehicle':'Person',inline:true},
      {name:'PRIORITY',value:bolo.priority === 'urgent'?'Urgent':'Routine',inline:true},
      {name:'LAST SEEN',value:clean(bolo.location,100),inline:false},
      {name:'BOLO REF',value:clean(bolo.id?.slice(0,8).toUpperCase(),12),inline:true}
    )
    .setFooter({text:'Fictional ER:LC roleplay only • Aether MDT'})
    .setTimestamp(new Date(bolo.createdAt || Date.now()));
  const url=cadWebUrl('mdt');
  const components=url && normalizeCadExperienceMode(config.experienceMode)!=='discord'
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel('Open officer MDT').setEmoji('📋'))] : [];
  return {embeds:[embed],components,allowedMentions:{parse:[]}};
}
export function buildMdtLookupEmbeds({ query, records = [], bolos = [] }) {
  const matched = new Set(records.map(r => String(r.subject || '').toLowerCase()));
  const warnings = bolos.slice(0, 3).map(b => new EmbedBuilder()
    .setColor(b.priority === 'urgent' ? 0xf04452 : 0xf6ad3c)
    .setTitle('⚠ ACTIVE BOLO — ' + clean(b.subject, 90))
    .setDescription(clean(b.details, 800))
    .addFields({ name: 'Last seen', value: clean(b.location, 100) }, { name: 'Ref', value: clean(b.id?.slice(0,8).toUpperCase(), 12) })
    .setFooter({ text: 'Fictional CAD alert • Verify the roleplay record before taking action' }));
  const recordsEmbeds = records.slice(0, Math.max(1, 5 - warnings.length)).map(r => {
    const e = new EmbedBuilder()
      .setColor(matched.has(String(r.subject || '').toLowerCase()) && warnings.length ? 0x39b58a : 0x5a8dfa)
      .setTitle((r.kind === 'vehicle' ? '🚘 Vehicle' : '🪪 Civilian') + ' lookup — ' + clean(r.subject, 80))
      .addFields({ name: 'Record ID', value: clean(r.id?.slice(0,8).toUpperCase(), 12), inline: true },
        { name: 'Record type', value: r.kind === 'vehicle' ? 'Vehicle' : 'Person', inline: true });
    if (r.plate) e.addFields({ name: 'Plate', value: clean(r.plate, 32), inline: true });
    if (r.robloxUsername) e.addFields({ name: 'Roblox user', value: clean(r.robloxUsername, 80), inline: true });
    if (r.description) e.addFields({ name: 'Description', value: clean(r.description, 240) });
    if (r.notes) e.addFields({ name: 'Roleplay notes', value: clean(r.notes, 800) });
    return e.setFooter({ text: 'Fictional records only • Not real identifying information' });
  });
  return [...warnings, ...recordsEmbeds].slice(0, 5);
}
