import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, AetherError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { successEmbed, infoEmbed, createEmbed } from '../../utils/embeds.js';
import { getSecurityConfig, addToWhitelist, removeFromWhitelist } from '../../services/security/securityConfigService.js';

function requireManageGuild(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        throw new AetherError('whitelist: missing permission', ErrorTypes.PERMISSION,
            'You need the **Manage Server** permission to use this.');
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('whitelist')
        .setDescription('Manage who is exempt from anti-nuke actions')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption((opt) => opt
            .setName('action')
            .setDescription('Add, remove, or list the whitelist')
            .setRequired(true)
            .addChoices(
                { name: 'Add', value: 'add' },
                { name: 'Remove', value: 'remove' },
                { name: 'List', value: 'list' },
            ))
        .addUserOption((opt) => opt.setName('user').setDescription('A user to whitelist').setRequired(false))
        .addRoleOption((opt) => opt.setName('role').setDescription('A role to whitelist (anyone with it is exempt)').setRequired(false)),

    async execute(interaction) {
        try {
            const action = interaction.options.getString('action', true);
            const user = interaction.options.getUser('user');
            const role = interaction.options.getRole('role');

            if (action === 'list') {
                await InteractionHelper.safeDefer(interaction);
                const config = await getSecurityConfig(interaction.guildId);
                const lines = [
                    config.whitelist.userIds.length ? `**Users:** ${config.whitelist.userIds.map((id) => `<@${id}>`).join(', ')}` : null,
                    config.whitelist.roleIds.length ? `**Roles:** ${config.whitelist.roleIds.map((id) => `<@&${id}>`).join(', ')}` : null,
                ].filter(Boolean);
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [lines.length
                        ? createEmbed({ title: 'Security Whitelist', description: lines.join('\n'), color: 'info' })
                        : infoEmbed('Security Whitelist', 'Nothing whitelisted yet — the server owner is always exempt regardless.')],
                });
            }

            requireManageGuild(interaction);

            if (!user && !role) {
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Specify a `user` or a `role` to add/remove.' });
            }

            await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

            const targetType = role ? 'role' : 'user';
            const targetId = role ? role.id : user.id;
            const label = role ? `${role}` : `${user}`;

            const whitelist = action === 'add'
                ? await addToWhitelist(interaction.guildId, targetType, targetId)
                : await removeFromWhitelist(interaction.guildId, targetType, targetId);

            await InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed(action === 'add' ? 'Added to Whitelist' : 'Removed from Whitelist', `${label} is ${action === 'add' ? 'now exempt' : 'no longer exempt'} from anti-nuke actions.`)],
            });
        } catch (error) {
            if (error instanceof AetherError) {
                return await replyUserError(interaction, { type: error.type || ErrorTypes.VALIDATION, message: error.userMessage || 'Something went wrong.' });
            }
            await handleInteractionError(interaction, error, { command: 'whitelist' });
        }
    },
};
