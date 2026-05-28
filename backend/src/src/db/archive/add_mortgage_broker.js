const { query } = require('./index');

async function addMortgageBrokerPosition() {
    try {
        console.log('Running migration: Add Mortgage Broker position...');

        await query(`
            INSERT INTO positions (
                id,
                name,
                description,
                base_salary,
                commission_percent,
                participates_in_rating,
                is_new_building,
                is_salary_enabled,
                is_system,
                is_kpi_enabled,
                sort_order,
                created_at,
                updated_at
            )
            VALUES (
                'pos-mortgage',
                'Ипотечный Брокер',
                'Специалист по ипотеке',
                0,
                40,
                1,
                0,
                1,
                0,
                1,
                55,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                base_salary = EXCLUDED.base_salary,
                commission_percent = EXCLUDED.commission_percent,
                participates_in_rating = EXCLUDED.participates_in_rating,
                is_new_building = EXCLUDED.is_new_building,
                is_salary_enabled = EXCLUDED.is_salary_enabled,
                is_kpi_enabled = EXCLUDED.is_kpi_enabled,
                sort_order = EXCLUDED.sort_order,
                updated_at = CURRENT_TIMESTAMP
        `);

        console.log('✅ Mortgage Broker position added successfully');
    } catch (error) {
        console.error('❌ Failed to add Mortgage Broker position:', error);
        // Don't throw - allow server to continue if migration fails
    }
}

module.exports = addMortgageBrokerPosition;
