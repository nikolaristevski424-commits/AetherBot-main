export const ERLC_MAP_SIZE = 5355;
export const PLAYER_FRESH_MS = 45_000;
export const PLAYER_MAX_AGE_MS = 90_000;
export const MAP_LAYERS = Object.freeze({
    'fall-postals': 'fall_postals.png', 'fall': 'fall_blank.png',
    'snow-postals': 'snow_postals.png', 'snow': 'snow_blank.png',
    'spring-postals': 'spring_postals.png', 'spring': 'spring_blank.png',
    'summer-postals': 'summer_postals.png', 'summer': 'summer_blank.png',
});
export const DEFAULT_MAP_LAYER = 'fall-postals';

export function projectCadPosition(x, z, transform) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const project = coefficients => coefficients[0] * x + coefficients[1] * z + coefficients[2];
    const horizontal = transform?.coeffX?.length === 3 ? project(transform.coeffX) : 50 + x / ERLC_MAP_SIZE * 100;
    const vertical = transform?.coeffY?.length === 3 ? project(transform.coeffY) : 50 + z / ERLC_MAP_SIZE * 100;
    return horizontal >= 0 && horizontal <= 100 && vertical >= 0 && vertical <= 100
        ? { x: horizontal, y: vertical } : null;
}

export function getPlayerSnapshot(state = {}, now = Date.now()) {
    const at = Number.isFinite(state.playerSyncAt) && state.playerSyncAt > 0 ? state.playerSyncAt : null;
    const age = at === null ? null : Math.max(0, now - at);
    if (state.serverOnline === false) return { status: 'offline', age, players: [] };
    if (age === null) return { status: 'waiting', age, players: [] };
    if (age > PLAYER_MAX_AGE_MS) return { status: 'expired', age, players: [] };
    return { status: age > PLAYER_FRESH_MS ? 'delayed' : 'current', age, players: Array.isArray(state.players) ? state.players : [] };
}

export function matchesPlayer(player, query) {
    const needle = String(query || '').trim().toLowerCase();
    return !needle || [player.player, player.robloxId, player.callsign, player.team, player.postalCode, player.location]
        .some(value => String(value ?? '').toLowerCase().includes(needle));
}

export function mapTeam(team) {
    const label = String(team || '').toLowerCase();
    if (/sheriff/.test(label)) return 'sheriff';
    if (/police/.test(label)) return 'police';
    if (/fire|rescue|ems|medical/.test(label)) return 'fire';
    if (/dot|transport/.test(label)) return 'dot';
    if (/civilian|criminal/.test(label)) return 'civilian';
    return 'other';
}

export function buildMapMarkers(state, transform, query = '', filter = 'all', now = Date.now()) {
    const { players } = getPlayerSnapshot(state, now);
    return [
        ...players.filter(player => matchesPlayer(player, query)).map(player => ({
            key: 'player:' + (player.robloxId || player.player), type: 'player', group: mapTeam(player.team),
            title: player.player || 'Unknown player', team: player.team || 'Unknown team',
            location: player.location, callsign: player.callsign, x: player.locationX, z: player.locationZ,
            point: projectCadPosition(player.locationX, player.locationZ, transform),
        })),
        ...(state.calls || []).filter(call => call.status !== 'closed' && (!query || [call.title, call.location, call.id]
            .some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase())))).map(call => ({
            key: 'call:' + call.id, type: 'call', group: 'calls', title: call.title || 'Emergency call',
            status: call.status || 'open', details: call.details || '', location: call.location,
            x: call.positionX, z: call.positionZ, point: projectCadPosition(call.positionX, call.positionZ, transform),
        })),
    ].filter(marker => filter === 'all' || marker.group === filter);
}
