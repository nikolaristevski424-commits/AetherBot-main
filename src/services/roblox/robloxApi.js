// robloxApi.js
//
// Thin client for Roblox's public web APIs used by verification:
// - users.roblox.com  — resolve a username to an account, fetch account
//   details (including the profile "About" description, used to check
//   the verification phrase)
// - groups.roblox.com — fetch every group a user belongs to, with their
//   rank in each, used for group/rank role sync
//
// These endpoints are public and need no auth, but they're shared
// infrastructure — this client applies a request timeout and treats 429s
// as a distinct, retryable-by-the-caller error rather than a generic
// failure, same defensive posture as the ER:LC client.

import { logger } from '../../utils/logger.js';

const REQUEST_TIMEOUT_MS = 10_000;

class RobloxApiError extends Error {
    constructor(message, { httpStatus = null, kind = 'unknown' } = {}) {
        super(message);
        this.name = 'RobloxApiError';
        this.httpStatus = httpStatus;
        // kind: 'not_found' | 'rate_limited' | 'network' | 'unknown'
        this.kind = kind;
    }
}

async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'User-Agent': 'Aether-Discord-Bot/1.0 (+Roblox-Verification)',
                ...(options.headers || {}),
            },
        });
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new RobloxApiError('Roblox API request timed out.', { kind: 'network' });
        }
        throw new RobloxApiError(`Could not reach Roblox: ${error.message}`, { kind: 'network' });
    } finally {
        clearTimeout(timeout);
    }

    if (response.status === 429) {
        throw new RobloxApiError('Roblox API rate limit hit.', { httpStatus: 429, kind: 'rate_limited' });
    }

    if (!response.ok) {
        throw new RobloxApiError(`Roblox API returned HTTP ${response.status}.`, {
            httpStatus: response.status,
            kind: response.status === 404 ? 'not_found' : 'unknown',
        });
    }

    return response.json();
}

/** Resolve a username to full account details, or null if it doesn't exist. */
export async function getRobloxUserByUsername(username) {
    const lookup = await fetchJson('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
    });

    const basic = lookup?.data?.[0];
    if (!basic?.id) return null;

    return getRobloxUserById(basic.id);
}

/** Fetch account details (including `description`) by Roblox user ID. */
export async function getRobloxUserById(userId) {
    try {
        return await fetchJson(`https://users.roblox.com/v1/users/${userId}`);
    } catch (error) {
        if (error.kind === 'not_found') return null;
        throw error;
    }
}

/**
 * Every group the user belongs to, with their role (name + rank 0-255) in
 * each. Rank 255 is always Owner; 0 means "not in the group" and won't
 * appear here.
 */
export async function getRobloxUserGroupRoles(userId) {
    const result = await fetchJson(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
    return result?.data || [];
}

/**
 * Resolves to a CDN image URL for the user's avatar headshot, or null if
 * Roblox doesn't have one ready. The old direct
 * roblox.com/headshot-thumbnail/image URL was deprecated (404s now) —
 * thumbnails.roblox.com is a job-based API: this call kicks off/reads that
 * job and returns the resulting image URL, it isn't itself embeddable.
 */
export async function getRobloxAvatarUrl(userId, size = '150x150') {
    try {
        const result = await fetchJson(
            `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=${size}&format=Png&isCircular=false`,
        );
        const entry = result?.data?.[0];
        if (entry?.state === 'Completed' && entry.imageUrl) {
            return entry.imageUrl;
        }
        return null;
    } catch (error) {
        logger.warn(`[roblox] Avatar thumbnail lookup failed for ${userId}: ${error.message}`);
        return null;
    }
}

export { RobloxApiError };
