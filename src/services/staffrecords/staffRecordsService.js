// staffRecordsService.js
//
// In-game/staff-team infraction and promotion tracking — separate from
// Discord moderation cases (warnings.js etc.), since this is about a
// server's own staff team conduct (e.g. an ER:LC department roster), not
// about moderating regular members. Adapted from a reference "Infraction +
// Promo System" module the user provided: same core ideas (typed
// punishments, human-readable IDs, a void/undo path, per-user history) but
// rebuilt guild-scoped against Aether's own storage instead of a
// single-server MongoDB schema with hardcoded role/channel IDs.

import crypto from 'node:crypto';
import { getFromDb, setInDb, deleteFromDb } from '../../utils/database.js';
import { db } from '../../utils/database/wrapper.js';
import {
    getStaffRecordConfigKey,
    getInfractionKey, getInfractionPrefix,
    getPromotionKey, getPromotionPrefix,
} from '../../utils/database/keys.js';
import { wrapServiceBoundary } from '../../utils/errorHandler.js';

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const PUNISHMENT_TYPES = [
    'Notice', 'Warning', 'Strike', 'Suspension', 'Under Investigation', 'Termination', 'Staff Blacklist',
];

function randomId() {
    return `#${Array.from({ length: 6 }, () => ID_CHARS[crypto.randomInt(ID_CHARS.length)]).join('')}`;
}

async function generateUniqueId(existsCheck) {
    for (let attempt = 0; attempt < 20; attempt++) {
        const id = randomId();
        if (!(await existsCheck(id))) return id;
    }
    // Astronomically unlikely with 26^6 combinations, but fail loudly rather
    // than silently reuse an ID if it ever happens.
    throw new Error('Could not generate a unique record ID after 20 attempts.');
}

export const getStaffRecordConfig = wrapServiceBoundary(async function getStaffRecordConfig(guildId) {
    return await getFromDb(getStaffRecordConfigKey(guildId), { logChannelId: null });
}, {
    service: 'staffRecordsService', operation: 'getStaffRecordConfig',
    message: 'Failed to read staff records config', userMessage: 'Failed to load staff records configuration.',
});

export const setStaffRecordLogChannel = wrapServiceBoundary(async function setStaffRecordLogChannel(guildId, channelId) {
    const config = await getFromDb(getStaffRecordConfigKey(guildId), {});
    config.logChannelId = channelId;
    await setInDb(getStaffRecordConfigKey(guildId), config);
    return config;
}, {
    service: 'staffRecordsService', operation: 'setStaffRecordLogChannel',
    message: 'Failed to set log channel', userMessage: 'Failed to set the staff records log channel.',
});

export const issueInfraction = wrapServiceBoundary(async function issueInfraction(guildId, { userId, issuedBy, punishment, reason }) {
    const infractionId = await generateUniqueId((id) => getFromDb(getInfractionKey(guildId, id), null).then(Boolean));
    const record = { id: infractionId, userId, issuedBy, punishment, reason, issuedAt: Date.now(), voided: false };
    await setInDb(getInfractionKey(guildId, infractionId), record);
    return record;
}, {
    service: 'staffRecordsService', operation: 'issueInfraction',
    message: 'Failed to issue infraction', userMessage: 'Failed to issue that infraction.',
});

export const voidInfraction = wrapServiceBoundary(async function voidInfraction(guildId, infractionId) {
    const key = getInfractionKey(guildId, infractionId.toUpperCase().startsWith('#') ? infractionId.toUpperCase() : `#${infractionId.toUpperCase()}`);
    const record = await getFromDb(key, null);
    if (!record) return null;
    record.voided = true;
    await setInDb(key, record);
    return record;
}, {
    service: 'staffRecordsService', operation: 'voidInfraction',
    message: 'Failed to void infraction', userMessage: 'Failed to void that infraction.',
});

export const issuePromotion = wrapServiceBoundary(async function issuePromotion(guildId, { userId, issuedBy, newRoleId, reason }) {
    const promotionId = await generateUniqueId((id) => getFromDb(getPromotionKey(guildId, id), null).then(Boolean));
    const record = { id: promotionId, userId, issuedBy, newRoleId, reason, issuedAt: Date.now(), voided: false };
    await setInDb(getPromotionKey(guildId, promotionId), record);
    return record;
}, {
    service: 'staffRecordsService', operation: 'issuePromotion',
    message: 'Failed to issue promotion', userMessage: 'Failed to issue that promotion.',
});

export const voidPromotion = wrapServiceBoundary(async function voidPromotion(guildId, promotionId) {
    const key = getPromotionKey(guildId, promotionId.toUpperCase().startsWith('#') ? promotionId.toUpperCase() : `#${promotionId.toUpperCase()}`);
    const record = await getFromDb(key, null);
    if (!record) return null;
    record.voided = true;
    await setInDb(key, record);
    return record;
}, {
    service: 'staffRecordsService', operation: 'voidPromotion',
    message: 'Failed to void promotion', userMessage: 'Failed to void that promotion.',
});

async function listByUser(prefix, userId) {
    const keys = await db.list(prefix);
    const records = [];
    for (const key of keys) {
        const record = await getFromDb(key, null);
        if (record && record.userId === userId) records.push(record);
    }
    return records.sort((a, b) => b.issuedAt - a.issuedAt);
}

export const getInfractionsForUser = wrapServiceBoundary(async function getInfractionsForUser(guildId, userId) {
    return listByUser(getInfractionPrefix(guildId), userId);
}, {
    service: 'staffRecordsService', operation: 'getInfractionsForUser',
    message: 'Failed to load infractions', userMessage: 'Failed to load infraction history.',
});

export const getPromotionsForUser = wrapServiceBoundary(async function getPromotionsForUser(guildId, userId) {
    return listByUser(getPromotionPrefix(guildId), userId);
}, {
    service: 'staffRecordsService', operation: 'getPromotionsForUser',
    message: 'Failed to load promotions', userMessage: 'Failed to load promotion history.',
});
