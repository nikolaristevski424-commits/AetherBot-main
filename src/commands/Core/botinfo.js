import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { db } from '../../utils/database/wrapper.js';
import packageJson from '../../../package.json' with { type: 'json' };

function formatUptime(ms) {
    const sec = Math.floor(ms / 1000);
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return parts.join(' ');
}

export default {
    data: new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('Info about Aether — uptime, version, server count, and more'),

    async execute(interaction) {
        try {
            await InteractionHelper.safeDefer(interaction);
            const client = interaction.client;

            const guildCount = client.guilds.cache.size;
            const memberCount = client.guilds.cache.reduce((sum, g) => sum + (g.memberCount || 0), 0);

            const embed = createEmbed({
                title: `🌌 ${client.user.username}`,
                description: 'An all-in-one Discord bot for moderation, economy, ER:LC, Roblox verification, and server security.',
                color: 'primary',
                thumbnail: client.user.displayAvatarURL(),
                fields: [
                    { name: 'Version', value: packageJson.version, inline: true },
                    { name: 'Uptime', value: formatUptime(client.uptime), inline: true },
                    { name: 'Storage', value: db.getConnectionType(), inline: true },
                    { name: 'Servers', value: `${guildCount.toLocaleString()}`, inline: true },
                    { name: 'Members (cached)', value: `${memberCount.toLocaleString()}`, inline: true },
                    { name: 'Ping', value: `${client.ws.ping}ms`, inline: true },
                    { name: 'Creator', value: 'Aether Development Team', inline: true },
                    { name: 'Links', value: '[Website](https://aether-community.lovable.app) • [Setup Guide](https://aether-setup-flow.base44.app)', inline: false },
                ],
            });

            await InteractionHelper.safeReply(interaction, { embeds: [embed] });
        } catch (error) {
            await handleInteractionError(interaction, error, { command: 'botinfo' });
        }
    },
};
