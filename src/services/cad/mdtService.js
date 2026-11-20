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
    state.records=state.records.slice(-MDT_MAX_RECORDS);
    state.bolos=state.bolos.slice(-MDT_MAX_BOLOS);
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
    revision:state.revision,
  };
}
export async function clearMdtGuild(guildId){return deleteFromDb(keyFor(guildId));}
