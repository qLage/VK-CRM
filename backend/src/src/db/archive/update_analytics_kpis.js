require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function updateAnalyticsSchema() {
    const client = await pool.connect();
    try {
        console.log('--- ADDING ANALYTICS COLUMNS TO quarterly_plans ---');
        const qCols = ['target_calls', 'target_meetings', 'target_showings'];
        for (const col of qCols) {
            try {
                await client.query(`ALTER TABLE quarterly_plans ADD COLUMN ${col} INTEGER DEFAULT 0`);
                console.log(`Added ${col} to quarterly_plans`);
            } catch (e) {
                console.log(`${col} likely exists in quarterly_plans: ${e.message}`);
            }
        }

        console.log('--- ADDING ANALYTICS COLUMNS TO user_plans ---');
        const uCols = ['target_calls', 'target_meetings', 'target_showings'];
        for (const col of uCols) {
            try {
                await client.query(`ALTER TABLE user_plans ADD COLUMN ${col} INTEGER DEFAULT 0`);
                console.log(`Added ${col} to user_plans`);
            } catch (e) {
                console.log(`${col} likely exists in user_plans: ${e.message}`);
            }
        }

        console.log('SUCCESS: Analytics schema updated');
    } catch (err) {
        console.error('ERROR updating analytics schema:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

module.exports = updateAnalyticsSchema;

if (require.main === module) {
    updateAnalyticsSchema();
}
