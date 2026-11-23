import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown } from 'discord.js';
import { getCadState } from './cadService.js';
import { cadWebUrl } from './cadDiscordPresentation.js';
import { getCadTracking, syncCadGuild } from './cadTrackingService.js';
import { getMdtState } from './mdtService.js';
import { fitMapCalibration } from './mdtCore.js';
import { renderCadDiscordMap } from './cadMapImages.js';
import { buildMapMarkers, getPlayerSnapshot, matchesPlayer } from '../../web/cad/assets/mapModel.js';

const safe = (value, length = 80) => escapeMarkdown(String(value || '').replace(/[\r\n]+/g, ' ').slice(0, length));
const deepLinkPlayer = player => typeof player?.robloxId === 'string' && /^\d{1,20}$/.test(player.robloxId) ? player.robloxId : '';

export async function buildCadTrackingReply(guildId, { image = false, query = '', layer } = {}) {
    await syncCadGuild(guildId);
    const [state, mdt] = await Promise.all([getCadState(guildId), image ? getMdtState(guildId) : null]);
    const snapshot = getPlayerSnapshot(state);
    const tracking = getCadTracking(guildId);
    const players = snapshot.players.filter(player => matchesPlayer(player, query));
    const activeCalls = state.calls.filter(call => call.status !== 'closed');
    const located = players.filter(p => Number.isFinite(p.locationX) && Number.isFinite(p.locationZ)).length;
    const age = snapshot.status === 'current' || snapshot.status === 'delayed'
        ? `${snapshot.status === 'delayed' ? 'Delayed snapshot' : 'ER:LC snapshot'} · <t:${Math.floor(state.playerSyncAt / 1000)}:R>`
        : snapshot.status === 'expired' ? 'Player snapshot expired' : snapshot.status === 'offline' ? 'Private server offline' : 'No player snapshot yet';
    const list = players.slice(0, 10).map(player => {
        const identity = [safe(player.player), safe(player.callsign), safe(player.team)].filter(Boolean).join(' · ');
        return `**${identity}**\n${safe(player.location || 'Location unavailable', 135)}`;
    }).join('\n\n');
    const description = [age, tracking.message, query ? `Search: **${safe(query, 70)}**` : '',
        list || (query ? 'No players match this search.' : 'No current players to list.'),
        players.length > 10 ? `Showing 10 of ${players.length} matches. Open CAD for the full roster.` : '',
    ].filter(Boolean).join('\n\n').slice(0, 3900);
    const embed = new EmbedBuilder().setColor(0x6352b5).setTitle(image ? 'Liberty County · Dispatch Map' : 'Liberty County · Player Tracker')
        .setDescription(description).addFields(
            { name: query ? 'Matching players' : 'Online players', value: String(players.length), inline: true },
            { name: 'With coordinates', value: String(located), inline: true },
            { name: 'Active 911 calls', value: String(activeCalls.length), inline: true },
        ).setFooter({ text: 'Private ER:LC roleplay snapshots. Positions update through PRC.' });
    const player = query && players.length === 1 ? deepLinkPlayer(players[0]) : '';
    const url = cadWebUrl('map', { guild: guildId, focus: player });
    const components = url ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(player ? 'Locate in CAD' : 'Open interactive map').setStyle(ButtonStyle.Link).setURL(url))] : [];
    const files = [];
    if (image) {
        const markers = buildMapMarkers({ ...state, players, calls: query ? [] : activeCalls }, fitMapCalibration(mdt.calibration));
        try {
            files.push({ attachment: await renderCadDiscordMap(markers, layer), name: 'aether-liberty-county.jpg' });
            embed.setImage('attachment://aether-liberty-county.jpg');
        } catch {
            embed.setFooter({ text: 'Map image temporarily unavailable. Use the web CAD map or try again shortly.' });
        }
    }
    return { embeds: [embed], files, components, allowedMentions: { parse: [] } };
}
