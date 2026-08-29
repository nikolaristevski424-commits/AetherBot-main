import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, AetherError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { createEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { issueInfraction, voidInfraction, getInfractionsForUser, getStaffRecordConfig, setStaffRecordLogChannel, PUNISHMENT_TYPES } from '../../services/staffrecords/staffRecordsService.js';

function requireManageGuild(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        throw new AetherError('infraction: missing permission', ErrorTypes.PERMISSION,
            'You need the **Manage Server** permission to use this.');
    }
}

async function handleConfig(interaction) {
    requireManageGuild(interaction);
    const channel = interaction.options.getChannel('log_channel', true);

    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    await setStaffRecordLogChannel(interaction.guildId, channel.id);

    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Staff Records Configured', `Infractions and promotions will now be logged to ${channel}.`)],
    });
}

async function handleIssue(interaction) {
    requireManageGuild(interaction);
    const user = interaction.options.getUser('user', true);
    const punishment = interaction.options.getString('punishment', true);
    const reason = interaction.options.getString('reason', true);

    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const record = await issueInfraction(interaction.guildId, { userId: user.id, issuedBy: interaction.user.id, punishment, reason });

    const config = await getStaffRecordConfig(interaction.guildId);
    if (config.logChannelId) {
        const channel = await interaction.guild.channels.fetch(config.logChannelId).catch(() => null);
        if (channel?.isTextBased()) {
            await channel.send({
                embeds: [createEmbed({
                    title: 'Staff Infraction',
                    color: 'error',
                    fields: [
                        { name: 'Staff Member', value: `<@${user.id}>`, inline: true },
                        { name: 'Punishment', value: punishment, inline: true },
                        { name: 'Issued By', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Reason', value: reason, inline: false },
                        { name: 'Infraction ID', value: `\`${record.id}\``, inline: false },
                    ],
                })],
            }).catch(() => {});
        }
    }

    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Infraction Issued', `Issued **${punishment}** to <@${user.id}>.\nID: \`${record.id}\``)],
    });
}

async function handleVoid(interaction) {
    requireManageGuild(interaction);
    const id = interaction.options.getString('id', true);

    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const record = await voidInfraction(interaction.guildId, id);
    if (!record) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `No infraction found with ID \`${id}\`.` });
    }

    await InteractionHelper.safeReply(interaction, { embeds: [successEmbed('Infraction Voided', `\`${record.id}\` has been voided.`)] });
}

async function handleHistory(interaction) {
    const user = interaction.options.getUser('user', true);
    await InteractionHelper.safeDefer(interaction);

    const records = await getInfractionsForUser(interaction.guildId, user.id);
    if (records.length === 0) {
        return await InteractionHelper.safeReply(interaction, { embeds: [infoEmbed('No Infractions', `<@${user.id}> has no infraction history.`)] });
    }

    const lines = records.slice(0, 15).map((r) => `${r.voided ? '~~' : ''}\`${r.id}\` **${r.punishment}** — ${r.reason} (<t:${Math.floor(r.issuedAt / 1000)}:d>)${r.voided ? '~~ (voided)' : ''}`);
    await InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({ title: `Infraction History — ${user.tag || user.username}`, description: lines.join('\n'), color: 'info' })],
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName('infraction')
        .setDescription('Issue and manage staff infractions')
        .addSubcommand((sub) => sub
            .setName('issue')
            .setDescription('Issue an infraction to a staff member')
            .addUserOption((o) => o.setName('user').setDescription('Staff member').setRequired(true))
            .addStringOption((o) => o.setName('punishment').setDescription('Punishment level').setRequired(true)
                .addChoices(...PUNISHMENT_TYPES.map((p) => ({ name: p, value: p }))))
            .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('void')
            .setDescription('Void an infraction')
            .addStringOption((o) => o.setName('id').setDescription('Infraction ID, e.g. #ABCDEF').setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('history')
            .setDescription("View a staff member's infraction history")
            .addUserOption((o) => o.setName('user').setDescription('Staff member').setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('config')
            .setDescription('Set the channel infractions and promotions are logged to')
            .addChannelOption((o) => o.setName('log_channel').setDescription('Log channel').setRequired(true))),

    async execute(interaction) {
        try {
            switch (interaction.options.getSubcommand()) {
                case 'issue': return await handleIssue(interaction);
                case 'void': return await handleVoid(interaction);
                case 'history': return await handleHistory(interaction);
                case 'config': return await handleConfig(interaction);
            }
        } catch (error) {
            if (error instanceof AetherError) {
                return await replyUserError(interaction, { type: error.type || ErrorTypes.VALIDATION, message: error.userMessage || 'Something went wrong.' });
            }
            await handleInteractionError(interaction, error, { command: 'infraction' });
        }
    },
};
