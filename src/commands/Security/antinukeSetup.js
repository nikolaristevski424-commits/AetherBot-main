import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, AetherError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { successEmbed } from '../../utils/embeds.js';
import { setProtection } from '../../services/security/securityConfigService.js';

function requireManageGuild(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        throw new AetherError('antinuke-setup: missing permission', ErrorTypes.PERMISSION,
            'You need the **Manage Server** permission to use this.');
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('antinuke-setup')
        .setDescription('Configure anti-nuke protection')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((opt) => opt
            .setName('protection')
            .setDescription('Which protection to configure')
            .setRequired(true)
            .addChoices(
                { name: 'Channel Delete (mass channel deletion)', value: 'channelDelete' },
                { name: 'Role Delete (mass role deletion)', value: 'roleDelete' },
                { name: 'Ban Spam (mass bans outside the bot)', value: 'banSpam' },
                { name: 'Webhook Create (unexpected new webhooks)', value: 'webhookCreate' },
            ))
        .addBooleanOption((opt) => opt.setName('enabled').setDescription('Turn this protection on or off').setRequired(true))
        .addStringOption((opt) => opt
            .setName('action')
            .setDescription('What to do to the executor when triggered')
            .setRequired(false)
            .addChoices(
                { name: 'Alert staff only', value: 'alert' },
                { name: 'Strip roles (revoke permissions, keep them in server)', value: 'strip_roles' },
                { name: 'Kick', value: 'kick' },
                { name: 'Ban', value: 'ban' },
            ))
        .addChannelOption((opt) => opt.setName('alert_channel').setDescription('Where to send alerts').addChannelTypes(ChannelType.GuildText).setRequired(false))
        .addIntegerOption((opt) => opt.setName('threshold').setDescription('Actions needed to trigger').setMinValue(2).setMaxValue(50).setRequired(false))
        .addIntegerOption((opt) => opt.setName('window_seconds').setDescription('Time window in seconds').setMinValue(5).setMaxValue(600).setRequired(false)),

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

            const updates = { enabled };
            if (action) updates.action = action;
            if (alertChannel) updates.alertChannelId = alertChannel.id;
            if (threshold) updates.threshold = threshold;
            if (windowSeconds) updates.windowSeconds = windowSeconds;

            const result = await setProtection(interaction.guildId, 'antinuke', protection, updates);

            await InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed('Anti-Nuke Updated', [
                    `**${protection}**: ${result.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
                    `Action: \`${result.action}\``,
                    `Threshold: ${result.threshold} / ${result.windowSeconds}s`,
                    result.alertChannelId ? `Alerts: <#${result.alertChannelId}>` : 'Alerts: not set',
                    '',
                    '⚠️ This can only act on members the bot outranks in the role list — if someone with a role above the bot goes rogue, staff still get alerted, but the automatic action will fail. Keep the bot role high.',
                ].join('\n'))],
            });
        } catch (error) {
            if (error instanceof AetherError) {
                return await replyUserError(interaction, { type: error.type || ErrorTypes.VALIDATION, message: error.userMessage || 'Something went wrong.' });
            }
            await handleInteractionError(interaction, error, { command: 'antinuke-setup' });
        }
    },
};
