import { createRequire } from 'module';
import { GatewayDispatchEvents } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { getLavalinkNodes } from '../../config/music/lavalink.js';
import { setupPlayerHandler } from './playerHandler.js';

const require = createRequire(import.meta.url);
const { Riffy } = require('riffy');

export function initializeMusic(client) {
    let nodes;
    try {
        nodes = getLavalinkNodes();
    } catch {
        logger.warn('Music disabled: Lavalink configuration is invalid.');
        return;
    }
    if (!nodes.length) {
        logger.info('Music disabled: no Lavalink node is configured.');
        return;
    }

    client.riffy = new Riffy(client, nodes, {
        send: (payload) => {
            const guild = client.guilds.cache.get(payload.d.guild_id);
            if (guild) {
                guild.shard.send(payload);
            }
        },
        defaultSearchPlatform: process.env.LAVALINK_SEARCH_PLATFORM || 'ytmsearch',
        restVersion: 'v4',
        bypassChecks: {
            nodeFetchInfo: true,
        },
    });

    setupPlayerHandler(client);
    client.riffy.on('nodeError', node => logger.warn(`Lavalink node ${node.name || '(unnamed)'} reported a connection error.`));

    client.on('raw', (packet) => {
        if (
            ![
                GatewayDispatchEvents.VoiceStateUpdate,
                GatewayDispatchEvents.VoiceServerUpdate,
            ].includes(packet.t)
        ) {
            return;
        }
        client.riffy.updateVoiceState(packet);
    });

    client.riffy.on('playerError', (player, error) => {
        logger.error(`Music player error in guild ${player.guildId}:`, error);
    });

    logger.info(`Music initialized with ${nodes.length} Lavalink node(s).`);
}

export function initRiffyAfterReady(client) {
    if (client.riffy && client.user?.id) {
        client.riffy.init(client.user.id);
        logger.info('Riffy voice connection manager initialized.');
    }
}
