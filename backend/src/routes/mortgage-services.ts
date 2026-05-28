/**
 * Отдельный реестр ипотечных услуг (не строки таблицы сделок Excel).
 */
import express, { Request, Response, Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { query } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { computeMortgageSplits } from '../utils/mortgageSplits';
import { syncMortgageServiceTransaction } from '../services/mortgageFinanceSync';
import cacheService from '../lib/cache.service';
import { logAudit } from '../utils/audit';

const router: Router = express.Router();

function canAccessMortgageApi(user: any): boolean {
    const al = Number(user.access_level || 0);
    const role = String(user.role || '');
    if (al >= 90 || role === 'admin' || role === 'director') return true;
    return ['commercial', 'head_sales', 'sales_manager', 'mortgage_broker'].includes(role);
}

function deny(res: Response) {
    res.status(403).json({ error: { message: 'Раздел недоступен для вашей роли' } });
}

function combineMortgageBankProgram(bank: string, program: string): string {
    const b = String(bank || '').trim();
    const p = String(program || '').trim();
    if (p) return `${b}, ${p}`;
    return b;
}

function splitCombinedBankProgram(bp: string): { bank: string; program: string } {
    const raw = String(bp || '').trim();
    const i = raw.indexOf(',');
    if (i < 0) return { bank: raw, program: '' };
    return { bank: raw.slice(0, i).trim(), program: raw.slice(i + 1).trim() };
}

function parseYmFromDealDate(dealDateIso: string): { year: number; month: number } {
    const d = new Date(dealDateIso);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    return { year: y, month: m };
}

function isMortgageBranchScopedRole(role: string): boolean {
    return ['commercial', 'head_sales', 'sales_manager', 'mortgage_broker'].includes(role);
}

/** Видимость: директор — компания; руководители филиала / ипотечный брокер — филиал при наличии branch_id и стандартном уровне; иначе — только свои записи. */
function buildListFilters(user: any): { clause: string; params: unknown[] } {
    const params: unknown[] = [user.company_id];
    let clause = 'm.company_id = $1';
    const al = Number(user.access_level || 0);
    const role = String(user.role || '');

    if (al >= 90) {
        return { clause, params };
    }
    if ((al >= 55 || isMortgageBranchScopedRole(role)) && user.branch_id) {
        params.push(user.branch_id);
        clause += ` AND (m.branch_id IS NULL OR m.branch_id = $${params.length})`;
        return { clause, params };
    }
    params.push(user.id);
    clause += ` AND (m.created_by = $${params.length} OR m.broker_id = $${params.length} OR m.agent_id = $${params.length})`;
    return { clause, params };
}

router.get('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        if (!canAccessMortgageApi(req.user)) {
            deny(res);
            return;
        }
        const { year, month, search, branch_id } = req.query;
        const { clause, params } = buildListFilters(req.user);

        let sql = `SELECT m.* FROM mortgage_service_rows m WHERE ${clause}`;

        if (year) {
            params.push(parseInt(year as string, 10));
            sql += ` AND m.year = $${params.length}`;
        }
        if (month) {
            params.push(parseInt(month as string, 10));
            sql += ` AND m.month = $${params.length}`;
        }
        if (branch_id && Number((req.user as any).access_level || 0) >= 90) {
            const bid = String(branch_id);
            if (bid === '__none__') {
                sql += ` AND m.branch_id IS NULL`;
            } else {
                params.push(bid);
                sql += ` AND m.branch_id = $${params.length}`;
            }
        }
        const qSearch = typeof search === 'string' ? search.trim() : '';
        if (qSearch) {
            params.push(`%${qSearch.toLowerCase()}%`);
            const pidx = params.length;
            sql += ` AND (
              LOWER(m.client_name) LIKE $${pidx}
              OR LOWER(COALESCE(m.bank_program,'')) LIKE $${pidx}
              OR LOWER(COALESCE(m.bank_name,'')) LIKE $${pidx}
              OR LOWER(COALESCE(m.program_name,'')) LIKE $${pidx}
              OR LOWER(COALESCE(m.broker_name,'')) LIKE $${pidx}
              OR LOWER(COALESCE(m.agent_name,'')) LIKE $${pidx}
            )`;
        }

        sql += ` ORDER BY m.deal_date DESC, m.created_at DESC`;

        const result = await query(sql, params);
        res.json({ data: result.rows });
    } catch (e: any) {
        console.error('[mortgage-services GET]', e);
        res.status(500).json({ error: { message: e.message || 'Server error' } });
    }
});

router.post('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        if (!canAccessMortgageApi(req.user)) {
            deny(res);
            return;
        }
        const {
            deal_date,
            bank_program,
            bank_name,
            program_name,
            service_cost,
            client_name,
            client_id,
            broker_id,
            broker_name,
            agent_id,
            agent_name,
            branch_id,
            team_id,
            status,
            broker_payout_status,
            broker_paid_at,
            broker_paid_note,
        } = req.body;

        const bankStr =
            typeof bank_name === 'string' && bank_name.trim()
                ? bank_name.trim()
                : typeof bank_program === 'string' && bank_program.trim()
                  ? bank_program.trim()
                  : '';
        const programStr =
            typeof program_name === 'string' && program_name.trim() ? program_name.trim() : '';
        const bankProgramCombined = combineMortgageBankProgram(bankStr, programStr);

        if (!deal_date || !bankStr || client_name == null || client_name === '' || service_cost == null) {
            res.status(400).json({
                error: { message: 'Укажите дату, банк (и при необходимости программу), клиента и стоимость услуги' },
            });
            return;
        }

        const { year, month } = parseYmFromDealDate(String(deal_date));
        const splits = computeMortgageSplits(Number(service_cost));
        const id = uuidv4();
        const companyId = (req.user as any).company_id;
        const createdBy = (req.user as any).id;
        const st = ['pending', 'approved', 'rejected'].includes(status) ? status : 'approved';
        const bps = broker_payout_status === 'paid' ? 'paid' : 'pending';

        await query(
            `INSERT INTO mortgage_service_rows (
              id, company_id, branch_id, team_id, deal_date, year, month,
              bank_name, program_name, bank_program, service_cost, client_name, client_id,
              broker_id, broker_name, agent_id, agent_name,
              agent_fee, broker_share, agency_share,
              broker_payout_status, broker_paid_at, broker_paid_note,
              status, created_by, created_at, updated_at
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,
              $8,$9,$10,$11,$12,$13,
              $14,$15,$16,$17,
              $18,$19,$20,
              $21,$22,$23,
              $24,$25,$26,$27
            )`,
            [
                id,
                companyId,
                branch_id || (req.user as any).branch_id || null,
                team_id || (req.user as any).team_id || null,
                String(deal_date),
                year,
                month,
                bankStr,
                programStr,
                bankProgramCombined,
                Number(service_cost),
                String(client_name).trim(),
                client_id || null,
                broker_id || null,
                broker_name || null,
                agent_id || null,
                agent_name || null,
                splits.agent_fee,
                splits.broker_share,
                splits.agency_share,
                bps,
                broker_paid_at || null,
                broker_paid_note || null,
                st,
                createdBy,
                new Date().toISOString(),
                new Date().toISOString(),
            ]
        );

        await syncMortgageServiceTransaction({
            rowId: id,
            companyId,
            serviceCost: Number(service_cost),
            clientName: String(client_name).trim(),
            bankProgram: bankProgramCombined,
            status: st,
        });

        try {
            await cacheService.invalidateAll();
        } catch (_) {}

        const row = await query(`SELECT * FROM mortgage_service_rows WHERE id = $1`, [id]);
        await logAudit(req, 'CREATE', 'mortgage_service', row.rows[0].id, { name: row.rows[0].client_name || row.rows[0].bank_program || '' });
        res.status(201).json(row.rows[0]);
    } catch (e: any) {
        console.error('[mortgage-services POST]', e);
        res.status(500).json({ error: { message: e.message || 'Server error' } });
    }
});

router.put('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        if (!canAccessMortgageApi(req.user)) {
            deny(res);
            return;
        }
        const id = req.params.id;
        const existing = await query(
            `SELECT * FROM mortgage_service_rows WHERE id = $1 AND company_id = $2`,
            [id, (req.user as any).company_id]
        );
        if (!existing.rows[0]) {
            res.status(404).json({ error: { message: 'Не найдено' } });
            return;
        }

        const prev = existing.rows[0];
        const body = req.body || {};
        const deal_date = body.deal_date != null ? String(body.deal_date) : prev.deal_date;
        const { year, month } = parseYmFromDealDate(deal_date);
        const service_cost = body.service_cost != null ? Number(body.service_cost) : Number(prev.service_cost);
        const splits = computeMortgageSplits(service_cost);

        let bankStr = String(prev.bank_name || '').trim();
        let programStr = String(prev.program_name || '').trim();
        if (!bankStr && !programStr) {
            const sp = splitCombinedBankProgram(String(prev.bank_program || ''));
            bankStr = sp.bank;
            programStr = sp.program;
        }
        if (body.bank_name != null) bankStr = String(body.bank_name).trim();
        if (body.program_name != null) programStr = String(body.program_name).trim();
        if (body.bank_program != null && body.bank_name == null && body.program_name == null) {
            const sp = splitCombinedBankProgram(String(body.bank_program));
            bankStr = sp.bank;
            programStr = sp.program;
        }
        const bank_program_val = combineMortgageBankProgram(bankStr, programStr);
        const client_name = body.client_name != null ? String(body.client_name).trim() : prev.client_name;
        const client_id =
            body.client_id !== undefined ? body.client_id || null : prev.client_id != null ? prev.client_id : null;
        const broker_id = body.broker_id !== undefined ? body.broker_id || null : prev.broker_id;
        const broker_name = body.broker_name !== undefined ? body.broker_name || null : prev.broker_name;
        const agent_id = body.agent_id !== undefined ? body.agent_id || null : prev.agent_id;
        const agent_name = body.agent_name !== undefined ? body.agent_name || null : prev.agent_name;
        const branch_id = body.branch_id !== undefined ? body.branch_id || null : prev.branch_id;
        const team_id = body.team_id !== undefined ? body.team_id || null : prev.team_id;
        const status = body.status != null && ['pending', 'approved', 'rejected'].includes(body.status) ? body.status : prev.status;
        const broker_payout_status =
            body.broker_payout_status != null ? (body.broker_payout_status === 'paid' ? 'paid' : 'pending') : prev.broker_payout_status;
        const broker_paid_at = body.broker_paid_at !== undefined ? body.broker_paid_at || null : prev.broker_paid_at;
        const broker_paid_note = body.broker_paid_note !== undefined ? body.broker_paid_note || null : prev.broker_paid_note;

        await query(
            `UPDATE mortgage_service_rows SET
              deal_date = $1, year = $2, month = $3,
              bank_name = $4, program_name = $5, bank_program = $6, service_cost = $7, client_name = $8, client_id = $9,
              broker_id = $10, broker_name = $11, agent_id = $12, agent_name = $13,
              branch_id = $14, team_id = $15,
              agent_fee = $16, broker_share = $17, agency_share = $18,
              broker_payout_status = $19, broker_paid_at = $20, broker_paid_note = $21,
              status = $22, updated_at = $23
            WHERE id = $24 AND company_id = $25`,
            [
                deal_date,
                year,
                month,
                bankStr,
                programStr,
                bank_program_val,
                service_cost,
                client_name,
                client_id,
                broker_id,
                broker_name,
                agent_id,
                agent_name,
                branch_id,
                team_id,
                splits.agent_fee,
                splits.broker_share,
                splits.agency_share,
                broker_payout_status,
                broker_paid_at,
                broker_paid_note,
                status,
                new Date().toISOString(),
                id,
                (req.user as any).company_id,
            ]
        );

        await syncMortgageServiceTransaction({
            rowId: id,
            companyId: (req.user as any).company_id,
            serviceCost: service_cost,
            clientName: client_name,
            bankProgram: bank_program_val,
            status,
        });

        try {
            await cacheService.invalidateAll();
        } catch (_) {}

        const row = await query(`SELECT * FROM mortgage_service_rows WHERE id = $1`, [id]);
        await logAudit(req, 'UPDATE', 'mortgage_service', id, { name: row.rows[0].client_name || row.rows[0].bank_program || '', ...req.body });
        res.json(row.rows[0]);
    } catch (e: any) {
        console.error('[mortgage-services PUT]', e);
        res.status(500).json({ error: { message: e.message || 'Server error' } });
    }
});

router.delete('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        if (!canAccessMortgageApi(req.user)) {
            deny(res);
            return;
        }
        const id = req.params.id;
        const existingRes = await query(`SELECT client_name, bank_program FROM mortgage_service_rows WHERE id = $1 AND company_id = $2`, [id, (req.user as any).company_id]);
        const existing = existingRes.rows[0];
        await query(`DELETE FROM transactions WHERE mortgage_service_row_id = $1`, [id]);
        await query(`DELETE FROM mortgage_service_rows WHERE id = $1 AND company_id = $2`, [
            id,
            (req.user as any).company_id,
        ]);
        try {
            await cacheService.invalidateAll();
        } catch (_) {}
        await logAudit(req, 'DELETE', 'mortgage_service', id, { name: existing?.client_name || existing?.bank_program || '' });
        res.json({ ok: true });
    } catch (e: any) {
        console.error('[mortgage-services DELETE]', e);
        res.status(500).json({ error: { message: e.message || 'Server error' } });
    }
});

export default router;
