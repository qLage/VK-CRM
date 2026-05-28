const { v4: uuidv4 } = require('uuid');
const db = require('./index').db;
const { pool } = require('./index');

const seedKPI = async () => {
    console.log('📊 Seeding KPI Rules...');

    const rules = [
        // Realtor Rules
        { role: 'realtor', period_type: 'monthly', min_threshold: 0, percent: 30, description: 'Стандартная комиссия' },
        { role: 'realtor', period_type: 'monthly', min_threshold: 500000, percent: 50, description: 'Повышенная комиссия (При выручке > 500к)' },

        // MOP Rules
        { role: 'sales_manager', period_type: 'monthly', min_threshold: 0, percent: 5, description: 'Процент от выручки команды' },

        // ROP Rules
        { role: 'head_sales', period_type: 'monthly', min_threshold: 0, percent: 3, description: 'Процент от выручки филиала' }
    ];

    if (db) {
        // SQLite
        const insertRule = db.prepare('INSERT OR IGNORE INTO kpi_rules (id, role, period_type, min_threshold, percent, description) VALUES (?, ?, ?, ?, ?, ?)');
        // We can't easily check for duplicates with random IDs, so let's check by role/threshold
        const checkRule = db.prepare('SELECT id FROM kpi_rules WHERE role = ? AND min_threshold = ?');

        db.transaction(() => {
            rules.forEach(r => {
                const existing = checkRule.get(r.role, r.min_threshold);
                if (!existing) {
                    insertRule.run(uuidv4(), r.role, r.period_type, r.min_threshold, r.percent, r.description);
                }
            });
        })();
    } else if (pool) {
        // PG
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            for (const r of rules) {
                const res = await client.query('SELECT id FROM kpi_rules WHERE role = $1 AND min_threshold = $2', [r.role, r.min_threshold]);
                if (res.rows.length === 0) {
                    await client.query(
                        'INSERT INTO kpi_rules (id, role, period_type, min_threshold, percent, description) VALUES ($1, $2, $3, $4, $5, $6)',
                        [uuidv4(), r.role, r.period_type, r.min_threshold, r.percent, r.description]
                    );
                }
            }

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            console.error(e);
        } finally {
            client.release();
        }
    }

    console.log('✅ KPI Rules seeded');
};

seedKPI().then(() => {
    if (pool) pool.end();
    else process.exit(0);
});
