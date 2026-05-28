const { v4: uuidv4 } = require('uuid');
const db = require('./index').db;
const { pool } = require('./index');

const seedBranches = async () => {
    console.log('🌱 Seeding Branches and Teams...');

    const branches = [
        { name: 'Филиал Воронеж', city: 'Воронеж', address: 'ул. Ленина, 10' },
        { name: 'Филиал Москва', city: 'Москва', address: 'ул. Тверская, 1' },
        { name: 'Филиал Сочи', city: 'Сочи', address: 'Курортный проспект, 50' },
    ];

    const teams = [
        { name: 'Отдел Продаж 1', branch: 'Филиал Воронеж' },
        { name: 'Отдел Продаж 2', branch: 'Филиал Воронеж' },
        { name: 'Отдел Аренды', branch: 'Филиал Москва' },
    ];

    if (db) {
        // SQLite
        const insertBranch = db.prepare('INSERT OR IGNORE INTO branches (id, name, city, address) VALUES (?, ?, ?, ?)');
        const insertTeam = db.prepare('INSERT OR IGNORE INTO teams (id, name, branch_id) VALUES (?, ?, ?)');
        const getBranch = db.prepare('SELECT id FROM branches WHERE name = ?');

        db.transaction(() => {
            branches.forEach(b => {
                insertBranch.run(uuidv4(), b.name, b.city, b.address);
            });

            teams.forEach(t => {
                const branch = getBranch.get(t.branch);
                if (branch) {
                    insertTeam.run(uuidv4(), t.name, branch.id);
                }
            });
        })();
    } else if (pool) {
        // PG
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            for (const b of branches) {
                // PG upsert is complex, just insert if not exists logic or simple insert for seed
                const res = await client.query('SELECT id FROM branches WHERE name = $1', [b.name]);
                let branchId = res.rows[0]?.id;
                if (!branchId) {
                    branchId = uuidv4();
                    await client.query('INSERT INTO branches (id, name, city, address) VALUES ($1, $2, $3, $4)', [branchId, b.name, b.city, b.address]);
                }

                // Seed teams for this branch
                const branchTeams = teams.filter(t => t.branch === b.name);
                for (const t of branchTeams) {
                    await client.query('INSERT INTO teams (id, name, branch_id) SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM teams WHERE name = $2 AND branch_id = $3)', [uuidv4(), t.name, branchId]);
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

    console.log('✅ Branches and Teams seeded');
};

seedBranches().then(() => {
    if (pool) pool.end();
    else process.exit(0);
});
