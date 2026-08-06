import crypto from 'node:crypto';

export function createAuditEntry({ actorUserId, actorRole, action, entityType, entityId, before, after, metadata }) {
  return {
    id: `aud_${crypto.randomUUID()}`,
    actorUserId: actorUserId || null,
    actorRole: actorRole || null,
    action,
    entityType,
    entityId,
    before: before ?? null,
    after: after ?? null,
    metadata: metadata ?? null,
    createdAt: new Date().toISOString(),
  };
}

export function appendAudit(state, entry) {
  state.auditLog = state.auditLog || [];
  state.auditLog.unshift(entry);
}
