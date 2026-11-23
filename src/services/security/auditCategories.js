import { AuditLogEvent, PermissionFlagsBits as P } from 'discord.js';

export const elevatedPermissions = P.Administrator | P.ManageGuild | P.ManageRoles | P.ManageChannels
    | P.BanMembers | P.KickMembers | P.ManageWebhooks;

export function grantsElevatedPermissions(before, after) {
    if (![before, after].every(value => typeof value === 'string' && /^\d{1,20}$/.test(value))) return false;
    return Boolean((BigInt(after) & ~BigInt(before)) & elevatedPermissions);
}

const categories = new Map([
    [AuditLogEvent.ChannelDelete, 'channelDelete'],
    [AuditLogEvent.RoleDelete, 'roleDelete'],
    [AuditLogEvent.MemberBanAdd, 'banSpam'],
    [AuditLogEvent.MemberKick, 'kickSpam'],
    [AuditLogEvent.WebhookCreate, 'webhookCreate'],
    [AuditLogEvent.BotAdd, 'botAdd'],
]);

export function classifyAuditEntry(entry) {
    if (entry.action === AuditLogEvent.RoleUpdate) {
        const permissions = entry.changes?.find(change => change.key === 'permissions');
        return grantsElevatedPermissions(permissions?.old, permissions?.new) ? 'roleEscalation' : null;
    }
    if (entry.action === AuditLogEvent.RoleCreate) {
        const permissions = entry.changes?.find(change => change.key === 'permissions');
        return grantsElevatedPermissions('0', permissions?.new) ? 'roleEscalation' : null;
    }
    return categories.get(entry.action) || null;
}
