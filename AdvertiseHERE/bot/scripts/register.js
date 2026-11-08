import 'dotenv/config';
import {REST,Routes} from 'discord.js';
import {commands} from '../src/commands.js';
if(!process.env.DISCORD_TOKEN||!/^\d{17,20}$/.test(process.env.DISCORD_CLIENT_ID||''))throw new Error('Set DISCORD_TOKEN and DISCORD_CLIENT_ID before registering commands.');
const rest=new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);
await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),{body:commands});
console.log(`Registered ${commands.length} global slash commands.`);
