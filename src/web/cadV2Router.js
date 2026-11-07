import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { getCadGuildAccess, getCadState } from '../services/cad/cadService.js';
import {
  getCadV2State, createV2Incident, updateV2Incident,
  updateV2Unit, createV2Bolo, archiveV2Bolo,
} from './cadV2Service.js';

const snowflake = /^\d{17,20}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27,40}$/i;
const mutationLimit = rateLimit({
  windowMs: 60_000, limit: 25, standardHeaders: 'draft-8',
  legacyHeaders: false, message: { error: 'Too many CAD changes. Please try again shortly.' },
});
export function createCadV2Router(getClient) {
  const router = express.Router();
  router.use(express.json({ limit: '16kb', strict: true }));
  router.use((req, res, next) => {
    if (!snowflake.test(req.params.guildId || req.path.split('/')[1])) {
      return res.status(400).json({ error: 'Invalid Discord server ID.' });
    }
    next();
  });
  async function allowed(req, res, level = 'read') {
    try {
      const access = await getCadGuildAccess(getClient(), req.cadSession.profile.id, req.params.guildId);
      if (!access) { res.status(403).json({ error: 'This Discord server is not accessible.' }); return null; }
      const pass = level === 'manage' ? access.isManager
        : level === 'dispatch' ? (access.isManager || access.canDispatch)
        : (access.isManager || access.canDispatch || access.canCommand);
      if (!pass) { res.status(403).json({ error: 'Your Discord role does not permit this action.' }); return null; }
      return access;
    } catch {
      res.status(503).json({ error: 'Could not validate Discord permissions.' });
      return null;
    }
  }
  function handleError(res, error) {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
    return res.status(status).json({ error: status === 500 ? 'The CAD operation could not be completed.' : error.message });
  }
  router.get('/:guildId/board', async (req, res) => {
    const access = await allowed(req, res); if (!access) return;
    try {
      const [state, legacy] = await Promise.all([getCadV2State(req.params.guildId), getCadState(req.params.guildId)]);
      return res.json({
        guild: { id: access.guild.id, name: access.guild.name },
        permissions: { manager: access.isManager, dispatch: access.isManager || access.canDispatch, commands: access.canCommand },
        state: {
          ...state,
          // Tracking stays connected to the existing ER:LC collector, never to a browser-supplied API key.
          players: legacy.players, staff: legacy.staff, playerEvents: legacy.playerEvents?.slice(-100),
          serverOnline: legacy.serverOnline, playerSyncAt: legacy.playerSyncAt,
          ...(access.isManager ? {} : { audit: [] }),
        },
      });
    } catch (error) { return handleError(res, error); }
  });
  router.use(mutationLimit);
  router.post('/:guildId/incidents', async (req, res) => {
    const access = await allowed(req, res, 'dispatch'); if (!access) return;
    try { return res.status(201).json({ incident: await createV2Incident(req.params.guildId, req.cadSession.profile, req.body) }); }
    catch (error) { return handleError(res, error); }
  });
  router.patch('/:guildId/incidents/:id', async (req, res) => {
    const access = await allowed(req, res, 'dispatch'); if (!access) return;
    if (!uuid.test(req.params.id)) return res.status(400).json({ error: 'Invalid incident ID.' });
    try { return res.json({ incident: await updateV2Incident(req.params.guildId, req.cadSession.profile, req.params.id, req.body) }); }
    catch (error) { return handleError(res, error); }
  });
  router.put('/:guildId/unit', async (req, res) => {
    const access = await allowed(req, res, 'dispatch'); if (!access) return;
    try { return res.json({ unit: await updateV2Unit(req.params.guildId, req.cadSession.profile, req.body) }); }
    catch (error) { return handleError(res, error); }
  });
  router.post('/:guildId/bolos', async (req, res) => {
    const access = await allowed(req, res, 'dispatch'); if (!access) return;
    try { return res.status(201).json({ bolo: await createV2Bolo(req.params.guildId, req.cadSession.profile, req.body) }); }
    catch (error) { return handleError(res, error); }
  });
  router.patch('/:guildId/bolos/:id/archive', async (req, res) => {
    const access = await allowed(req, res, 'dispatch'); if (!access) return;
    if (!uuid.test(req.params.id)) return res.status(400).json({ error: 'Invalid BOLO ID.' });
    try { return res.json({ bolo: await archiveV2Bolo(req.params.guildId, req.cadSession.profile, req.params.id) }); }
    catch (error) { return handleError(res, error); }
  });
  return router;
}
