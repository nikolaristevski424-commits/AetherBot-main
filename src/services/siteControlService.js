import { randomUUID } from 'node:crypto';
import { db } from '../utils/database.js';
import { Mutex } from '../utils/mutex.js';
import { isBotOwner } from '../config/bot.js';

const key = 'site:control';
export const maintenancePages = ['home', 'features', 'commands', 'docs', 'faq', 'status', 'staff', 'team', 'devlog', 'protection', 'dashboard', 'companion', 'cad'];
export const statusValues = ['automatic', 'operational', 'degraded', 'maintenance', 'offline'];
export const discordId = /^\d{17,20}$/;

export class ControlError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

export function checkedText(value, max, min = 1) {
    const result = typeof value === 'string' ? value.trim() : '';
    if (result.length < min || result.length > max) throw new ControlError(400, 'Check the required text and length.');
    return result;
}

export async function readSiteControl() {
    if (!db.isAvailable()) throw new ControlError(503, 'Persistent site storage is unavailable.');
    return await db.get(key) || { status: { value: 'automatic', message: '' }, maintenance: {}, staff: {}, devlogs: [], audit: [] };
}

export function publicSiteControl(state) {
    return {
        status: state.status,
        maintenance: state.maintenance,
        staff: Object.values(state.staff).filter(member => member.listed).map(({ name, title }) => ({ name, title })),
        devlogs: state.devlogs,
    };
}

export async function siteAccess(userId) {
    if (isBotOwner(userId)) return 'owner';
    const state = await readSiteControl();
    return state.staff[userId]?.access === true ? 'staff' : null;
}

function writeSiteControl(userId, action, target, update) {
    return Mutex.runExclusive(key, async () => {
        const state = await readSiteControl();
        update(state);
        state.audit.unshift({ userId, action, target, at: new Date().toISOString() });
        state.audit.length = Math.min(state.audit.length, 200);
        await db.set(key, state);
        db.flush();
        return state;
    });
}

export async function updateSiteControl(userId, body) {
    switch (body.action) {
        case 'status': {
            if (!statusValues.includes(body.value)) throw new ControlError(400, 'Choose a valid displayed status.');
            const message = checkedText(body.message ?? '', 240, 0);
            return writeSiteControl(userId, 'status', body.value, state => { state.status = { value: body.value, message }; });
        }
        case 'publish': {
            const post = { id: randomUUID(), title: checkedText(body.title, 100), text: checkedText(body.text, 4000), at: new Date().toISOString() };
            return writeSiteControl(userId, 'publish', post.id, state => { state.devlogs = [post, ...state.devlogs].slice(0, 100); });
        }
        case 'staff': {
            if (typeof body.userId !== 'string' || !discordId.test(body.userId) || typeof body.listed !== 'boolean' || typeof body.access !== 'boolean') {
                throw new ControlError(400, 'Enter a valid Discord user ID and staff options.');
            }
            const member = { name: checkedText(body.name, 80), title: checkedText(body.title, 80), listed: body.listed, access: body.access };
            return writeSiteControl(userId, 'staff.update', body.userId, state => {
                if (!state.staff[body.userId] && Object.keys(state.staff).length >= 100) throw new ControlError(409, 'The staff roster is full.');
                state.staff[body.userId] = member;
            });
        }
        case 'remove_staff':
            if (typeof body.userId !== 'string' || !discordId.test(body.userId)) throw new ControlError(400, 'Enter a valid Discord user ID.');
            return writeSiteControl(userId, 'staff.remove', body.userId, state => { delete state.staff[body.userId]; });
        case 'maintenance': {
            if (!maintenancePages.includes(body.page) || typeof body.enabled !== 'boolean') throw new ControlError(400, 'Choose a public site page.');
            const message = body.enabled ? checkedText(body.message ?? '', 240, 0) : '';
            return writeSiteControl(userId, 'maintenance', body.page, state => {
                if (body.enabled) state.maintenance[body.page] = { message };
                else delete state.maintenance[body.page];
            });
        }
        default:
            throw new ControlError(400, 'Select a supported owner action.');
    }
}

export function auditSiteAction(userId, action, target) {
    return writeSiteControl(userId, action, target, () => {});
}
