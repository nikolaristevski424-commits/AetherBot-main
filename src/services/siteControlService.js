import { randomUUID } from 'node:crypto';
import { db } from '../utils/database.js';
import { Mutex } from '../utils/mutex.js';
import { getBotOwners, isBotOwner } from '../config/bot.js';

const key = 'site:control';
export const maintenancePages = ['all', 'home', 'features', 'commands', 'docs', 'faq', 'status', 'incidents', 'staff', 'team', 'team-panel', 'blog', 'devlog', 'protection', 'dashboard', 'profile', 'community', 'reviews', 'companion', 'cad', 'privacy', 'terms'];
export const statusValues = ['automatic', 'operational', 'degraded', 'maintenance', 'offline'];
export const discordId = /^\d{17,20}$/;
const publicationId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const articleCategories = ['product', 'changelog', 'community'];
const incidentServices = ['website', 'discord', 'cad', 'erlc', 'music'];
const incidentSeverities = ['minor', 'major', 'critical', 'maintenance'];
const incidentPhases = ['investigating', 'identified', 'monitoring', 'resolved', 'scheduled'];

export function isPrimaryOwner(userId) {
    const owners = getBotOwners().filter(id => discordId.test(id));
    const configured = process.env.AETHER_PRIMARY_OWNER_ID?.trim();
    const primary = configured || owners[0];
    return Boolean(primary && owners.includes(primary) && String(userId) === primary);
}

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
    const saved = await db.get(key, null, { throwOnError: true }).catch(() => {
        throw new ControlError(503, 'Persistent site storage is unavailable.');
    });
    return {
        status: { value: 'automatic', message: '' }, maintenance: {}, staff: {},
        devlogs: [], articles: [], incidents: [], policies: {}, audit: [],
        ...saved,
    };
}

export function publicSiteControl(state) {
    const articles = state.articles.filter(article => article.published);
    const visibleArticles = new Set([...articles, ...state.devlogs].map(article => 'article:' + article.id));
    return {
        status: state.status,
        maintenance: Object.fromEntries(Object.entries(state.maintenance)
            .filter(([page]) => !page.startsWith('article:') || visibleArticles.has(page))),
        staff: Object.values(state.staff).filter(member => member.listed).map(({ name, title }) => ({ name, title })),
        devlogs: state.devlogs,
        articles: articles.map(({ revision, ...article }) => article),
        incidents: state.incidents.map(({ revision, ...incident }) => incident),
        policies: Object.fromEntries(Object.entries(state.policies)
            .filter(([, policy]) => policy.published)
            .map(([name, policy]) => [name, policy.published])),
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
        if (await db.set(key, state) === false) throw new ControlError(503, 'The change could not be saved. Try again in a moment.');
        db.flush();
        return state;
    });
}

function editable(items, id, revision) {
    if (typeof id !== 'string' || !publicationId.test(id)) throw new ControlError(400, 'Choose a valid record.');
    const item = items.find(record => record.id === id);
    if (!item) throw new ControlError(404, 'This record could not be found.');
    if (!Number.isSafeInteger(revision) || item.revision !== revision) throw new ControlError(409, 'This record changed. Reload the control center before editing again.');
    return item;
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
        case 'policy': {
            if (!['terms', 'privacy'].includes(body.document) || typeof body.publish !== 'boolean'
                || !Number.isSafeInteger(body.revision) || body.revision < 0) {
                throw new ControlError(400, 'Choose a policy and publication setting.');
            }
            const text = checkedText(body.text, 8000, 80);
            return writeSiteControl(userId, body.publish ? 'policy.publish' : 'policy.draft', body.document, state => {
                const old = state.policies[body.document] ?? { revision: 0 };
                if (old.revision !== body.revision) throw new ControlError(409, 'This policy changed. Reload it before editing again.');
                state.policies[body.document] = {
                    ...old, draft: text, revision: old.revision + 1,
                    ...(body.publish && { published: { text, at: new Date().toISOString() } }),
                };
            });
        }
        case 'article': {
            if (!articleCategories.includes(body.category) || typeof body.published !== 'boolean') throw new ControlError(400, 'Choose a category and publication setting.');
            const fields = {
                title: checkedText(body.title, 100), summary: checkedText(body.summary, 280),
                text: checkedText(body.text, 5000), category: body.category, published: body.published,
            };
            const id = body.id || randomUUID();
            return writeSiteControl(userId, body.published ? 'article.publish' : 'article.draft', id, state => {
                const article = body.id ? editable(state.articles, id, body.revision) : null;
                if (!article && state.articles.length >= 60) throw new ControlError(409, 'The article archive is full.');
                const now = new Date().toISOString();
                const saved = {
                    ...fields, id, revision: (article?.revision ?? 0) + 1, updatedAt: now,
                    publishedAt: fields.published ? article?.publishedAt ?? now : null,
                };
                if (article) state.articles[state.articles.indexOf(article)] = saved;
                else state.articles.unshift(saved);
            });
        }
        case 'incident': {
            if (!incidentServices.includes(body.service) || !incidentSeverities.includes(body.severity)
                || !incidentPhases.includes(body.phase)) throw new ControlError(400, 'Choose the affected service, severity, and phase.');
            const id = randomUUID();
            const at = new Date().toISOString();
            const incident = {
                id, title: checkedText(body.title, 100), service: body.service, severity: body.severity,
                phase: body.phase, at, updatedAt: at, revision: 1,
                updates: [{ phase: body.phase, text: checkedText(body.text, 1400), at }],
            };
            return writeSiteControl(userId, 'incident.publish', id, state => {
                if (state.incidents.length >= 50) throw new ControlError(409, 'The incident archive is full.');
                state.incidents.unshift(incident);
            });
        }
        case 'incident_update': {
            if (!incidentPhases.includes(body.phase)) throw new ControlError(400, 'Choose a valid incident phase.');
            const text = checkedText(body.text, 1400);
            return writeSiteControl(userId, 'incident.update', body.id, state => {
                const incident = editable(state.incidents, body.id, body.revision);
                if (incident.updates.length >= 10 || (incident.updates.length === 9 && body.phase !== 'resolved')) {
                    throw new ControlError(409, 'Only a resolution can be added once an incident approaches its update limit.');
                }
                const at = new Date().toISOString();
                incident.updates.unshift({ phase: body.phase, text, at });
                Object.assign(incident, { phase: body.phase, updatedAt: at, revision: incident.revision + 1 });
            });
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
            const [area, id, extra] = typeof body.page === 'string' ? body.page.split(':') : [];
            const record = !extra && id && publicationId.test(id) && ['article', 'incident'].includes(area);
            if ((!maintenancePages.includes(body.page) && !record) || typeof body.enabled !== 'boolean') throw new ControlError(400, 'Choose a supported website page.');
            return writeSiteControl(userId, 'maintenance', body.page, state => {
                if (body.enabled) {
                    if (area === 'article' && !state.articles.some(item => item.id === id && item.published) && !state.devlogs.some(item => item.id === id)) {
                        throw new ControlError(404, 'Publish this article before pausing its page.');
                    }
                    if (area === 'incident' && !state.incidents.some(item => item.id === id)) throw new ControlError(404, 'This incident page could not be found.');
                    state.maintenance[body.page] = { message: checkedText(body.message ?? '', 240, 0) };
                }
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
