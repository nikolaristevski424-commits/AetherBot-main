import { DEFAULT_MAP_LAYER, MAP_LAYERS } from '../../web/cad/assets/mapModel.js';

const imageOrigin = 'https://api.erlc.gg/maps/';
const maxSourceSize = 32 * 1024 * 1024;
const cacheLife = 60 * 60 * 1000;
const cache = new Map();
const loading = new Map();
let imageQueue = Promise.resolve();
const teamColors = {
    police: '#3467e5', sheriff: '#864bce', fire: '#d33847', dot: '#a96c12',
    civilian: '#596d7f', other: '#21797c', calls: '#db2135',
};

export function cadMapSource(layer) {
    return Object.hasOwn(MAP_LAYERS, layer) ? imageOrigin + MAP_LAYERS[layer] : null;
}

async function loadOfficialImage(layer) {
    const response = await fetch(cadMapSource(layer), { signal: AbortSignal.timeout(15_000), redirect: 'error' });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png') || !response.body
        || Number(response.headers.get('content-length')) > maxSourceSize) {
        throw new Error('ER:LC map image is temporarily unavailable.');
    }
    const blocks = [];
    let length = 0;
    for await (const block of response.body) {
        length += block.length;
        if (length > maxSourceSize) throw new Error('ER:LC map image is too large.');
        blocks.push(block);
    }
    const { default: sharp } = await import('sharp');
    const source = sharp(Buffer.concat(blocks, length), { limitInputPixels: 32_000_000, sequentialRead: true });
    return source.resize(2048, 2048).webp({ quality: 85 }).toBuffer();
}

export function getCadMapImage(layer = DEFAULT_MAP_LAYER) {
    if (!cadMapSource(layer)) return Promise.reject(new Error('Unknown ER:LC map layer.'));
    const cached = cache.get(layer);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
    if (loading.has(layer)) return loading.get(layer);
    // Serialize peak memory use when several viewers choose different layers.
    const pending = imageQueue.then(async () => {
        try {
            const data = await loadOfficialImage(layer);
            cache.delete(layer);
            cache.set(layer, { data, expiresAt: Date.now() + cacheLife });
            if (cache.size > 4) cache.delete(cache.keys().next().value);
            return data;
        } catch (error) {
            if (cached) return cached.data;
            throw error;
        }
    }).finally(() => loading.delete(layer));
    imageQueue = pending.catch(() => {});
    loading.set(layer, pending);
    return pending;
}

export async function renderCadDiscordMap(markers, layer = DEFAULT_MAP_LAYER) {
    const size = 1040;
    const map = await getCadMapImage(layer);
    const { default: sharp } = await import('sharp');
    const base = await sharp(map).resize(size, size).toBuffer();
    const pins = markers.filter(marker => marker.point).slice(0, 250).map(({ group, type, point }) => {
        const x = Math.max(13, Math.min(size - 13, Math.round(point.x * size / 100)));
        const y = Math.max(13, Math.min(size - 13, Math.round(point.y * size / 100)));
        const fill = teamColors[group] || teamColors.other;
        return type === 'call'
            ? `<path d="M ${x} ${y-13} L ${x+13} ${y} ${x} ${y+13} ${x-13} ${y} Z" fill="${fill}" stroke="#fff" stroke-width="3"/>`
            : `<circle cx="${x}" cy="${y}" r="8" fill="${fill}" stroke="#fff" stroke-width="2.5"/>`;
    }).join('');
    const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${pins}</svg>`);
    return sharp(base).composite([{ input: overlay }]).jpeg({ quality: 87 }).toBuffer();
}
