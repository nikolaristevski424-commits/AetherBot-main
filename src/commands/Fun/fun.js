import { SlashCommandBuilder } from 'discord.js';
import fight from './modules/fight.js';
import flip from './modules/flip.js';
import roll from './modules/roll.js';

// Consolidated from 3 separate top-level commands into subcommands of one —
// these are simple, low-stakes fun actions, not anything staff need
// top-level muscle memory for. Each subcommand delegates straight to its
// original, unmodified handler logic in ./modules/.

export default {
    data: new SlashCommandBuilder()
        .setName('fun')
        .setDescription('Fun / game commands')
        .addSubcommand((sub) => sub
            .setName('fight')
            .setDescription('Starts a simulated 1v1 text-based battle.')
            .addUserOption((option) => option.setName('opponent').setDescription('The user to fight.').setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('flip')
            .setDescription('Flips a coin (Heads or Tails).'))
        .addSubcommand((sub) => sub
            .setName('roll')
            .setDescription('Rolls dice using standard notation (e.g., 2d20, 1d6 + 5).')
            .addStringOption((option) => option
                .setName('notation')
                .setDescription('The dice notation (e.g., 2d6, 1d20 + 4)')
                .setRequired(true)
                .setMaxLength(50))),

    async execute(interaction, config, client) {
        switch (interaction.options.getSubcommand()) {
            case 'fight': return fight.execute(interaction, config, client);
            case 'flip': return flip.execute(interaction, config, client);
            case 'roll': return roll.execute(interaction, config, client);
        }
    },
};
