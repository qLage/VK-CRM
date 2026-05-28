const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function createMaterializedViews() {
    const client = await pool.connect();
    try {
        console.log('Начинаем создание Materialized Views...');

        await client.query('BEGIN');

        // Создаем Materialized View для KPI и сводки сотрудников
        await client.query(`
            CREATE MATERIALIZED VIEW IF NOT EXISTS mv_employee_kpi_summary AS
            SELECT 
                e.id as employee_id,
                e.branch_id,
                COUNT(d.id) as total_deals,
                COALESCE(SUM(d.amount), 0) as total_revenue,
                DATE_TRUNC('month', d.created_at) as report_month
            FROM employees e
            LEFT JOIN deals d ON e.id = d.employee_id AND d.status = 'won'
            GROUP BY 1, 2, 5;
        `);
        console.log('✅ Created mv_employee_kpi_summary');

        // Создаем уникальный индекс для CONCURRENTLY обновления
        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_employee_kpi_summary_unique 
            ON mv_employee_kpi_summary(employee_id, report_month);
        `);
        console.log('✅ Created unique index on mv_employee_kpi_summary');

        // Функция для обновления
        await client.query(`
            CREATE OR REPLACE FUNCTION refresh_kpi_summary()
            RETURNS void AS $$
            BEGIN
                REFRESH MATERIALIZED VIEW CONCURRENTLY mv_employee_kpi_summary;
            END;
            $$ LANGUAGE plpgsql;
        `);
        console.log('✅ Created refresh function refresh_kpi_summary()');

        await client.query('COMMIT');
        console.log('🎉 Все Materialized Views успешно созданы!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Ошибка при создании Materialized Views:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

createMaterializedViews();
