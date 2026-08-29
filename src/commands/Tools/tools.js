import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';

// Consolidated from 11 separate top-level commands into subcommands of one,
// to free up top-level command slots. Each subcommand reuses the exact
// option definitions already declared in its module's own `data` builder
// (copied by reference, not retyped) so nothing about the original command
// — including generated choice lists like baseconvert's base names — can
// drift out of sync with what's actually implemented in the handler.

import baseconvert from './modules/baseconvert.js';
import calculate from './modules/calculate.js';
import countdown from './modules/countdown.js';
import embedbuilder from './modules/embedbuilder.js';
import generatepassword from './modules/generatepassword.js';
import hexcolor from './modules/hexcolor.js';
import poll from './modules/poll.js';
import randomuser from './modules/randomuser.js';
import shorten from './modules/shorten.js';
import time from './modules/time.js';
import unixtime from './modules/unixtime.js';
import jsonembed from './modules/jsonembed.js';

const TOOL_MODULES = {
    'base-convert': baseconvert,
    calculate,
    countdown,
    'embed-builder': embedbuilder,
    password: generatepassword,
    'hex-color': hexcolor,
    poll,
    'random-user': randomuser,
    shorten,
    time,
    'unix-time': unixtime,
    'json-embed': jsonembed,
};

function addSubcommandFor(builder, subName, module) {
    return builder.addSubcommand((sub) => {
        sub.setName(subName).setDescription(module.data.description);
        // Reuse the module's own already-declared options verbatim.
        sub.options = module.data.options;
        return sub;
    });
}

const data = new SlashCommandBuilder()
    .setName('tools')
    .setDescription('Utility tools: conversions, generators, and small helpers');

for (const [subName, module] of Object.entries(TOOL_MODULES)) {
    addSubcommandFor(data, subName, module);
}

export default {
    data,

    async execute(interaction, config, client) {
        const subName = interaction.options.getSubcommand();
        const module = TOOL_MODULES[subName];

        if (!module) {
            logger.warn(`Unknown /tools subcommand: ${subName}`);
            return;
        }

        return module.execute(interaction, config, client);
    },
};
