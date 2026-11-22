import 'dotenv/config';
import { getLavalinkNodes } from '../src/config/music/lavalink.js';

try {
    const nodes = getLavalinkNodes();
    if (!nodes.length) throw new Error('Set LAVALINK_HOST, LAVALINK_PASSWORD, and optionally LAVALINK_PORT and LAVALINK_SECURE.');
    const source = process.env.LAVALINK_SEARCH_PLATFORM || 'ytmsearch';
    const query = process.argv.slice(2).join(' ') || 'Rick Astley Never Gonna Give You Up';
    const checks = await Promise.all(nodes.map(async ({ host, port, password, secure }, index) => {
        const status = `Lavalink node ${index + 1}`;
        const origin = `${secure ? 'https' : 'http'}://${host}:${port}`;
        const request = path => fetch(origin + path, {
            headers: { Authorization: password }, signal: AbortSignal.timeout(12_000), redirect: 'error',
        });
        try {
            const info = await request('/v4/info');
            if (!info.ok) throw new Error(`info HTTP ${info.status}`);
            const data = await info.json();
            if (data.version?.major !== 4) throw new Error('expected Lavalink v4');
            const tracks = await request('/v4/loadtracks?' + new URLSearchParams({ identifier: source + ':' + query }));
            if (!tracks.ok || (await tracks.json()).loadType !== 'search') throw new Error('track search did not return results');
            console.log(`${status}: v4 authenticated and track search succeeded.`);
            return true;
        } catch (error) {
            console.error(`${status}: ${error.message}`);
            return false;
        }
    }));
    if (!checks.every(Boolean)) process.exitCode = 1;
} catch {
    console.error('No valid Lavalink configuration. Set LAVALINK_HOST and LAVALINK_PASSWORD, or use LAVALINK_NODES.');
    process.exitCode = 1;
}
