import express, { Request, Response, Router } from 'express';
import { authenticateToken as auth } from '../middleware/auth';
import { query, pool } from '../db';
import { emitKpiEvent } from '../services/realtime-broadcaster.service';
import { invalidateCacheMiddleware } from '../middleware/cache.middleware';
import { invalidateAllKpiCache } from '../services/dashboardCache';
import cacheService from '../lib/cache.service';
import { logAudit } from '../utils/audit';

const router: Router = express.Router();

// Get KPI rules for a specific role (for dropdown in employee edit dialog)
router.get('/rules/:role', auth, async (req: Request, res: Response): Promise<void> => {
    try {
        const { role } = req.params;

        // Validate role
        const validRoles = ['realtor', 'sales_manager', 'head_sales'];
        if (!validRoles.includes(Array.isArray(role) ? role[0] : role)) {
            res.status(400).json({ error: { message: 'Неверная роль' } });
            return;
        }

        const sql = pool
            ? 'SELECT min_threshold, percent FROM kpi_rules WHERE role = $1 ORDER BY min_threshold'
            : 'SELECT min_threshold, percent FROM kpi_rules WHERE role = ? ORDER BY min_threshold';

        const result = await query(sql, [role]);
        const rules = result.rows.map((r: any) => ({
            threshold: Number(r.min_threshold),
            percent: Number(r.percent)
        }));

        res.json({ success: true, rules });
    } catch (error: any) {
        console.error('KPI Rules Get Error:', error);
        res.status(500).json({ error: { message: error.message } });
    }
});

interface KpiSettings {
    realtor: {
        thresholds: Array<{ min_threshold: number; percent: number }>;
    };
    mop: {
        base_salary: number;
        percentages: Array<{ plan_completion: number; percent: number }>;
    };
    rop: {
        base_salary: number;
        percentages: Array<{ plan_completion: number; percent: number }>;
    };
}

// Get KPI settings (directors only)
router.get('/', auth, async (req: Request, res: Response): Promise<void> => {
    try {
        const accessLevel = Number((req.user as any).access_level || 0);
        const userRole = (req.user as any).role;

        // Only directors and commercial directors can access
        if (accessLevel < 90 && userRole !== 'director' && userRole !== 'commercial') {
            res.status(403).json({ error: { message: 'Доступно только для директоров' } });
            return;
        }

        // Get all KPI rules from database
        const sql = pool
            ? 'SELECT * FROM kpi_rules ORDER BY role, min_threshold'
            : 'SELECT * FROM kpi_rules ORDER BY role, min_threshold';

        const result = await query(sql, []);
        const rules = result.rows;

        // Parse rules into structured settings
        const settings: KpiSettings = {
            realtor: {
                thresholds: rules
                    .filter((r: any) => r.role === 'realtor')
                    .map((r: any) => ({
                        min_threshold: Number(r.min_threshold),
                        percent: Number(r.percent),
                    }))
                    .sort((a: any, b: any) => a.min_threshold - b.min_threshold),
            },
            mop: {
                base_salary: 40000, // Default value
                percentages: rules
                    .filter((r: any) => r.role === 'sales_manager')
                    .map((r: any) => ({
                        plan_completion: Number(r.min_threshold),
                        percent: Number(r.percent),
                    }))
                    .sort((a: any, b: any) => a.plan_completion - b.plan_completion),
            },
            rop: {
                base_salary: 80000, // Default value
                percentages: rules
                    .filter((r: any) => r.role === 'head_sales')
                    .map((r: any) => ({
                        plan_completion: Number(r.min_threshold),
                        percent: Number(r.percent),
                    }))
                    .sort((a: any, b: any) => a.plan_completion - b.plan_completion),
            },
        };

        // Get base salaries from positions table - Prioritize technical IDs pos-mop and pos-rop
        const salarySql = pool
            ? `SELECT id, name, base_salary FROM positions WHERE name ILIKE '%моп%' OR name ILIKE '%роп%' OR id IN ('pos-mop', 'pos-rop')`
            : `SELECT id, name, base_salary FROM positions WHERE name LIKE '%моп%' OR name LIKE '%роп%' OR id IN ('pos-mop', 'pos-rop')`;

        const salaryResult = await query(salarySql, []);
        for (const pos of salaryResult.rows) {
            const posName = pos.name.toLowerCase();
            const salary = Number(pos.base_salary || 0);
            const posId = pos.id;
            
            if (salary <= 0) continue;

            if (posId === 'pos-mop' || posName.includes('моп')) {
                // Priority: Technical ID > Specific Name > Partial Name
                if (posId === 'pos-mop' || posName === 'менеджер моп' || !settings.mop.base_salary) {
                    settings.mop.base_salary = salary;
                }
            } 
            
            if (posId === 'pos-rop' || posName.includes('роп')) {
                // Priority: Technical ID > Specific Name > Partial Name
                if (posId === 'pos-rop' || posName === 'руководитель роп' || !settings.rop.base_salary) {
                    settings.rop.base_salary = salary;
                }
            }
        }

        res.json({ success: true, settings });
    } catch (error: any) {
        console.error('KPI Settings Get Error:', error);
        res.status(500).json({ error: { message: error.message } });
    }
});

// Save KPI settings (directors only)
router.post('/', auth, invalidateCacheMiddleware(), async (req: Request, res: Response): Promise<void> => {
    try {
        const accessLevel = Number((req.user as any).access_level || 0);
        const userRole = (req.user as any).role;

        // Only directors and commercial directors can access
        if (accessLevel < 90 && userRole !== 'director' && userRole !== 'commercial') {
            res.status(403).json({ error: { message: 'Доступно только для директоров' } });
            return;
        }

        const { settings } = req.body as { settings: KpiSettings };

        if (!settings) {
            res.status(400).json({ error: { message: 'Настройки не предоставлены' } });
            return;
        }

        await query(pool ? 'BEGIN' : 'BEGIN TRANSACTION', []);

        try {
            // Delete existing rules for these roles
            const deleteSql = pool
                ? 'DELETE FROM kpi_rules WHERE role = ANY($1)'
                : 'DELETE FROM kpi_rules WHERE role IN (?, ?, ?)';
            await query(deleteSql, [['realtor', 'sales_manager', 'head_sales']]);

            // Insert new rules
            const insertRules: any[] = [];

            // Realtor thresholds
            for (const threshold of settings.realtor.thresholds) {
                const id = require('crypto').randomUUID();
                insertRules.push([
                    id,
                    'realtor',
                    'quarterly',
                    threshold.min_threshold,
                    threshold.percent,
                    `Риелтор: ${threshold.percent}% при выручке от ${threshold.min_threshold}₽`,
                ]);
            }

            // MOP percentages
            for (const perc of settings.mop.percentages) {
                const id = require('crypto').randomUUID();
                insertRules.push([
                    id,
                    'sales_manager',
                    'monthly',
                    perc.plan_completion,
                    perc.percent,
                    `МОП: ${perc.percent}% при выполнении плана ${perc.plan_completion}%`,
                ]);
            }

            // ROP percentages
            for (const perc of settings.rop.percentages) {
                const id = require('crypto').randomUUID();
                insertRules.push([
                    id,
                    'head_sales',
                    'monthly',
                    perc.plan_completion,
                    perc.percent,
                    `РОП: ${perc.percent}% при выполнении плана ${perc.plan_completion}%`,
                ]);
            }

            // Bulk insert
            if (pool) {
                for (const rule of insertRules) {
                    await query(
                        'INSERT INTO kpi_rules (id, role, period_type, min_threshold, percent, description) VALUES ($1, $2, $3, $4, $5, $6)',
                        rule
                    );
                }
            } else {
                const insertSql = 'INSERT INTO kpi_rules (id, role, period_type, min_threshold, percent, description) VALUES (?, ?, ?, ?, ?, ?)';
                const stmt = (global as any).db.prepare(insertSql);
                for (const rule of insertRules) {
                    stmt.run(...rule);
                }
            }

            // Update base salaries in positions table with robust matching
            const mop_base_salary = settings.mop.base_salary;
            const rop_base_salary = settings.rop.base_salary;

            const updateSalariesSql = `
                UPDATE positions 
                SET base_salary = CASE 
                    WHEN id = 'pos-mop' OR LOWER(TRIM(name)) LIKE '%менеджер моп%' THEN $1
                    WHEN id = 'pos-rop' OR LOWER(TRIM(name)) LIKE '%руководитель роп%' THEN $2
                    ELSE base_salary
                END
                WHERE id IN ('pos-mop', 'pos-rop') 
                   OR LOWER(TRIM(name)) LIKE '%менеджер моп%'
                   OR LOWER(TRIM(name)) LIKE '%руководитель роп%'
            `;
            const updateResult = await query(updateSalariesSql, [mop_base_salary, rop_base_salary]);
            console.log(`[KPI Settings Update] Applied salary updates to ${updateResult.rowCount} position rows.`);

            await query(pool ? 'COMMIT' : 'COMMIT TRANSACTION', []);

            await logAudit(req, 'UPDATE', 'kpi_setting', null, { name: 'KPI settings' });

            // Clear all KPI caches so new settings apply immediately without page refresh
            await invalidateAllKpiCache();
            if (cacheService) {
                await cacheService.invalidate('kpi:');
            }

            // Emit realtime event for cross-user updates
            emitKpiEvent('updated', { settings });
            emitKpiEvent('settings_updated', { settings });

            res.json({ success: true, message: 'Настройки KPI сохранены' });
        } catch (error) {
            await query(pool ? 'ROLLBACK' : 'ROLLBACK TRANSACTION', []);
            throw error;
        }
    } catch (error: any) {
        console.error('KPI Settings Save Error:', error);
        res.status(500).json({ error: { message: error.message } });
    }
});

export default router;
