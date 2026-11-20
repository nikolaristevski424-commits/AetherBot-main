import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, AetherError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { createEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { issuePromotion, voidPromotion, getPromotionsForUser, getStaffRecordConfig } from '../../services/staffrecords/staffRecordsService.js';

function requireManageGuild(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        throw new AetherError('promotion: missing permission', ErrorTypes.PERMISSION,
            'You need the **Manage Server** permission to use this.');
    }
}

async function handleIssue(interaction) {
    requireManageGuild(interaction);
    const user = interaction.options.getUser('user', true);
    const newRole = interaction.options.getRole('new_rank', true);
    const reason = interaction.options.getString('reason', true);

    if (newRole.managed) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'That role is managed by Discord/an integration and can\'t be assigned manually.' });
    }

    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const record = await issuePromotion(interaction.guildId, { userId: user.id, issuedBy: interaction.user.id, newRoleId: newRole.id, reason });

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) {
        await member.roles.add(newRole, `Promotion ${record.id}`).catch(() => {});
    }

    const config = await getStaffRecordConfig(interaction.guildId);
    if (config.logChannelId) {
        const channel = await interaction.guild.channels.fetch(config.logChannelId).catch(() => null);
        if (channel?.isTextBased()) {
            await channel.send({
                embeds: [createEmbed({
                    title: 'Staff Promotion',
                    color: 'success',
                    fields: [
                        { name: 'Staff Member', value: `<@${user.id}>`, inline: true },
                        { name: 'New Rank', value: `${newRole}`, inline: true },
                        { name: 'Issued By', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Reason', value: reason, inline: false },
                        { name: 'Promotion ID', value: `\`${record.id}\``, inline: false },
                    ],
                })],
            }).catch(() => {});
        }
    }

    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Promotion Issued', `Promoted <@${user.id}> to ${newRole}.${member ? '' : ' (they weren\'t found in the server, so the role wasn\'t assigned automatically)'}\nID: \`${record.id}\``)],
    });
}

async function handleVoid(interaction) {
    requireManageGuild(interaction);
    const id = interaction.options.getString('id', true);

    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const record = await voidPromotion(interaction.guildId, id);
    if (!record) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `No promotion found with ID \`${id}\`.` });
    }

    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Promotion Voided', `\`${record.id}\` has been voided. The role granted by this promotion was NOT automatically removed — remove it manually if needed.`)],
    });
}

async function handleHistory(interaction) {
    const user = interaction.options.getUser('user', true);
    await InteractionHelper.safeDefer(interaction);

    const records = await getPromotionsForUser(interaction.guildId, user.id);
    if (records.length === 0) {
        return await InteractionHelper.safeReply(interaction, { embeds: [infoEmbed('No Promotions', `<@${user.id}> has no promotion history.`)] });
    }

    const lines = records.slice(0, 15).map((r) => `${r.voided ? '~~' : ''}\`${r.id}\` <@&${r.newRoleId}> — ${r.reason} (<t:${Math.floor(r.issuedAt / 1000)}:d>)${r.voided ? '~~ (voided)' : ''}`);
    await InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({ title: `Promotion History — ${user.tag || user.username}`, description: lines.join('\n'), color: 'info' })],
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName('promotion')
        .setDescription('Issue and manage staff promotions')
        .addSubcommand((sub) => sub
            .setName('issue')
            .setDescription('Issue a promotion to a staff member')
            .addUserOption((o) => o.setName('user').setDescription('Staff member').setRequired(true))
            .addRoleOption((o) => o.setName('new_rank').setDescription('New rank role').setRequired(true))
            .addStringOption((o) => o.setName('reason').setDescription('Reason for promotion').setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('void')
            .setDescription('Void a promotion')
            .addStringOption((o) => o.setName('id').setDescription('Promotion ID, e.g. #ABCDEF').setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('history')
            .setDescription("View a staff member's promotion history")
            .addUserOption((o) => o.setName('user').setDescription('Staff member').setRequired(true))),

    async execute(interaction) {
        try {
            switch (interaction.options.getSubcommand()) {
                case 'issue': return await handleIssue(interaction);
                case 'void': return await handleVoid(interaction);
                case 'history': return await handleHistory(interaction);
            }
        } catch (error) {
            if (error instanceof AetherError) {
                return await replyUserError(interaction, { type: error.type || ErrorTypes.VALIDATION, message: error.userMessage || 'Something went wrong.' });
            }
            await handleInteractionError(interaction, error, { command: 'promotion' });
        }
    },
};
