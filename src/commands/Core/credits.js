import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

// Keep this in sync with THIRD_PARTY_NOTICES.md — this is the live, in-bot
// side of the same credits; that file has the full license text for each.
const CREDITS = [
    {
        name: 'TitanBot',
        by: 'codebymitch',
        note: 'Original foundation Aether was built on top of.',
        license: 'MIT',
    },
    {
        name: 'discord-roblox-group-verification-bot',
        by: 'johnrich.dev',
        note: 'Group rank -> Discord role sync design referenced for /roblox.',
        license: 'MIT',
    },
    {
        name: 'ERLC-UTILITY-BOT',
        by: 'SEJED-DEV',
        note: 'Session/staff-management feature set referenced for /erlc.',
        license: 'MIT (requires this credit)',
    },
];

export default {
    data: new SlashCommandBuilder()
        .setName('credits')
        .setDescription('Third-party projects and licenses Aether is built on'),

    async execute(interaction) {
        try {
            const embed = createEmbed({
                title: 'Credits',
                description: 'Aether is built in part on top of the open-source projects below. Full license text for each lives in `THIRD_PARTY_NOTICES.md` in the repo.',
                color: 'info',
                fields: CREDITS.map((c) => ({
                    name: c.name,
                    value: `By **${c.by}** — ${c.note}\nLicense: ${c.license}`,
                    inline: false,
                })),
            });
            await InteractionHelper.safeReply(interaction, { embeds: [embed] });
        } catch (error) {
            await handleInteractionError(interaction, error, { command: 'credits' });
        }
    },
};
