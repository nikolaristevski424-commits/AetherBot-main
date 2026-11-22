import { MessageFlags } from 'discord.js';
import { getCadGuildAccess, setCadGuildConfig, CAD_EXPERIENCE_MODES } from '../../../services/cad/cadService.js';
import { cadModeLabel, cadWebUrl } from '../../../services/cad/cadDiscordPresentation.js';

export default {
  name:'aether_cad_mode',
  async execute(interaction,client,[selected]) {
    if(!interaction.inGuild())return interaction.reply({content:'Choose a CAD mode in your Discord server.',flags:MessageFlags.Ephemeral});
    const access=await getCadGuildAccess(client,interaction.user.id,interaction.guildId);
    if(!access?.isManager)return interaction.reply({content:'Only members with Manage Server can change CAD settings.',flags:MessageFlags.Ephemeral});
    if(!CAD_EXPERIENCE_MODES.includes(selected))return interaction.reply({content:'Invalid CAD mode. Choose Discord, Web or Hybrid.',flags:MessageFlags.Ephemeral});
    try {
      const result=await setCadGuildConfig(interaction.guildId,{experienceMode:selected});
      const url=cadWebUrl();
      await interaction.update({
        content:`✅ **CAD experience saved: ${cadModeLabel(result.experienceMode)}**\nYour team can use the corresponding commands and web view without losing existing calls or records.\n\n**Next:** run \`/cad dispatch-channel\` and configure dispatch roles in the web CAD settings.\n${url||'Set the public CAD hostname to enable the web workspace.'}`,
        components:[],allowedMentions:{parse:[]}
      });
    }catch{
      await interaction.reply({content:'Could not save CAD mode. Verify the persistent database and try again.',flags:MessageFlags.Ephemeral});
    }
  }
};