import { randomUUID } from 'node:crypto';
import { db } from '../utils/database.js';
import { Mutex } from '../utils/mutex.js';
import { checkedText, ControlError, isPrimaryOwner } from './siteControlService.js';
import { protectionTypes } from './security/securityConfigService.js';

const communityKey = 'site:community';
const profileKey = userId => 'site:profile:' + userId;
const emptyCommunity = () => ({ presets: [], reviews: [] });
const recordId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

async function read(key, fallback) {
    if (!db.isAvailable()) throw new ControlError(503, 'Community storage is unavailable.');
    try {
        return (await db.get(key, null, { throwOnError: true })) ?? fallback;
    } catch {
        throw new ControlError(503, 'Community storage is unavailable.');
    }
}

async function save(key, value) {
    if (await db.set(key, value) === false) throw new ControlError(503, 'The change could not be saved.');
    db.flush();
}

export function getProfile(userId) {
    return read(profileKey(userId), { publicName: 'Aether member', bio: '' });
}

export async function saveProfile(userId, body) {
    const publicName = checkedText(body.publicName, 48);
    const bio = checkedText(body.bio ?? '', 320, 0);
    const profile = { publicName, bio };
    await save(profileKey(userId), profile);
    return profile;
}

function mutate(update) {
    return Mutex.runExclusive(communityKey, async () => {
        const state = await read(communityKey, emptyCommunity());
        const result = await update(state);
        await save(communityKey, state);
        return result;
    });
}

export function exportProtectionPreset(config) {
    const protections = {};
    for (const system of ['antiraid', 'antinuke']) {
        protections[system] = {};
        for (const key of protectionTypes(system)) {
            const rule = config[system]?.[key];
            if (!rule || typeof rule.enabled !== 'boolean') continue;
            const thresholdKey = key === 'newAccount' ? 'minAgeHours' : 'threshold';
            const max = key === 'newAccount' ? 720 : 100;
            const threshold = rule[thresholdKey];
            if (!Number.isInteger(threshold) || threshold < 1 || threshold > max) continue;
            const windowSeconds = rule.windowSeconds;
            protections[system][key] = {
                enabled: rule.enabled,
                [thresholdKey]: threshold,
                ...(Number.isInteger(windowSeconds) && windowSeconds > 0 && windowSeconds <= 600 ? { windowSeconds } : {}),
            };
        }
    }
    return { version: 1, protections };
}

export async function publishPreset(userId, body, config) {
    const title = checkedText(body.title, 80);
    const description = checkedText(body.description, 420);
    const snapshot = exportProtectionPreset(config);
    const { publicName } = await getProfile(userId);
    return mutate(state => {
        if (state.presets.length >= 150 || state.presets.filter(item => item.authorId === userId).length >= 8) {
            throw new ControlError(409, 'The preset limit has been reached.');
        }
        const item = { id: randomUUID(), authorId: userId, author: publicName, title, description, snapshot, at: new Date().toISOString() };
        state.presets.unshift(item);
        return { id: item.id };
    });
}

export async function saveReview(userId, body) {
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) throw new ControlError(400, 'Choose a rating from 1 to 5.');
    const text = checkedText(body.text, 700);
    const { publicName } = await getProfile(userId);
    return mutate(state => {
        const old = state.reviews.find(item => item.authorId === userId);
        if (old?.hidden) throw new ControlError(403, 'This review was removed by the owner.');
        if (!old && state.reviews.length >= 500) throw new ControlError(409, 'The review limit has been reached.');
        const item = { id: old?.id ?? randomUUID(), authorId: userId, author: publicName, rating: body.rating, text, at: new Date().toISOString() };
        state.reviews = [item, ...state.reviews.filter(row => row !== old)];
        return { id: item.id };
    });
}

export async function removeCommunityItem(userId, { kind, id }) {
    if (!['presets', 'reviews'].includes(kind) || typeof id !== 'string' || !recordId.test(id)) throw new ControlError(400, 'Choose a valid post.');
    return mutate(state => {
        const item = state[kind].find(row => row.id === id && !row.hidden);
        if (!item) throw new ControlError(404, 'This post is unavailable.');
        if (item.authorId === userId) state[kind] = state[kind].filter(row => row !== item);
        else if (isPrimaryOwner(userId)) item.hidden = { at: new Date().toISOString(), by: userId };
        else throw new ControlError(403, 'You cannot remove this post.');
        return { ok: true };
    });
}

export async function personalCommunity(userId) {
    const state = await read(communityKey, emptyCommunity());
    const saved = state.reviews.find(row => row.authorId === userId && !row.hidden);
    const own = rows => rows.filter(row => row.authorId === userId && !row.hidden).map(row => row.id);
    return {
        review: saved ? { id: saved.id, rating: saved.rating, text: saved.text } : null,
        ownPresets: own(state.presets), ownReviews: own(state.reviews), canModerate: isPrimaryOwner(userId),
    };
}

export async function publicCommunity(kind) {
    if (!['presets', 'reviews'].includes(kind)) throw new ControlError(400, 'Choose a community section.');
    const state = await read(communityKey, emptyCommunity());
    const items = state[kind].filter(item => !item.hidden);
    const average = kind === 'reviews' && items.length ? items.reduce((total, item) => total + item.rating, 0) / items.length : null;
    return {
        count: items.length, average,
        items: items.slice(0, 120).map(({ authorId, ...item }) => item),
    };
}
