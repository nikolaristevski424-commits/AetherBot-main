/** Aether Base Dispatch (Discord). This bot never captures, transcribes, or stores voice audio.
 * The voice channel is a passive radio station with optional outbound attention tones.
 */
import { Readable } from 'node:stream';

const stations = new Map();
const SIGNAL_COOLDOWN_MS = 12_000;
let voiceLibrary;
async function library() {
  if (voiceLibrary) return voiceLibrary;
  try { voiceLibrary = await import('@discordjs/voice'); return voiceLibrary; }
  catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') throw new Error('Discord voice support is not installed. Run npm ci with @discordjs/voice in dependencies on Node 22.12+.');
    throw error;
  }
}
function pcmAlert(){
  const rate=48_000, duration=.33, frames=Math.floor(rate*duration);
  const buffer=Buffer.alloc(frames*4); // 48kHz, stereo, signed PCM16
  for(let i=0;i<frames;i++){
    const t=i/rate;
    const fade=Math.min(1,t/.028,(duration-t)/.055);
    const frequency=t<.16?660:880;
    const sample=Math.round(Math.sin(2*Math.PI*frequency*t)*Math.max(0,fade)*3600);
    buffer.writeInt16LE(sample,i*4);buffer.writeInt16LE(sample,i*4+2);
  }
  return buffer;
}
export function getBaseStation(guildId){
  const s=stations.get(guildId);
  return s ? { connected:s.connection?.state?.status==='ready',channelId:s.channelId,startedAt:s.startedAt,alertEnabled:!!s.player } : null;
}
export async function joinBaseStation(guild,voiceChannel){
  const voice=await library();
  const old=stations.get(guild.id);
  if(old){try{old.connection.destroy();}catch{}stations.delete(guild.id);}
  const connection=voice.joinVoiceChannel({
    channelId:voiceChannel.id,guildId:guild.id,adapterCreator:guild.voiceAdapterCreator,
    selfDeaf:true,selfMute:false,
  });
  try{await voice.entersState(connection,voice.VoiceConnectionStatus.Ready,15_000);}
  catch(error){connection.destroy();throw new Error('Could not connect to voice; check Connect/Speak permissions and host network.');}
  const player=voice.createAudioPlayer({behaviors:{noSubscriber:voice.NoSubscriberBehavior.Play}});
  connection.subscribe(player);
  const station={connection,channelId:voiceChannel.id,player,startedAt:Date.now(),lastAlertAt:0};
  stations.set(guild.id,station);
  connection.on(voice.VoiceConnectionStatus.Destroyed,()=>{if(stations.get(guild.id)===station)stations.delete(guild.id);});
  connection.on('error',()=>{ /* Voice errors must not stop the bot or the text dispatch service. */ });
  return getBaseStation(guild.id);
}
export function leaveBaseStation(guildId){
  const s=stations.get(guildId);
  if(!s)return false;
  stations.delete(guildId);
  try{s.player.stop(true);s.connection.destroy();}catch{}
  return true;
}
export async function signalBaseStation(guildId){
  const s=stations.get(guildId);
  if(!s||s.connection?.state?.status!=='ready')return false;
  if(Date.now()-s.lastAlertAt<SIGNAL_COOLDOWN_MS)return false;
  try{
    const voice=await library();
    const resource=voice.createAudioResource(Readable.from([pcmAlert()]),{inputType:voice.StreamType.Raw});
    s.player.play(resource);s.lastAlertAt=Date.now();
    return true;
  }catch{return false;}
}
export function leaveAllBaseStations(){for(const id of [...stations.keys()])leaveBaseStation(id);}
