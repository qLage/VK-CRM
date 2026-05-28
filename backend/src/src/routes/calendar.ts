import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// GET /events - Get calendar events (Service Requests + Report Status)
router.get('/events', authenticateToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const { start, end } = req.query;
        const userId = req.user!.id;

        if (!start || !end) {
            res.status(400).json({ error: { message: 'Start and End dates are required' } });
            return;
        }

        // 1. Get Service Requests with dates (Showings, Meetings, Deals)
        const requestsSql = `
            SELECT id, type, title, created_at, data
            FROM service_requests
            WHERE user_id = $1
            AND (type = 'showing' OR type = 'meeting' OR type = 'deal')
        `;

        const requestsResult = await query(requestsSql, [userId]);

        const events: any[] = [];

        requestsResult.rows.forEach((row: any) => {
            const data = row.data ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : {};
            const eventDate = data.date || data.datetime || row.created_at;

            if (eventDate >= start && eventDate <= end) {
                events.push({
                    id: row.id,
                    title: row.title || (row.type === 'showing' ? 'Показ' : 'Встреча'),
                    start: eventDate,
                    type: row.type,
                    status: 'approved'
                });
            }
        });

        const isPostgres = !process.env.DB_PATH && !!process.env.DATABASE_URL;
        const dateFunc = isPostgres ? "CAST(created_at AS date)" : "date(created_at)";

        const reportsSql = `
            SELECT ${dateFunc} as report_date, status
            FROM reports
            WHERE user_id = $1
            AND ${isPostgres ? 'created_at::TIMESTAMP::date' : 'date(created_at)'} BETWEEN $2::date AND $3::date
        `;

        const reportsResult = await query(reportsSql, [userId, start, end]);

        reportsResult.rows.forEach((row: any) => {
            events.push({
                id: `report-${row.report_date}`,
                title: 'Отчет сдан',
                start: row.report_date,
                type: 'report',
                status: 'success'
            });
        });

        res.json(events);

    } catch (e: any) {
        console.error('Error fetching calendar events:', e);
        res.status(500).json({ error: { message: 'Internal server error', details: e.message } });
    }
});

export default router;
