/** ER:LC dispatch normalization. Kept dependency-free for fast unit tests. */
export const MAP_SIZE = 5355;
export const MAP_HALF = MAP_SIZE / 2;

function field(value, limit = 100) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

/** PRC v2 world coordinates use the map centre as (0,0), X right, Z down. */
export function projectWorldToMap(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const px = x + MAP_HALF;
  const py = z + MAP_HALF;
  if (px < 0 || py < 0 || px > MAP_SIZE || py > MAP_SIZE) return null;
  return { xPercent: px / MAP_SIZE * 100, yPercent: py / MAP_SIZE * 100 };
}

export function validate911Input(input) {
  const title = field(input?.title, 100);
  const location = field(input?.location, 100);
  const details = field(input?.details, 1000);
  if (title.length < 5 || location.length < 3 || details.length < 10) {
    throw new Error('Provide a title (5+ characters), location (3+), and details (10+).');
  }
  const x = input?.x, z = input?.z;
  if ((x === undefined) !== (z === undefined)) throw new Error('Provide both map coordinates, X and Z, or neither.');
  if (x !== undefined && !projectWorldToMap(x, z)) throw new Error('Coordinates are outside the ER:LC map.');
  return { title, location, details, ...(x === undefined ? {} : { positionX: x, positionZ: z }) };
}

export function normalizeErlc911(entry) {
  if (!entry || typeof entry !== 'object' || !Number.isInteger(entry.CallNumber)
      || !Number.isFinite(entry.StartedAt) || entry.StartedAt <= 0) return null;
  const stamp = Math.round(entry.StartedAt < 1e12 ? entry.StartedAt * 1000 : entry.StartedAt);
  if (stamp > Date.now() + 5 * 60_000 || stamp < Date.now() - 30 * 24 * 3600_000) return null;
  const pos = Array.isArray(entry.Position) && entry.Position.length === 2
    ? projectWorldToMap(entry.Position[0], entry.Position[1]) : null;
  const description = field(entry.Description, 1000);
  const area = field(entry.PositionDescriptor, 100);
  const team = field(entry.Team, 32);
  return {
    externalKey: `${entry.CallNumber}:${stamp}`,
    externalCallNumber: entry.CallNumber,
    title: (description || `${team || 'Emergency'} call`).slice(0, 100),
    location: area || 'Reported from ER:LC — see map',
    details: description,
    team,
    callerRobloxId: Number.isSafeInteger(entry.Caller) ? String(entry.Caller) : null,
    createdAt: stamp,
    ...(pos ? { positionX: entry.Position[0], positionZ: entry.Position[1] } : {}),
  };
}

export function findCallByReference(calls, reference) {
  const id = String(reference || '').trim().toLowerCase();
  if (!/^[a-f0-9-]{8,36}$/.test(id)) return null;
  const matches = calls.filter(call => typeof call.id === 'string' && call.id.toLowerCase().startsWith(id));
  return matches.length === 1 ? matches[0] : null;
}

/**
 * A non-sensitive, bounded dispatcher timeline. Never return arbitrary audit
 * details: they can include staff-only commands, targets or other metadata.
 */
export function projectDispatchActivity(audit, limit = 20) {
  if (!Array.isArray(audit)) return [];
  const visible = new Set([
    'call.created', 'call.updated', 'call.closed', 'call.unit_assigned',
    '911.discord_reported', '911.ingame_imported',
  ]);
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 30)) : 20;
  return audit.filter(item => item && visible.has(item.action))
    .slice(-safeLimit).reverse().map(item => ({
      id: typeof item.id === 'string' ? item.id : null,
      action: item.action,
      at: Number.isFinite(item.at) ? item.at : null,
      actorName: String(item.actorName || 'CAD').slice(0, 80),
      callId: typeof item.details?.callId === 'string' ? item.details.callId.slice(0, 8).toUpperCase() : null,
    }));
}
