import { v4 as uuidv4 } from 'uuid';
import { query } from '../db';

/**
 * При одобренной ипотечной записи отражает полную сумму услуги в транзакциях как валовую выручку (income).
 * Категория mortgage_service_fee + mortgage_service_row_id (не смешиваем с KPI по deal_table_rows).
 */
export async function syncMortgageServiceTransaction(opts: {
    rowId: string;
    companyId: string;
    serviceCost: number;
    clientName: string;
    bankProgram: string;
    status: string;
}): Promise<void> {
    const amount = Number(opts.serviceCost);
    const now = new Date().toISOString();

    if (opts.status !== 'approved') {
        await query(`DELETE FROM transactions WHERE mortgage_service_row_id = $1`, [opts.rowId]);
        return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
        await query(`DELETE FROM transactions WHERE mortgage_service_row_id = $1`, [opts.rowId]);
        return;
    }

    const desc = `Ипотечная услуга: ${opts.clientName?.trim() || 'клиент'} (${opts.bankProgram?.trim() || '—'})`;

    const existing = await query(
        `SELECT id FROM transactions WHERE mortgage_service_row_id = $1 AND category = $2 LIMIT 1`,
        [opts.rowId, 'mortgage_service_fee']
    );

    if (existing.rows?.[0]?.id) {
        await query(
            `UPDATE transactions SET amount = $1, description = $2, updated_at = $3 WHERE id = $4`,
            [amount, desc, now, existing.rows[0].id]
        );
        return;
    }

    await query(
        `INSERT INTO transactions (
          id, type, category, amount, description,
          mortgage_service_row_id, account_type,
          company_id, created_at, updated_at
        ) VALUES ($1, 'income', 'mortgage_service_fee', $2, $3, $4, 'account', $5, $6, $7)`,
        [uuidv4(), amount, desc, opts.rowId, opts.companyId, now, now]
    );
}
