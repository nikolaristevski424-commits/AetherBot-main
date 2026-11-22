import { readFileSync } from 'node:fs';

function requiredNodes(value) {
    const nodes = Array.isArray(value) ? value : value?.nodes;
    if (!Array.isArray(nodes) || nodes.length === 0) throw new Error('Provide at least one Lavalink node.');
    const names = new Set();
    return nodes.map((node, index) => {
        const host = node?.host;
        const port = Number(node?.port ?? (node?.secure ? 443 : 2333));
        const name = node?.name || `Lavalink ${index + 1}`;
        if (typeof host !== 'string' || !/^[a-z0-9.-]+$/i.test(host) || !Number.isInteger(port) || port < 1 || port > 65535
            || typeof node.password !== 'string' || !node.password.trim() || typeof name !== 'string'
            || (node.secure !== undefined && typeof node.secure !== 'boolean') || names.has(name)) {
            throw new Error(`Invalid or duplicate Lavalink node at position ${index + 1}.`);
        }
        names.add(name);
        return { host, port, password: node.password, secure: node.secure === true, name };
    });
}

export function getLavalinkNodes(env = process.env) {
    if (env.LAVALINK_NODES?.trim()) return requiredNodes(JSON.parse(env.LAVALINK_NODES));
    if (env.LAVALINK_HOST?.trim()) {
        const tls = env.LAVALINK_SECURE || 'false';
        if (!['true', 'false', '1', '0', 'yes', 'no'].includes(tls.toLowerCase())) throw new Error('Set LAVALINK_SECURE to true or false.');
        return requiredNodes([{
            host: env.LAVALINK_HOST.trim(), port: env.LAVALINK_PORT || undefined, password: env.LAVALINK_PASSWORD,
            secure: ['true', '1', 'yes'].includes(tls.toLowerCase()), name: env.LAVALINK_NAME || 'Main',
        }]);
    }
    if (env.LAVALINK_NODES_FILE?.trim()) return requiredNodes(JSON.parse(readFileSync(env.LAVALINK_NODES_FILE.trim(), 'utf8')));
    return [];
}
