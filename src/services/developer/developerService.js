// developerService.js
//
// Bot-owner-only tooling: a global (not per-guild) switch to temporarily
// turn individual commands off bot-wide — for "this command has a problem,
// kill it while I fix it" — without needing a redeploy or the existing
// config-file-based maintenanceMode (which takes the whole bot down, not
// just one command). Access is gated by isBotOwner() (OWNER_IDS env var),
// not a hardcoded ID, so it stays correct if that list ever changes.
//
// Each disabled entry carries an optional reason, shown to anyone who tries
// to run the command while it's off — "temporarily disabled" alone doesn't
// tell users anything useful; "temporarily disabled — investigating a
// balance duplication bug" does.

import { getFromDb, setInDb } from '../../utils/database.js';
import { getDisabledCommandsKey, getDisabledCategoriesKey } from '../../utils/database/keys.js';
import { wrapServiceBoundary } from '../../utils/errorHandler.js';

export const getDisabledCommands = wrapServiceBoundary(async function getDisabledCommands() {
    return await getFromDb(getDisabledCommandsKey(), []);
}, {
    service: 'developerService', operation: 'getDisabledCommands',
    message: 'Failed to read disabled command list', userMessage: 'Failed to load the disabled command list.',
});

/** Returns the disabled entry ({ name, reason, disabledAt }) or null if the command is enabled. */
export async function getDisabledCommandEntry(commandName) {
    const disabled = await getFromDb(getDisabledCommandsKey(), []);
    return disabled.find((c) => c.name === commandName) || null;
}

export async function isCommandDisabledByDeveloper(commandName) {
    return (await getDisabledCommandEntry(commandName)) !== null;
}

export const disableCommand = wrapServiceBoundary(async function disableCommand(commandName, reason) {
    const disabled = await getFromDb(getDisabledCommandsKey(), []);
    const filtered = disabled.filter((c) => c.name !== commandName);
    filtered.push({ name: commandName, reason: reason || null, disabledAt: Date.now() });
    await setInDb(getDisabledCommandsKey(), filtered);
    return filtered;
}, {
    service: 'developerService', operation: 'disableCommand',
    message: 'Failed to disable command', userMessage: 'Failed to disable that command.',
});

export const enableCommand = wrapServiceBoundary(async function enableCommand(commandName) {
    const disabled = (await getFromDb(getDisabledCommandsKey(), [])).filter((c) => c.name !== commandName);
    await setInDb(getDisabledCommandsKey(), disabled);
    return disabled;
}, {
    service: 'developerService', operation: 'enableCommand',
    message: 'Failed to enable command', userMessage: 'Failed to enable that command.',
});

export const getDisabledCategories = wrapServiceBoundary(async function getDisabledCategories() {
    return await getFromDb(getDisabledCategoriesKey(), []);
}, {
    service: 'developerService', operation: 'getDisabledCategories',
    message: 'Failed to read disabled category list', userMessage: 'Failed to load the disabled category list.',
});

export async function getDisabledCategoryEntry(category) {
    const disabled = await getFromDb(getDisabledCategoriesKey(), []);
    // Category names come from folder names (e.g. "Economy", "ERLC") — compare
    // case-insensitively so /developers disable-category doesn't need to match
    // the folder's exact casing.
    return disabled.find((c) => c.name.toLowerCase() === category.toLowerCase()) || null;
}

export const disableCategory = wrapServiceBoundary(async function disableCategory(category, reason) {
    const disabled = await getFromDb(getDisabledCategoriesKey(), []);
    const filtered = disabled.filter((c) => c.name.toLowerCase() !== category.toLowerCase());
    filtered.push({ name: category, reason: reason || null, disabledAt: Date.now() });
    await setInDb(getDisabledCategoriesKey(), filtered);
    return filtered;
}, {
    service: 'developerService', operation: 'disableCategory',
    message: 'Failed to disable category', userMessage: 'Failed to disable that category.',
});

export const enableCategory = wrapServiceBoundary(async function enableCategory(category) {
    const disabled = (await getFromDb(getDisabledCategoriesKey(), [])).filter((c) => c.name.toLowerCase() !== category.toLowerCase());
    await setInDb(getDisabledCategoriesKey(), disabled);
    return disabled;
}, {
    service: 'developerService', operation: 'enableCategory',
    message: 'Failed to enable category', userMessage: 'Failed to enable that category.',
});
