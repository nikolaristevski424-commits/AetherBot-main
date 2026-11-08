import {SlashCommandBuilder,PermissionFlagsBits} from 'discord.js';
export const commands = [
 new SlashCommandBuilder().setName('listing').setDescription('Submit and manage a Discord server listing')
  .addSubcommand(s=>s.setName('submit').setDescription('Submit this Discord server for website approval')
   .addStringOption(o=>o.setName('name').setDescription('Directory name').setRequired(true).setMinLength(3).setMaxLength(90))
   .addStringOption(o=>o.setName('summary').setDescription('Short description').setRequired(true).setMinLength(10).setMaxLength(220))
   .addStringOption(o=>o.setName('description').setDescription('Full description').setRequired(true).setMinLength(20).setMaxLength(1600))
   .addStringOption(o=>o.setName('invite').setDescription('Discord invite URL').setRequired(true))
   .addStringOption(o=>o.setName('category').setDescription('Directory category').setRequired(true).addChoices(
    {name:'Roleplay',value:'roleplay'},{name:'Design',value:'design'},{name:'Development',value:'development'},
    {name:'Community',value:'community'},{name:'Bots',value:'bots'},{name:'Marketplace',value:'marketplace'},{name:'Hiring',value:'hiring'},{name:'Other',value:'other'})))
  .addSubcommand(s=>s.setName('status').setDescription('See the status of this server listing'))
  .addSubcommand(s=>s.setName('remove').setDescription('Temporarily unlist this Discord server')),
 new SlashCommandBuilder().setName('bump').setDescription('Promote an approved listing (2-hour cooldown)')
  .addIntegerOption(o=>o.setName('listing_id').setDescription('Optional: your owned listing ID when using the hub').setRequired(false).setMinValue(1)),
 new SlashCommandBuilder().setName('directory').setDescription('Open the AdvertiseHERE public directory'),
 new SlashCommandBuilder().setName('leaderboard').setDescription('Top communities by bumps'),
 new SlashCommandBuilder().setName('stats').setDescription('See real AdvertiseHERE listing statistics'),
 new SlashCommandBuilder().setName('review').setDescription('Staff-only listing moderation')
  .addSubcommand(s=>s.setName('approve').setDescription('Publish a pending listing')
   .addIntegerOption(o=>o.setName('id').setDescription('Listing ID').setRequired(true).setMinValue(1)))
  .addSubcommand(s=>s.setName('reject').setDescription('Reject a submitted listing')
   .addIntegerOption(o=>o.setName('id').setDescription('Listing ID').setRequired(true).setMinValue(1))
   .addStringOption(o=>o.setName('reason').setDescription('Clear reason for rejection').setRequired(true).setMinLength(5).setMaxLength(250)))
].map(command=>command.toJSON());
