const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function addMortgageBrokerRole() {
    const client = await pool.connect();
    try {
        console.log('Добавляем роль mortgage_broker в ENUM app_role...');

        // В PostgreSQL ALTER TYPE ADD VALUE нельзя выполнять внутри транзакционного блока (BEGIN/COMMIT)
        // Поэтому выполняем без транзакции
        await client.query(`ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'mortgage_broker'`);

        console.log('✅ Роль mortgage_broker успешно добавлена в ENUM app_role');

    } catch (err) {
        if (err.message.includes('already exists')) {
            console.log('ℹ️ Роль mortgage_broker уже существует в базе данных.');
        } else {
            console.error('❌ Ошибка при добавлении роли:', err);
        }
    } finally {
        client.release();
        await pool.end();
    }
}

addMortgageBrokerRole();
