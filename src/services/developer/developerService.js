// developerService.js
//
// Bot-owner-only tooling: a global (not per-guild) switch to temporarily
// turn individual commands off bot-wide — for "this command has a problem,
// kill it while I fix it" — without needing a redeploy or the existing
// config-file-based maintenanceMode (which takes the whole bot down, not
// just one command). Access is gated by isBotOwner() (OWNER_IDS env var),
// not a hardcoded ID, so it stays correct if that list ever changes.

import { getFromDb, setInDb } from '../../utils/database.js';
import { getDisabledCommandsKey } from '../../utils/database/keys.js';
import { wrapServiceBoundary } from '../../utils/errorHandler.js';

export const getDisabledCommands = wrapServiceBoundary(async function getDisabledCommands() {
    return await getFromDb(getDisabledCommandsKey(), []);
}, {
    service: 'developerService', operation: 'getDisabledCommands',
    message: 'Failed to read disabled command list', userMessage: 'Failed to load the disabled command list.',
});

export async function isCommandDisabledByDeveloper(commandName) {
    const disabled = await getFromDb(getDisabledCommandsKey(), []);
    return disabled.includes(commandName);
}

export const disableCommand = wrapServiceBoundary(async function disableCommand(commandName) {
    const disabled = await getFromDb(getDisabledCommandsKey(), []);
    if (!disabled.includes(commandName)) disabled.push(commandName);
    await setInDb(getDisabledCommandsKey(), disabled);
    return disabled;
}, {
    service: 'developerService', operation: 'disableCommand',
    message: 'Failed to disable command', userMessage: 'Failed to disable that command.',
});

export const enableCommand = wrapServiceBoundary(async function enableCommand(commandName) {
    const disabled = (await getFromDb(getDisabledCommandsKey(), [])).filter((c) => c !== commandName);
    await setInDb(getDisabledCommandsKey(), disabled);
    return disabled;
}, {
    service: 'developerService', operation: 'enableCommand',
    message: 'Failed to enable command', userMessage: 'Failed to enable that command.',
});
