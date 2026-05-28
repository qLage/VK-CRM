import AuditLogModel from '../models/AuditLog';
import { Request } from 'express';
import { emitAuditEvent } from '../services/realtime-broadcaster.service';

export function buildDiff(existing: Record<string, any>, updates: Record<string, any>): Record<string, { old: any; new: any }> {
  const diff: Record<string, { old: any; new: any }> = {};
  for (const key of Object.keys(updates)) {
    if (key === 'id' || key === 'created_at' || key === 'updated_at') continue;
    const oldVal = existing[key];
    const newVal = updates[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[key] = { old: oldVal, new: newVal };
    }
  }
  return diff;
}

export async function logAudit(
  req: Request,
  action: string,
  entityType: string,
  entityId?: string | null,
  details?: Record<string, any>,
  existing?: Record<string, any>
) {
  try {
    const user = (req as any).user;
    if (!user) return;
    const userName = user.full_name || user.email || 'Unknown';
    const finalDetails: Record<string, any> = { ...details };
    if (action === 'UPDATE' && existing && details) {
      finalDetails.diff = buildDiff(existing, details);
    }
    const row = await AuditLogModel.create({
      user_id: user.id,
      user_name: userName,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      details: finalDetails,
    });
    emitAuditEvent('created', row);
  } catch (err) {
    console.error('[AUDIT] logAudit error (non-blocking):', err);
  }
}
