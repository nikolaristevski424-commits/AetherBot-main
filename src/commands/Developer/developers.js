import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { inspect } from 'node:util';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, AetherError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { createEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { isBotOwner } from '../../config/bot.js';
import { getDisabledCommands, disableCommand, enableCommand, getDisabledCategories, disableCategory, enableCategory } from '../../services/developer/developerService.js';
import { STATUS_TEMPLATES } from '../../services/developer/statusTemplates.js';

// Access is entirely code-level (isBotOwner / OWNER_IDS env var) rather than
// Discord's setDefaultMemberPermissions — a permission flag can't restrict
// to one specific person, only to a role/permission tier. Administrator is
// still set below purely so it doesn't clutter the command list for
// everyone else; the real gate is the check inside execute().
const SUPPORT_GUILD_ID = '1484329369810763796';

function requireDeveloper(interaction) {
    if (!isBotOwner(interaction.user.id)) {
        throw new AetherError('developers: not authorized', ErrorTypes.PERMISSION, 'This command is developer-only.');
    }
}

async function handleDisable(interaction) {
    const commandName = interaction.options.getString('command', true);
    const reason = interaction.options.getString('reason');
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    const disabled = await disableCommand(commandName, reason);
    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Command Disabled', [
            `\`/${commandName}\` is now disabled bot-wide.`,
            reason ? `Reason shown to users: "${reason}"` : 'No reason set — users just see a generic "temporarily disabled" message.',
            `Currently disabled: ${disabled.map((c) => `\`/${c.name}\``).join(', ') || 'none'}`,
        ].join('\n'))],
    });
}

async function handleEnable(interaction) {
    const commandName = interaction.options.getString('command', true);
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    const disabled = await enableCommand(commandName);
    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Command Enabled', `\`/${commandName}\` is enabled again.\nStill disabled: ${disabled.map((c) => `\`/${c.name}\``).join(', ') || 'none'}`)],
    });
}

async function handleListDisabled(interaction) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    const disabled = await getDisabledCommands();
    const disabledCats = await getDisabledCategories();
    await InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({
            title: 'Disabled Commands & Categories',
            color: 'info',
            fields: [
                { name: 'Commands', value: disabled.length ? disabled.map((c) => `\`/${c.name}\`${c.reason ? ` — ${c.reason}` : ''}`).join('\n') : 'None', inline: false },
                { name: 'Categories', value: disabledCats.length ? disabledCats.map((c) => `\`${c.name}\`${c.reason ? ` — ${c.reason}` : ''}`).join('\n') : 'None', inline: false },
            ],
        })],
    });
}

async function handleDisableCategory(interaction) {
    const category = interaction.options.getString('category', true);
    const reason = interaction.options.getString('reason');
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    const disabled = await disableCategory(category, reason);
    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Category Disabled', [
            `Every command in **${category}** is now disabled bot-wide.`,
            reason ? `Reason shown to users: "${reason}"` : 'No reason set.',
            `Currently disabled categories: ${disabled.map((c) => `\`${c.name}\``).join(', ') || 'none'}`,
        ].join('\n'))],
    });
}

async function handleEnableCategory(interaction) {
    const category = interaction.options.getString('category', true);
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    const disabled = await enableCategory(category);
    await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Category Enabled', `**${category}** is enabled again.\nStill disabled: ${disabled.map((c) => `\`${c.name}\``).join(', ') || 'none'}`)],
    });
}

async function handleStats(interaction) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    const client = interaction.client;
    const uptimeSec = Math.floor(client.uptime / 1000);
    await InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({
            title: '📊 Aether Dev Stats',
            color: 'info',
            fields: [
                { name: 'Guilds', value: `${client.guilds.cache.size}`, inline: true },
                { name: 'Users (cached)', value: `${client.users.cache.size}`, inline: true },
                { name: 'Uptime', value: `<t:${Math.floor((Date.now() - client.uptime) / 1000)}:R>`, inline: true },
                { name: 'Memory', value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`, inline: true },
                { name: 'Node', value: process.version, inline: true },
                { name: 'DB Backend', value: (await import('../../utils/database/wrapper.js')).db.getConnectionType(), inline: true },
            ],
        })],
    });
}

async function handleEval(interaction) {
    const code = interaction.options.getString('code', true);
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

    let output;
    try {
        // eslint-disable-next-line no-eval
        const result = await eval(code);
        output = typeof result === 'string' ? result : inspect(result, { depth: 1 });
    } catch (error) {
        output = `Error: ${error.message}`;
    }

    if (output.length > 3900) output = `${output.slice(0, 3900)}\n...(truncated)`;
    await InteractionHelper.safeReply(interaction, {
        embeds: [createEmbed({ title: 'Eval Result', description: `\`\`\`js\n${output}\n\`\`\``, color: 'info' })],
    });
}

function buildStatusPanel(templateKey, detail) {
    const template = STATUS_TEMPLATES[templateKey];
    const timestampTag = `<t:${Math.floor(Date.now() / 1000)}:f>`;
    const body = template.body
        .replaceAll('{timestamp}', timestampTag)
        .replaceAll('{detail}', detail || 'See below for details.');

    const embed = createEmbed({ title: template.title, description: body, color: template.color });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dev_status_followup').setLabel('Post Follow-up').setEmoji('📝').setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [embed], components: [row] };
}

async function handleStatusSend(interaction) {
    if (interaction.guildId !== SUPPORT_GUILD_ID) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'This can only be used in the support server.' });
    }

    const templateKey = interaction.options.getString('template', true);
    const detail = interaction.options.getString('detail');

    await InteractionHelper.safeDefer(interaction);
    const payload = buildStatusPanel(templateKey, detail);
    await InteractionHelper.safeReply(interaction, payload);
}

export default {
    data: new SlashCommandBuilder()
        .setName('developers')
        .setDescription('Developer-only tools')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((sub) => sub.setName('disable-command').setDescription('Temporarily disable a command bot-wide')
            .addStringOption((o) => o.setName('command').setDescription('Command name, without the slash').setRequired(true))
            .addStringOption((o) => o.setName('reason').setDescription('Shown to anyone who tries to use it while disabled').setRequired(false)))
        .addSubcommand((sub) => sub.setName('enable-command').setDescription('Re-enable a disabled command')
            .addStringOption((o) => o.setName('command').setDescription('Command name, without the slash').setRequired(true)))
        .addSubcommand((sub) => sub.setName('list-disabled').setDescription('List currently disabled commands and categories'))
        .addSubcommand((sub) => sub.setName('disable-category').setDescription('Disable every command in a category bot-wide')
            .addStringOption((o) => o.setName('category').setDescription('Category/folder name, e.g. Economy, ERLC, Moderation').setRequired(true))
            .addStringOption((o) => o.setName('reason').setDescription('Shown to anyone who tries to use a command in it').setRequired(false)))
        .addSubcommand((sub) => sub.setName('enable-category').setDescription('Re-enable a disabled category')
            .addStringOption((o) => o.setName('category').setDescription('Category/folder name').setRequired(true)))
        .addSubcommand((sub) => sub.setName('stats').setDescription('Bot runtime stats'))
        .addSubcommand((sub) => sub.setName('eval').setDescription('Evaluate JS (developer only)')
            .addStringOption((o) => o.setName('code').setDescription('Code to evaluate').setRequired(true)))
        .addSubcommand((sub) => sub.setName('status-send').setDescription('Post a status update (support server only)')
            .addStringOption((o) => o.setName('template').setDescription('Template to send').setRequired(true)
                .addChoices(...Object.entries(STATUS_TEMPLATES).map(([value, t]) => ({ name: t.label, value }))))
            .addStringOption((o) => o.setName('detail').setDescription('Fills in the template\'s detail line, if it has one').setRequired(false))),

    async execute(interaction) {
        try {
            requireDeveloper(interaction);

            switch (interaction.options.getSubcommand()) {
                case 'disable-command': return await handleDisable(interaction);
                case 'enable-command': return await handleEnable(interaction);
                case 'list-disabled': return await handleListDisabled(interaction);
                case 'disable-category': return await handleDisableCategory(interaction);
                case 'enable-category': return await handleEnableCategory(interaction);
                case 'stats': return await handleStats(interaction);
                case 'eval': return await handleEval(interaction);
                case 'status-send': return await handleStatusSend(interaction);
            }
        } catch (error) {
            if (error instanceof AetherError) {
                return await replyUserError(interaction, { type: error.type || ErrorTypes.VALIDATION, message: error.userMessage || 'Something went wrong.' });
            }
            await handleInteractionError(interaction, error, { command: 'developers' });
        }
    },
};
