import {
    SlashCommandBuilder, PermissionFlagsBits, MessageFlags,
    ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, AetherError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { createEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import {
    getRobloxConfig,
    setRobloxConfig,
    addGroupMapping,
    removeGroupMapping,
    beginVerification,
    getProfile,
    findProfileByRobloxUsername,
    syncGroupRoles,
    unverify,
} from '../../services/roblox/robloxVerificationService.js';
import { getRobloxUserById } from '../../services/roblox/robloxApi.js';

function requireManageGuild(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        throw new AetherError('roblox: missing permission', ErrorTypes.PERMISSION,
            'You need the **Manage Server** permission to use this.');
    }
}

function isImageAttachment(attachment) {
    if (!attachment) return true;
    if (attachment.contentType?.startsWith('image/')) return true;
    return /\.(png|jpe?g|gif|webp)$/i.test(attachment.name || '');
}

function addPanelImage(container, url, description) {
    if (!url) return;
    container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url).setDescription(description)),
    );
}

export function buildVerificationPanel(config) {
    const container = new ContainerBuilder();
    addPanelImage(container, config?.topBanner, 'Verification banner');

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
        '## Roblox Verification',
        'Connect your Roblox account to your Discord profile.',
        '',
        '**How it works**',
        '1. Click **Verify** below.',
        '2. Enter your Roblox username.',
        '3. Copy the verification phrase into your Roblox **About / Description**.',
        '4. Return here and click **Done**.',
        '5. Your role (and any group ranks) will be applied automatically.',
    ].join('\n')));

    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('roblox_verify_start').setLabel('Verify').setEmoji('✅').setStyle(ButtonStyle.Success),
    ));

    addPanelImage(container, config?.lowerBanner, 'Verification footer');
    return container;
}

async function handleSetup(interaction) {
    requireManageGuild(interaction);
    const role = interaction.options.getRole('verified_role', true);
    const topBanner = interaction.options.getAttachment('top_banner');
    const lowerBanner = interaction.options.getAttachment('lower_banner');

    if (role.managed) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'That role is managed by Discord/an integration and can\'t be assigned manually.' });
    }
    if ((topBanner && !isImageAttachment(topBanner)) || (lowerBanner && !isImageAttachment(lowerBanner))) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Banner attachments must be images.' });
    }

    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const updates = { verifiedRoleId: role.id };
    if (topBanner) updates.topBanner = topBanner.url;
    if (lowerBanner) updates.lowerBanner = lowerBanner.url;
    await setRobloxConfig(interaction.guildId, updates, interaction.user.id);

    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Roblox Verification Configured', `Verified role set to ${role}. Run \`/roblox panel\` to post the verification panel, or \`/roblox link\` to test it yourself.`)],
    });
}

async function handlePanel(interaction) {
    requireManageGuild(interaction);
    const config = await getRobloxConfig(interaction.guildId);
    if (!config?.verifiedRoleId) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Run `/roblox setup` first.' });
    }

    await interaction.reply({ components: [buildVerificationPanel(config)], flags: MessageFlags.IsComponentsV2 });
}

async function handleLink(interaction) {
    const { buildUsernameModal } = await import('../../interactions/modals/roblox/robloxUsernameModal.js');
    return interaction.showModal(buildUsernameModal());
}

async function handleWhois(interaction) {
    await InteractionHelper.safeDefer(interaction);
    const targetUser = interaction.options.getUser('user');
    const robloxUsername = interaction.options.getString('roblox');

    let profile;
    let discordId;
    if (robloxUsername) {
        profile = await findProfileByRobloxUsername(interaction.guildId, robloxUsername);
        discordId = profile?.discordUserId;
    } else {
        discordId = targetUser?.id || interaction.user.id;
        profile = await getProfile(interaction.guildId, discordId);
    }

    if (!profile) {
        return await InteractionHelper.safeReply(interaction, {
            embeds: [infoEmbed('No Profile Found', 'No verified Roblox profile saved for that user.')],
        });
    }

    const embed = createEmbed({
        title: 'Roblox Profile',
        color: 'info',
        fields: [
            { name: 'Discord', value: `<@${discordId}>`, inline: true },
            { name: 'Roblox Username', value: profile.robloxUsername, inline: true },
            { name: 'Roblox Display Name', value: profile.robloxDisplayName || profile.robloxUsername, inline: true },
            { name: 'Roblox User ID', value: `\`${profile.robloxUserId}\``, inline: true },
            { name: 'Verified', value: `<t:${Math.floor(profile.verifiedAt / 1000)}:R>`, inline: true },
            { name: 'Profile', value: `https://www.roblox.com/users/${profile.robloxUserId}/profile`, inline: false },
        ],
    });
    await InteractionHelper.safeReply(interaction, { embeds: [embed] });
}

async function handleSync(interaction) {
    const targetUser = interaction.options.getUser('user');
    if (targetUser && targetUser.id !== interaction.user.id) {
        requireManageGuild(interaction);
    }

    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const discordId = targetUser?.id || interaction.user.id;
    const profile = await getProfile(interaction.guildId, discordId);
    if (!profile) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `<@${discordId}> isn't verified yet.` });
    }

    const member = await interaction.guild.members.fetch(discordId).catch(() => null);
    if (!member) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'That member is no longer in this server.' });
    }

    const result = await syncGroupRoles(interaction.guild, member, profile.robloxUserId);
    const summary = [
        result.added.length ? `**Added:** ${result.added.map((id) => `<@&${id}>`).join(', ')}` : null,
        result.removed.length ? `**Removed:** ${result.removed.map((id) => `<@&${id}>`).join(', ')}` : null,
    ].filter(Boolean).join('\n') || 'No changes — roles already match current group ranks.';

    await InteractionHelper.safeReply(interaction, { embeds: [successEmbed('Group Roles Synced', summary)] });
}

async function handleGroupAdd(interaction) {
    requireManageGuild(interaction);
    const groupId = interaction.options.getInteger('group_id', true);
    const minRank = interaction.options.getInteger('min_rank', true);
    const role = interaction.options.getRole('role', true);
    const nicknamePrefix = interaction.options.getString('nickname_prefix');

    if (role.managed) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'That role is managed by Discord/an integration and can\'t be assigned manually.' });
    }

    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    // Best-effort group name lookup for nicer display; falls back to the ID.
    let groupName = `Group ${groupId}`;
    try {
        const res = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`);
        if (res.ok) {
            const data = await res.json();
            if (data?.name) groupName = data.name;
        }
    } catch {
        // Non-fatal — the mapping still works keyed by ID.
    }

    await addGroupMapping(interaction.guildId, { groupId, groupName, minRank, roleId: role.id, nicknamePrefix }, interaction.user.id);

    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Group Mapping Added', `Members ranked **${minRank}+** in **${groupName}** (\`${groupId}\`) will get ${role}${nicknamePrefix ? ` and a \`${nicknamePrefix}\` nickname prefix` : ''}.`)],
    });
}

async function handleGroupRemove(interaction) {
    requireManageGuild(interaction);
    const groupId = interaction.options.getInteger('group_id', true);

    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    await removeGroupMapping(interaction.guildId, groupId, interaction.user.id);

    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Group Mapping Removed', `Rank mappings for group \`${groupId}\` have been removed.`)],
    });
}

async function handleUnverify(interaction) {
    const targetUser = interaction.options.getUser('user');
    if (targetUser && targetUser.id !== interaction.user.id) {
        requireManageGuild(interaction);
    }

    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    const discordId = targetUser?.id || interaction.user.id;
    const removed = await unverify(interaction.guildId, discordId);

    await InteractionHelper.safeReply(interaction, {
        embeds: [removed
            ? successEmbed('Unverified', `Removed the saved Roblox link for <@${discordId}>. Discord roles were left as-is — remove them manually if needed.`)
            : infoEmbed('Nothing to Remove', `<@${discordId}> doesn't have a saved Roblox profile.`)],
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName('roblox')
        .setDescription('Roblox account verification and group rank sync')
        .addSubcommand((sub) => sub.setName('setup').setDescription('Configure Roblox verification for this server')
            .addRoleOption((o) => o.setName('verified_role').setDescription('Role given after successful verification').setRequired(true))
            .addAttachmentOption((o) => o.setName('top_banner').setDescription('Optional top banner for the verification panel').setRequired(false))
            .addAttachmentOption((o) => o.setName('lower_banner').setDescription('Optional lower banner for the verification panel').setRequired(false)))
        .addSubcommand((sub) => sub.setName('panel').setDescription('Post the Roblox verification panel in this channel'))
        .addSubcommand((sub) => sub.setName('link').setDescription('Link your Roblox account (no panel needed)'))
        .addSubcommand((sub) => sub.setName('whois').setDescription('Look up a verified Roblox profile')
            .addUserOption((o) => o.setName('user').setDescription('Discord user to look up').setRequired(false))
            .addStringOption((o) => o.setName('roblox').setDescription('Roblox username to look up').setRequired(false)))
        .addSubcommand((sub) => sub.setName('sync').setDescription('Re-sync group rank roles from current Roblox group standing')
            .addUserOption((o) => o.setName('user').setDescription('Sync someone else (staff only; defaults to you)').setRequired(false)))
        .addSubcommand((sub) => sub.setName('group-add').setDescription('Map a Roblox group rank threshold to a Discord role')
            .addIntegerOption((o) => o.setName('group_id').setDescription('Roblox group ID').setRequired(true).setMinValue(1))
            .addIntegerOption((o) => o.setName('min_rank').setDescription('Minimum rank (1-255) required for this role').setRequired(true).setMinValue(1).setMaxValue(255))
            .addRoleOption((o) => o.setName('role').setDescription('Discord role to assign').setRequired(true))
            .addStringOption((o) => o.setName('nickname_prefix').setDescription('Optional nickname prefix, e.g. [Chief]').setRequired(false)))
        .addSubcommand((sub) => sub.setName('group-remove').setDescription('Remove all rank mappings for a Roblox group')
            .addIntegerOption((o) => o.setName('group_id').setDescription('Roblox group ID').setRequired(true).setMinValue(1)))
        .addSubcommand((sub) => sub.setName('unverify').setDescription('Remove a saved Roblox verification')
            .addUserOption((o) => o.setName('user').setDescription('Unverify someone else (staff only; defaults to you)').setRequired(false))),

    async execute(interaction, config, client) {
        try {
            switch (interaction.options.getSubcommand()) {
                case 'setup': return await handleSetup(interaction);
                case 'panel': return await handlePanel(interaction);
                case 'link': return await handleLink(interaction);
                case 'whois': return await handleWhois(interaction);
                case 'sync': return await handleSync(interaction);
                case 'group-add': return await handleGroupAdd(interaction);
                case 'group-remove': return await handleGroupRemove(interaction);
                case 'unverify': return await handleUnverify(interaction);
            }
        } catch (error) {
            if (error instanceof AetherError) {
                return await replyUserError(interaction, { type: error.type || ErrorTypes.VALIDATION, message: error.userMessage || 'Something went wrong.' });
            }
            await handleInteractionError(interaction, error, { command: 'roblox' });
        }
    },
};
