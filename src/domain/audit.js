import crypto from 'node:crypto';

export function createAuditEntry({ actorUserId, actorRole, action, entityType, entityId, before, after, metadata }) {
  const entry = {
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
    immutable: true,
  };
  
  // Create a hash of the entry for integrity verification
  const entryString = JSON.stringify({
    id: entry.id,
    actorUserId: entry.actorUserId,
    actorRole: entry.actorRole,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before,
    after: entry.after,
    metadata: entry.metadata,
    createdAt: entry.createdAt,
  });
  
  entry.integrityHash = crypto.createHash('sha256').update(entryString).digest('hex');
  
  return entry;
}

export function appendAudit(state, entry) {
  state.auditLog = state.auditLog || [];
  state.auditLog.unshift(entry);
  
  // Keep only last 1000 audit entries to prevent storage bloat
  if (state.auditLog.length > 1000) {
    state.auditLog = state.auditLog.slice(0, 1000);
  }
}

export function verifyAuditIntegrity(auditLog) {
  if (!Array.isArray(auditLog)) return { valid: true, message: 'No audit log to verify' };
  
  for (const entry of auditLog) {
    if (!entry.integrityHash) {
      return { valid: false, message: `Audit entry ${entry.id} missing integrity hash` };
    }
    
    const entryString = JSON.stringify({
      id: entry.id,
      actorUserId: entry.actorUserId,
      actorRole: entry.actorRole,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before,
      after: entry.after,
      metadata: entry.metadata,
      createdAt: entry.createdAt,
    });
    
    const computedHash = crypto.createHash('sha256').update(entryString).digest('hex');
    
    if (computedHash !== entry.integrityHash) {
      return { valid: false, message: `Audit entry ${entry.id} integrity check failed` };
    }
  }
  
  return { valid: true, message: 'All audit entries verified' };
}
