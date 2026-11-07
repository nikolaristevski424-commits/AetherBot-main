import { randomUUID } from 'node:crypto';
import { getFromDb, setInDb } from '../utils/database.js';

const keyFor = (guildId) => 'guild:' + guildId + ':cad:v2';
const MAX_INCIDENTS = 750;
const MAX_BOLOS = 150;
const MAX_AUDIT = 1200;
const locks = new Map();
export const INCIDENT_STATUSES = ['pending', 'dispatched', 'on_scene', 'closed'];
export const UNIT_STATUSES_V2 = ['available', 'busy', 'on_scene', 'off_duty'];
export const PRIORITIES = ['routine', 'high', 'critical'];

function normalize(raw) {
  return {
    incidents: Array.isArray(raw?.incidents) ? raw.incidents : [],
    units: Array.isArray(raw?.units) ? raw.units : [],
    bolos: Array.isArray(raw?.bolos) ? raw.bolos : [],
    audit: Array.isArray(raw?.audit) ? raw.audit : [],
    revision: Number.isSafeInteger(raw?.revision) ? raw.revision : 0,
  };
}

export async function getCadV2State(guildId) {
  return normalize(await getFromDb(keyFor(guildId), null));
}
function audit(state, actor, action, details) {
  state.audit.push({
    id: randomUUID(), at: Date.now(), actorId: actor.id,
    actorName: actor.username, action, details,
  });
}
async function mutate(guildId, actor, action, handler) {
  // Serialize read-modify-write operations for each guild on this process.
  // A multi-instance deployment needs database-level transactional locking.
  const previous = locks.get(guildId) || Promise.resolve();
  let release;
  const next = new Promise(resolve => { release = resolve; });
  locks.set(guildId, next);
  await previous;
  try {
    const state = await getCadV2State(guildId);
    const result = handler(state);
    audit(state, actor, action, { id: result?.id ?? null });
    state.revision += 1;
    state.incidents = state.incidents.slice(-MAX_INCIDENTS);
    state.bolos = state.bolos.slice(-MAX_BOLOS);
    state.audit = state.audit.slice(-MAX_AUDIT);
    if (!await setInDb(keyFor(guildId), state)) {
      throw new Error('CAD v2 data could not be persisted.');
    }
    return result;
  } finally {
    release();
    if (locks.get(guildId) === next) locks.delete(guildId);
  }
}
function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function problem(message, code = 400) {
  const error = new Error(message);
  error.status = code;
  throw error;
}
export async function createV2Incident(guildId, actor, input) {
  const title = text(input?.title, 100);
  const location = text(input?.location, 120);
  const details = text(input?.details, 1500);
  const priority = input?.priority || 'routine';
  if (!title || !location || !PRIORITIES.includes(priority) ||
      input?.title?.length > 100 || input?.location?.length > 120 ||
      (input?.details != null && (typeof input.details !== 'string' || input.details.length > 1500))) {
    problem('Provide a valid title, location, priority, and optional details.');
  }
  return mutate(guildId, actor, 'incident.created', state => {
    const id = randomUUID();
    const now = Date.now();
    const incident = {
      id, reference: 'AE-' + id.split('-')[0].toUpperCase(),
      title, location, details, priority,
      status: 'pending', assignedUnitIds: [], createdAt: now, updatedAt: now,
      createdBy: actor.id, createdByName: actor.username,
    };
    state.incidents.push(incident);
    return incident;
  });
}
export async function updateV2Incident(guildId, actor, incidentId, input) {
  const status = input?.status;
  const assignedUnitIds = input?.assignedUnitIds;
  if (status === undefined && assignedUnitIds === undefined) problem('Nothing to update.');
  if (status !== undefined && !INCIDENT_STATUSES.includes(status)) problem('Invalid incident status.');
  if (assignedUnitIds !== undefined &&
      (!Array.isArray(assignedUnitIds) || assignedUnitIds.length > 20 ||
       assignedUnitIds.some(id => typeof id !== 'string' || !/^\d{17,20}$/.test(id)) ||
       new Set(assignedUnitIds).size !== assignedUnitIds.length)) problem('Invalid assigned units.');
  return mutate(guildId, actor, 'incident.updated', state => {
    const incident = state.incidents.find(entry => entry.id === incidentId);
    if (!incident) problem('Incident not found.', 404);
    if (assignedUnitIds && assignedUnitIds.some(id => !state.units.some(unit => unit.userId === id && unit.status !== 'off_duty'))) {
      problem('Only on-duty CAD units may be assigned.', 409);
    }
    if (status) {
      incident.status = status;
      if (status === 'closed') incident.closedAt = Date.now();
      else delete incident.closedAt;
    }
    if (assignedUnitIds) incident.assignedUnitIds = assignedUnitIds;
    incident.updatedAt = Date.now();
    return incident;
  });
}
export async function updateV2Unit(guildId, actor, input) {
  const callsign = text(input?.callsign, 24);
  const status = input?.status;
  if (!callsign || typeof input?.callsign !== 'string' ||
      input.callsign.length > 24 || !UNIT_STATUSES_V2.includes(status)) {
    problem('Provide a callsign (up to 24 characters) and valid duty status.');
  }
  return mutate(guildId, actor, 'unit.updated', state => {
    let unit = state.units.find(entry => entry.userId === actor.id);
    if (!unit) {
      if (state.units.length >= 250) problem('Unit roster is full.', 409);
      unit = { userId: actor.id };
      state.units.push(unit);
    }
    unit.username = actor.username;
    unit.callsign = callsign;
    unit.status = status;
    unit.updatedAt = Date.now();
    return unit;
  });
}
export async function createV2Bolo(guildId, actor, input) {
  const subject = text(input?.subject, 100);
  const description = text(input?.description, 700);
  if (!subject || !description || typeof input?.subject !== 'string' ||
      typeof input?.description !== 'string' || input.subject.length > 100 ||
      input.description.length > 700) problem('Provide a valid subject and description.');
  return mutate(guildId, actor, 'bolo.created', state => {
    const bolo = { id: randomUUID(), subject, description, active: true,
      createdAt: Date.now(), createdBy: actor.id, createdByName: actor.username };
    state.bolos.push(bolo);
    return bolo;
  });
}
export async function archiveV2Bolo(guildId, actor, boloId) {
  return mutate(guildId, actor, 'bolo.archived', state => {
    const bolo = state.bolos.find(item => item.id === boloId);
    if (!bolo) problem('BOLO not found.', 404);
    bolo.active = false;
    bolo.archivedAt = Date.now();
    return bolo;
  });
}
