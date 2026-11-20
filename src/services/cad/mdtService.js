import { randomUUID } from 'node:crypto';
import { deleteFromDb, getFromDb, setInDb } from '../../utils/database.js';
import {
  MDT_MAX_RECORDS, MDT_MAX_BOLOS, normalizeMdtRecord, normalizeMdtBolo,
  isBoloActive, filterMdtRecords, resolveMdtReference, validateMapAnchors,
} from './mdtCore.js';

const keyFor=guildId=>`guild:${guildId}:cad:mdt:v1`;
const queues=new Map();
function normalized(value){
  return {
    records:Array.isArray(value?.records)?value.records:[],
    bolos:Array.isArray(value?.bolos)?value.bolos:[],
    bulletins:Array.isArray(value?.bulletins)?value.bulletins:[],
    calibration:Array.isArray(value?.calibration)?value.calibration:[],
    audit:Array.isArray(value?.audit)?value.audit:[],
    revision:Number.isSafeInteger(value?.revision)?value.revision:0,
  };
}
export async function getMdtState(guildId){ return normalized(await getFromDb(keyFor(guildId),null)); }
async function mutate(guildId,actor,action,fn){
  const previous=queues.get(guildId)||Promise.resolve();
  let unlock;const done=new Promise(resolve=>{unlock=resolve;});
  queues.set(guildId,done);
  await previous;
  try{
    const state=await getMdtState(guildId);
    const result=fn(state);
    // Retain every active record / BOLO. Prune only archived or expired history.
    const activeRecords = state.records.filter(r => r.status !== 'archived');
    const archivedRecords = state.records.filter(r => r.status === 'archived');
    state.records = [...activeRecords, ...archivedRecords.slice(-Math.max(0, MDT_MAX_RECORDS - activeRecords.length))]
      .sort((a,b) => (a.createdAt || 0) - (b.createdAt || 0));
    const activeBolos = state.bolos.filter(b => isBoloActive(b));
    const inactiveBolos = state.bolos.filter(b => !isBoloActive(b));
    state.bolos = [...activeBolos, ...inactiveBolos.slice(-Math.max(0, MDT_MAX_BOLOS - activeBolos.length))]
      .sort((a,b) => (a.createdAt || 0) - (b.createdAt || 0));
    state.bulletins=state.bulletins.slice(-90);
    state.audit.push({id:randomUUID(),action,actorId:actor?.id||'system',at:Date.now()});
    state.audit=state.audit.slice(-600);
    state.revision++;
    if(!await setInDb(keyFor(guildId),state))throw new Error('Could not persist the CAD MDT update.');
    return result;
  }finally{
    unlock();
    if(queues.get(guildId)===done)queues.delete(guildId);
  }
}
export async function createMdtRecord(guildId,actor,input){
  const fields=normalizeMdtRecord(input);
  return mutate(guildId,actor,'record.create',state=>{
    if(state.records.filter(r => r.status !== 'archived').length >= MDT_MAX_RECORDS) {
      throw new Error('The roleplay record limit has been reached. Archive obsolete records before adding more.');
    }
    const now=Date.now();
    const record={id:randomUUID(),...fields,status:'active',createdAt:now,updatedAt:now,createdBy:actor.id};
    state.records.push(record);return record;
  });
}
export async function updateMdtRecord(guildId,actor,id,updates){
  return mutate(guildId,actor,'record.update',state=>{
    const record=resolveMdtReference(state.records,id);
    if(!record||record.status==='archived')return null;
    const fields=normalizeMdtRecord({...record,...updates,kind:record.kind});
    Object.assign(record,fields,{updatedAt:Date.now(),updatedBy:actor.id});
    return record;
  });
}
export async function archiveMdtRecord(guildId,actor,id){
  return mutate(guildId,actor,'record.archive',state=>{
    const record=resolveMdtReference(state.records,id);
    if(!record||record.status==='archived')return null;
    record.status='archived';record.updatedAt=Date.now();record.updatedBy=actor.id;
    return record;
  });
}
export async function createMdtBolo(guildId,actor,input){
  const fields=normalizeMdtBolo(input);
  return mutate(guildId,actor,'bolo.create',state=>{
    if(state.bolos.filter(b => isBoloActive(b)).length >= MDT_MAX_BOLOS) {
      throw new Error('The active roleplay BOLO limit has been reached. Clear old BOLOs before adding more.');
    }
    const bolo={id:randomUUID(),...fields,status:'active',createdAt:Date.now(),createdBy:actor.id};
    state.bolos.push(bolo);return bolo;
  });
}
export async function clearMdtBolo(guildId,actor,id){
  return mutate(guildId,actor,'bolo.clear',state=>{
    const bolo=resolveMdtReference(state.bolos,id);
    if(!bolo||bolo.status!=='active')return null;
    bolo.status='cleared';bolo.clearedAt=Date.now();bolo.clearedBy=actor.id;
    return bolo;
  });
}
export async function logBaseBulletin(guildId,actor,text,channelId){
  if(typeof text!=='string'||text.trim().length<5||text.length>280) throw new Error('Roleplay bulletin must be 5–280 characters.');
  return mutate(guildId,actor,'base.bulletin',state=>{
    const now=Date.now();
    if(state.bulletins.some(b=>b.actorId===actor.id&&now-b.at<15_000))
      throw new Error('Please wait 15 seconds between Base Dispatch bulletins.');
    const entry={id:randomUUID(),message:text.trim(),actorId:actor.id,actorName:actor.username,channelId,at:now};
    state.bulletins.push(entry);return entry;
  });
}

export async function setMdtCalibration(guildId,actor,anchors){
  const {anchors:valid,transform}=validateMapAnchors(anchors);
  return mutate(guildId,actor,'calibration.update',state=>{
    state.calibration=valid;return {anchors:valid,transform};
  });
}
export async function searchMdt(guildId,query='',limit=60){
  const state=await getMdtState(guildId);
  const q=typeof query==='string'?query.trim().slice(0,100).toLowerCase():'';
  return {
    records:filterMdtRecords(state.records,q,limit),
    bolos:state.bolos.filter(b=>isBoloActive(b) && (!q||[b.subject,b.details,b.location].some(v=>String(v||'').toLowerCase().includes(q))))
      .slice(-limit).reverse(),
    calibration:state.calibration,
    bulletins:state.bulletins.slice(-25).reverse(),
    revision:state.revision,
  };
}
export async function clearMdtGuild(guildId){return deleteFromDb(keyFor(guildId));}
