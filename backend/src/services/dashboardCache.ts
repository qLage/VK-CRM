import { query } from '../db';

const CACHE_TTL_MINUTES = 5; // Cache valid for 5 minutes

export async function getCachedStats(userId: string, cacheKey: string, period?: string, branchId?: string): Promise<any | null> {
  const params: any[] = [userId, cacheKey];
  let sql = `SELECT data FROM dashboard_cache 
     WHERE user_id = $1 AND cache_key = $2 AND expires_at > NOW()`;

  if (period) {
    params.push(period);
    sql += ` AND period = $${params.length}`;
  } else {
    sql += ` AND period IS NULL`;
  }
  if (branchId) {
    params.push(branchId);
    sql += ` AND branch_id = $${params.length}`;
  } else {
    sql += ` AND branch_id IS NULL`;
  }

  sql += ' ORDER BY updated_at DESC LIMIT 1';

  const result = await query(sql, params);
  return result.rows[0]?.data || null;
}

function buildSyntheticId(userId: string, cacheKey: string, period?: string, branchId?: string): string {
  return `${userId}::${cacheKey}::${period || 'null'}::${branchId || 'null'}`;
}

export async function setCachedStats(userId: string, cacheKey: string, data: any, period?: string, branchId?: string): Promise<void> {
  const id = buildSyntheticId(userId, cacheKey, period, branchId);
  const expiresAt = new Date(Date.now() + CACHE_TTL_MINUTES * 60 * 1000).toISOString();
  await query(
    `INSERT INTO dashboard_cache (id, user_id, cache_key, data, period, branch_id, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, expires_at = EXCLUDED.expires_at, updated_at = NOW()`,
    [id, userId, cacheKey, JSON.stringify(data), period || null, branchId || null, expiresAt]
  );
}

export async function invalidateCache(userId?: string, cacheKey?: string): Promise<void> {
  if (userId && cacheKey) {
    await query('DELETE FROM dashboard_cache WHERE user_id = $1 AND cache_key = $2', [userId, cacheKey]);
  } else if (userId) {
    await query('DELETE FROM dashboard_cache WHERE user_id = $1', [userId]);
  } else if (cacheKey) {
    await query('DELETE FROM dashboard_cache WHERE cache_key = $1', [cacheKey]);
  } else {
    await query('DELETE FROM dashboard_cache WHERE expires_at < NOW()');
  }
}

export async function invalidateAllKpiCache(): Promise<void> {
  await query("DELETE FROM dashboard_cache WHERE cache_key LIKE 'kpi_%'");
}
