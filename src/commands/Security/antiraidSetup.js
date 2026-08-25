import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, AetherError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { successEmbed } from '../../utils/embeds.js';
import { setProtection, setQuarantineRole } from '../../services/security/securityConfigService.js';

function requireManageGuild(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        throw new AetherError('antiraid-setup: missing permission', ErrorTypes.PERMISSION,
            'You need the **Manage Server** permission to use this.');
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('antiraid-setup')
        .setDescription('Configure anti-raid protection')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption((opt) => opt
            .setName('protection')
            .setDescription('Which protection to configure')
            .setRequired(true)
            .addChoices(
                { name: 'Join Spike (mass joins in a short window)', value: 'joinSpike' },
                { name: 'New Account (accounts younger than X)', value: 'newAccount' },
            ))
        .addBooleanOption((opt) => opt.setName('enabled').setDescription('Turn this protection on or off').setRequired(true))
        .addStringOption((opt) => opt
            .setName('action')
            .setDescription('What to do when triggered')
            .setRequired(false)
            .addChoices(
                { name: 'Alert staff only', value: 'alert' },
                { name: 'Timeout (10 min)', value: 'timeout' },
                { name: 'Kick', value: 'kick' },
                { name: 'Ban', value: 'ban' },
                { name: 'Quarantine (needs quarantine_role set)', value: 'quarantine' },
            ))
        .addChannelOption((opt) => opt.setName('alert_channel').setDescription('Where to send alerts').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addIntegerOption((opt) => opt.setName('threshold').setDescription('Join Spike: joins needed to trigger').setMinValue(2).setMaxValue(100).setRequired(false))
        .addIntegerOption((opt) => opt.setName('window_seconds').setDescription('Join Spike: time window in seconds').setMinValue(5).setMaxValue(600).setRequired(false))
        .addIntegerOption((opt) => opt.setName('min_age_hours').setDescription('New Account: minimum account age required, in hours').setMinValue(1).setMaxValue(8760).setRequired(false))
        .addRoleOption((opt) => opt.setName('quarantine_role').setDescription('Role used by the "Quarantine" action (applies to both protections)').setRequired(false)),

    async execute(interaction) {
        try {
            requireManageGuild(interaction);
            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            const protection = interaction.options.getString('protection', true);
            const enabled = interaction.options.getBoolean('enabled', true);
            const action = interaction.options.getString('action');
            const alertChannel = interaction.options.getChannel('alert_channel');
            const threshold = interaction.options.getInteger('threshold');
            const windowSeconds = interaction.options.getInteger('window_seconds');
            const minAgeHours = interaction.options.getInteger('min_age_hours');
            const quarantineRole = interaction.options.getRole('quarantine_role');

            const updates = { enabled };
            if (action) updates.action = action;
            if (alertChannel) updates.alertChannelId = alertChannel.id;
            if (protection === 'joinSpike') {
                if (threshold) updates.threshold = threshold;
                if (windowSeconds) updates.windowSeconds = windowSeconds;
            }
            if (protection === 'newAccount' && minAgeHours) {
                updates.minAgeHours = minAgeHours;
            }

            const result = await setProtection(interaction.guildId, 'antiraid', protection, updates);
            if (quarantineRole) {
                await setQuarantineRole(interaction.guildId, quarantineRole.id);
            }

            await InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed('Anti-Raid Updated', [
                    `**${protection}**: ${result.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
                    `Action: \`${result.action}\``,
                    protection === 'joinSpike' ? `Threshold: ${result.threshold} joins / ${result.windowSeconds}s` : `Min age: ${result.minAgeHours}h`,
                    result.alertChannelId ? `Alerts: <#${result.alertChannelId}>` : 'Alerts: not set',
                ].join('\n'))],
            });
        } catch (error) {
            if (error instanceof AetherError) {
                return await replyUserError(interaction, { type: error.type || ErrorTypes.VALIDATION, message: error.userMessage || 'Something went wrong.' });
            }
            await handleInteractionError(interaction, error, { command: 'antiraid-setup' });
        }
    },
};
