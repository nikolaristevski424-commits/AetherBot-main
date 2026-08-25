import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { createEmbed } from '../../utils/embeds.js';
import { getSecurityConfig, getSecurityLog } from '../../services/security/securityConfigService.js';

function protectionLine(name, p, unitLabel) {
    if (!p.enabled) return `${name}: ❌ disabled`;
    return `${name}: ✅ \`${p.action}\` at ${unitLabel}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('security-status')
        .setDescription('View current anti-raid/anti-nuke configuration and recent activity'),

    async execute(interaction) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const config = await getSecurityConfig(interaction.guildId);
            const log = await getSecurityLog(interaction.guildId, 5);

            const embed = createEmbed({
                title: '🛡️ Security Status',
                color: config.lockdown.active ? 'error' : 'info',
                fields: [
                    {
                        name: 'Anti-Raid',
                        value: [
                            protectionLine('Join Spike', config.antiraid.joinSpike, `${config.antiraid.joinSpike.threshold}/${config.antiraid.joinSpike.windowSeconds}s`),
                            protectionLine('New Account', config.antiraid.newAccount, `<${config.antiraid.newAccount.minAgeHours}h old`),
                        ].join('\n'),
                        inline: false,
                    },
                    {
                        name: 'Anti-Nuke',
                        value: [
                            protectionLine('Channel Delete', config.antinuke.channelDelete, `${config.antinuke.channelDelete.threshold}/${config.antinuke.channelDelete.windowSeconds}s`),
                            protectionLine('Role Delete', config.antinuke.roleDelete, `${config.antinuke.roleDelete.threshold}/${config.antinuke.roleDelete.windowSeconds}s`),
                            protectionLine('Ban Spam', config.antinuke.banSpam, `${config.antinuke.banSpam.threshold}/${config.antinuke.banSpam.windowSeconds}s`),
                        ].join('\n'),
                        inline: false,
                    },
                    {
                        name: 'Lockdown',
                        value: config.lockdown.active ? `🔒 Active since <t:${Math.floor(config.lockdown.engagedAt / 1000)}:R>, by <@${config.lockdown.engagedBy}>` : '🔓 Not active',
                        inline: false,
                    },
                    {
                        name: 'Whitelist',
                        value: `${config.whitelist.userIds.length} user(s), ${config.whitelist.roleIds.length} role(s)`,
                        inline: true,
                    },
                    {
                        name: 'Quarantine Role',
                        value: config.quarantineRoleId ? `<@&${config.quarantineRoleId}>` : 'Not set',
                        inline: true,
                    },
                    {
                        name: `Recent Events (${log.length})`,
                        value: log.length
                            ? log.map((e) => `<t:${Math.floor(e.timestamp / 1000)}:R> — **${e.category}** ${e.executorId ? `by <@${e.executorId}>` : e.targetId ? `on <@${e.targetId}>` : ''} → \`${e.action}\`${e.applied ? '' : ' (failed)'}`).join('\n')
                            : 'No security events recorded yet.',
                        inline: false,
                    },
                ],
            });

            await InteractionHelper.safeReply(interaction, { embeds: [embed] });
        } catch (error) {
            await handleInteractionError(interaction, error, { command: 'security-status' });
        }
    },
};
