import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, AetherError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { createEmbed, successEmbed, infoEmbed, formatCodeBlock } from '../../utils/embeds.js';
import {
    getErlcConfig,
    setErlcServerKey,
    clearErlcConfig,
    updateErlcConfigSettings,
    getServerStatus,
    runServerCommand,
} from '../../services/erlc/erlcService.js';

// Roblox player/staff strings from the API come as "Username:Id" — split
// that out for nicer display rather than showing the raw combined string.
function splitPlayerString(raw) {
    const idx = raw.lastIndexOf(':');
    if (idx === -1) return { username: raw, id: null };
    return { username: raw.slice(0, idx), id: raw.slice(idx + 1) };
}

function requireManageGuild(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        throw new AetherError(
            'erlc: missing Manage Server permission',
            ErrorTypes.PERMISSION,
            'You need the **Manage Server** permission to use this.',
        );
    }
}

async function handleSetup(interaction) {
    requireManageGuild(interaction);
    const serverKey = interaction.options.getString('server_key', true).trim();
    const sessionChannel = interaction.options.getChannel('session_channel');
    const sessionRole = interaction.options.getRole('session_role');
    const loaRole = interaction.options.getRole('loa_role');
    const onDutyRole = interaction.options.getRole('on_duty_role');

    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const config = await setErlcServerKey(interaction.guildId, serverKey, interaction.user.id);

    const extra = {};
    if (sessionChannel) extra.sessionChannelId = sessionChannel.id;
    if (sessionRole) extra.sessionRoleId = sessionRole.id;
    if (loaRole) extra.loaRoleId = loaRole.id;
    if (onDutyRole) extra.onDutyRoleId = onDutyRole.id;
    if (Object.keys(extra).length > 0) {
        await updateErlcConfigSettings(interaction.guildId, extra);
    }

    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed(
            'ER:LC Connected',
            `This server is now linked to your ER:LC private server. Configured by <@${config.configuredBy}>.\n\nTry \`/erlc status\` to confirm everything's working.`,
        )],
    });
}

async function handleDisconnect(interaction) {
    requireManageGuild(interaction);
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    const existing = await getErlcConfig(interaction.guildId);
    if (!existing) {
        return await InteractionHelper.safeReply(interaction, {
            embeds: [infoEmbed('Nothing to Disconnect', 'ER:LC isn\'t set up for this server.')],
        });
    }

    await clearErlcConfig(interaction.guildId);
    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('ER:LC Disconnected', 'The stored server key has been removed.')],
    });
}

async function handleStatus(interaction) {
    await InteractionHelper.safeDefer(interaction);

    const data = await getServerStatus(interaction.guildId, ['Queue']);

    const embed = createEmbed({
        title: `🚔 ${data.Name}`,
        color: 'success',
        fields: [
            { name: 'Players', value: `${data.CurrentPlayers}/${data.MaxPlayers}`, inline: true },
            { name: 'Queue', value: `${data.Queue?.length ?? 0}`, inline: true },
            { name: 'Join Code', value: formatCodeBlock(data.JoinKey), inline: true },
            { name: 'Account Verification', value: data.AccVerifiedReq || 'Disabled', inline: true },
            { name: 'Team Balance', value: data.TeamBalance ? 'On' : 'Off', inline: true },
        ],
    });

    await InteractionHelper.safeReply(interaction, { embeds: [embed] });
}

async function handlePlayers(interaction) {
    await InteractionHelper.safeDefer(interaction);

    const data = await getServerStatus(interaction.guildId, ['Players']);
    const players = data.Players || [];

    if (players.length === 0) {
        return await InteractionHelper.safeReply(interaction, {
            embeds: [infoEmbed('No Players In-Game', `${data.Name} currently has no players.`)],
        });
    }

    const lines = players.slice(0, 40).map((p) => {
        const { username } = splitPlayerString(p.Player);
        const callsign = p.Callsign ? ` \`${p.Callsign}\`` : '';
        const wanted = p.WantedStars > 0 ? ` ⭐×${p.WantedStars}` : '';
        return `**${username}**${callsign} — ${p.Team}${wanted}`;
    });

    const embed = createEmbed({
        title: `Players — ${data.Name} (${players.length}/${data.MaxPlayers})`,
        description: lines.join('\n'),
        color: 'info',
    });
    if (players.length > 40) {
        embed.setFooter({ text: `+${players.length - 40} more not shown` });
    }

    await InteractionHelper.safeReply(interaction, { embeds: [embed] });
}

async function handleCommand(interaction) {
    requireManageGuild(interaction);
    const command = interaction.options.getString('command', true).trim();

    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    await runServerCommand(interaction.guildId, command);

    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Command Sent', formatCodeBlock(command))],
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName('erlc')
        .setDescription('Manage this server\'s ER:LC (Emergency Response: Liberty County) integration')
        .addSubcommand((sub) => sub
            .setName('setup')
            .setDescription('Connect this Discord server to an ER:LC private server')
            .addStringOption((opt) => opt
                .setName('server_key')
                .setDescription('Your private server\'s API key (ER:LC Settings > API key)')
                .setRequired(true))
            .addChannelOption((opt) => opt
                .setName('session_channel')
                .setDescription('Channel for /session announcements')
                .setRequired(false))
            .addRoleOption((opt) => opt
                .setName('session_role')
                .setDescription('Role to ping for session announcements')
                .setRequired(false))
            .addRoleOption((opt) => opt
                .setName('loa_role')
                .setDescription('Role auto-applied while a staff member is on LOA')
                .setRequired(false))
            .addRoleOption((opt) => opt
                .setName('on_duty_role')
                .setDescription('Role auto-applied while a staff member has an active shift')
                .setRequired(false)))
        .addSubcommand((sub) => sub
            .setName('status')
            .setDescription('View live status for the connected ER:LC server'))
        .addSubcommand((sub) => sub
            .setName('players')
            .setDescription('List players currently in the ER:LC server'))
        .addSubcommand((sub) => sub
            .setName('command')
            .setDescription('Run a command in the ER:LC server (staff only)')
            .addStringOption((opt) => opt
                .setName('command')
                .setDescription('The in-game command to run, e.g. :h Hello!')
                .setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('disconnect')
            .setDescription('Remove this server\'s ER:LC connection')),

    async execute(interaction, config, client) {
        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'setup':
                    return await handleSetup(interaction);
                case 'disconnect':
                    return await handleDisconnect(interaction);
                case 'status':
                    return await handleStatus(interaction);
                case 'players':
                    return await handlePlayers(interaction);
                case 'command':
                    return await handleCommand(interaction);
                default:
                    logger.warn(`Unknown /erlc subcommand: ${subcommand}`);
            }
        } catch (error) {
            if (error instanceof AetherError) {
                return await replyUserError(interaction, {
                    type: error.type || ErrorTypes.VALIDATION,
                    message: error.userMessage || 'Something went wrong.',
                });
            }
            await handleInteractionError(interaction, error, { command: 'erlc' });
        }
    },
};
