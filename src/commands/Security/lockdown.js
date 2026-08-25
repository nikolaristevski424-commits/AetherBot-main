import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType, PermissionsBitField } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, AetherError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { successEmbed } from '../../utils/embeds.js';
import { getSecurityConfig, setLockdown } from '../../services/security/securityConfigService.js';
import { logger } from '../../utils/logger.js';

function requireManageGuild(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        throw new AetherError('lockdown: missing permission', ErrorTypes.PERMISSION,
            'You need the **Manage Server** permission to use this.');
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('lockdown')
        .setDescription('Engage or lift an emergency server-wide lockdown')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption((opt) => opt
            .setName('action')
            .setDescription('Engage or lift lockdown')
            .setRequired(true)
            .addChoices(
                { name: 'Engage (stop @everyone sending messages, server-wide)', value: 'engage' },
                { name: 'Lift', value: 'lift' },
            ))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the lockdown').setRequired(false)),

    async execute(interaction) {
        try {
            requireManageGuild(interaction);
            const action = interaction.options.getString('action', true);
            const reason = interaction.options.getString('reason');

            await InteractionHelper.safeDefer(interaction);

            const config = await getSecurityConfig(interaction.guildId);
            const everyoneId = interaction.guild.id;

            if (action === 'engage') {
                if (config.lockdown.active) {
                    return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Lockdown is already active.' });
                }

                const textChannels = interaction.guild.channels.cache.filter((c) => c.type === ChannelType.GuildText);
                const lockedChannelIds = [];

                for (const channel of textChannels.values()) {
                    const currentPerms = channel.permissionOverwrites.cache.get(everyoneId);
                    // Only touch channels where @everyone doesn't already have SendMessages explicitly denied.
                    if (currentPerms?.deny.has(PermissionsBitField.Flags.SendMessages)) continue;
                    try {
                        await channel.permissionOverwrites.edit(everyoneId, { SendMessages: false }, { reason: `Lockdown engaged by ${interaction.user.tag}: ${reason || 'no reason given'}` });
                        lockedChannelIds.push(channel.id);
                    } catch (error) {
                        logger.warn(`[security] Failed to lock channel ${channel.id}: ${error.message}`);
                    }
                }

                await setLockdown(interaction.guildId, { active: true, engagedBy: interaction.user.id, reason, lockedChannelIds });

                await InteractionHelper.safeReply(interaction, {
                    embeds: [successEmbed('🔒 Lockdown Engaged', `${lockedChannelIds.length} channel(s) locked. Run \`/lockdown lift\` when it's safe.${reason ? `\nReason: ${reason}` : ''}`)],
                });
                return;
            }

            // lift
            if (!config.lockdown.active) {
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Lockdown isn\'t active.' });
            }

            let restored = 0;
            for (const channelId of config.lockdown.lockedChannelIds) {
                const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
                if (!channel) continue;
                try {
                    await channel.permissionOverwrites.edit(everyoneId, { SendMessages: null }, { reason: `Lockdown lifted by ${interaction.user.tag}` });
                    restored += 1;
                } catch (error) {
                    logger.warn(`[security] Failed to unlock channel ${channelId}: ${error.message}`);
                }
            }

            await setLockdown(interaction.guildId, { active: false });

            await InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed('🔓 Lockdown Lifted', `${restored} channel(s) restored.`)],
            });
        } catch (error) {
            if (error instanceof AetherError) {
                return await replyUserError(interaction, { type: error.type || ErrorTypes.VALIDATION, message: error.userMessage || 'Something went wrong.' });
            }
            await handleInteractionError(interaction, error, { command: 'lockdown' });
        }
    },
};
