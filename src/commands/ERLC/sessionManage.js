import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SeparatorBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, AetherError, ErrorTypes } from '../../utils/errorHandler.js';
import { getErlcConfig, getServerStatus } from '../../services/erlc/erlcService.js';
import { getSessionState } from '../../services/erlc/erlcOperationsService.js';

// Consolidated on request: session start/vote/boost/shutdown used to be
// separate subcommands — now it's one command that opens a control panel,
// and staff pick an action with buttons instead of typing a subcommand.

function requireManageGuild(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        throw new AetherError('session-manage: missing permission', ErrorTypes.PERMISSION,
            'You need the **Manage Server** permission to use this.');
    }
}

export function buildControlPanel({ active, startedBy, startedAt }) {
    const container = new ContainerBuilder().setAccentColor(active ? 0x57F287 : 0x99AAB5);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
        '## 🎛️  Session Control Panel',
        active
            ? `🟢 **Active** — started by <@${startedBy}> <t:${Math.floor(startedAt / 1000)}:R>`
            : '⚪ **No active session**',
    ].join('\n')));
    container.addSeparatorComponents(new SeparatorBuilder());

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('session_manage_start').setLabel('Start Session').setEmoji('🟢').setStyle(ButtonStyle.Success).setDisabled(active),
        new ButtonBuilder().setCustomId('session_manage_vote').setLabel('Start Vote').setEmoji('🗳️').setStyle(ButtonStyle.Primary).setDisabled(active),
        new ButtonBuilder().setCustomId('session_manage_boost').setLabel('Need More Players').setEmoji('📢').setStyle(ButtonStyle.Secondary).setDisabled(!active),
        new ButtonBuilder().setCustomId('session_manage_shutdown').setLabel('End Session').setEmoji('🔴').setStyle(ButtonStyle.Danger).setDisabled(!active),
    );
    container.addActionRowComponents(row);
    return container;
}

export default {
    data: new SlashCommandBuilder()
        .setName('session-manage')
        .setDescription('Open the ER:LC session control panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            requireManageGuild(interaction);

            const config = await getErlcConfig(interaction.guildId);
            if (!config?.serverKey) {
                await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
                return await InteractionHelper.safeReply(interaction, {
                    content: '❌ ER:LC isn\'t set up for this server yet. Run `/erlc setup` first.',
                });
            }

            const state = await getSessionState(interaction.guildId);
            const panel = buildControlPanel({ active: !!state?.active, startedBy: state?.startedBy, startedAt: state?.startedAt });

            await interaction.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        } catch (error) {
            if (error instanceof AetherError) {
                await interaction.reply({ content: `❌ ${error.userMessage}`, flags: MessageFlags.Ephemeral }).catch(() => {});
                return;
            }
            await handleInteractionError(interaction, error, { command: 'session-manage' });
        }
    },
};
