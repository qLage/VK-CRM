const { query } = require('./index');

async function addKpiFields() {
    try {
        console.log('📦 Adding KPI fields to positions and profiles...');

        const isPostgres = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('postgres');

        // Add KPI fields to positions table
        if (isPostgres) {
            const positionsCheck = await query(`
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'positions' AND column_name = 'default_personal_kpi_min'
            `);

            if (positionsCheck.rows.length === 0) {
                console.log('Adding KPI columns to positions table...');
                await query(`
                    ALTER TABLE positions
                    ADD COLUMN IF NOT EXISTS default_personal_kpi_min DECIMAL(5,2) DEFAULT 40,
                    ADD COLUMN IF NOT EXISTS default_personal_kpi_max DECIMAL(5,2) DEFAULT 60,
                    ADD COLUMN IF NOT EXISTS default_management_kpi_min DECIMAL(5,2) DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS default_management_kpi_max DECIMAL(5,2) DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS management_base_salary DECIMAL(10,2) DEFAULT 0
                `);
                console.log('✅ KPI columns added to positions');

                // Set default values for management positions
                console.log('Setting default KPI values for management positions...');

                await query(`
                    UPDATE positions
                    SET default_personal_kpi_min = 40,
                        default_personal_kpi_max = 60,
                        default_management_kpi_min = 3,
                        default_management_kpi_max = 5,
                        management_base_salary = 40000
                    WHERE name ILIKE '%менеджер%' OR name ILIKE '%МОП%'
                `);

                await query(`
                    UPDATE positions
                    SET default_personal_kpi_min = 40,
                        default_personal_kpi_max = 60,
                        default_management_kpi_min = 3,
                        default_management_kpi_max = 6,
                        management_base_salary = 80000
                    WHERE name ILIKE '%руководитель%' OR name ILIKE '%РОП%'
                `);

                await query(`
                    UPDATE positions
                    SET default_personal_kpi_min = 40,
                        default_personal_kpi_max = 60,
                        default_management_kpi_min = 3,
                        default_management_kpi_max = 6,
                        management_base_salary = 80000
                    WHERE name ILIKE '%коммерческий%' OR name ILIKE '%директор%'
                `);

                console.log('✅ Default KPI values set');
            } else {
                console.log('ℹ️  KPI columns already exist in positions');
            }

            // Add KPI fields to profiles table
            const profilesCheck = await query(`
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'profiles' AND column_name = 'personal_kpi_current'
            `);

            if (profilesCheck.rows.length === 0) {
                console.log('Adding KPI columns to profiles table...');
                await query(`
                    ALTER TABLE profiles
                    ADD COLUMN IF NOT EXISTS personal_kpi_current DECIMAL(5,2),
                    ADD COLUMN IF NOT EXISTS management_kpi_current DECIMAL(5,2),
                    ADD COLUMN IF NOT EXISTS kpi_last_updated TIMESTAMP
                `);
                console.log('✅ KPI columns added to profiles');
            } else {
                console.log('ℹ️  KPI columns already exist in profiles');
            }
        } else {
            // SQLite
            const positionsInfo = await query(`PRAGMA table_info(positions)`);
            const hasPersonalKpiMin = positionsInfo.some(col => col.name === 'default_personal_kpi_min');

            if (!hasPersonalKpiMin) {
                console.log('Adding KPI columns to positions table (SQLite)...');
                await query(`ALTER TABLE positions ADD COLUMN default_personal_kpi_min REAL DEFAULT 40`);
                await query(`ALTER TABLE positions ADD COLUMN default_personal_kpi_max REAL DEFAULT 60`);
                await query(`ALTER TABLE positions ADD COLUMN default_management_kpi_min REAL DEFAULT 0`);
                await query(`ALTER TABLE positions ADD COLUMN default_management_kpi_max REAL DEFAULT 0`);
                await query(`ALTER TABLE positions ADD COLUMN management_base_salary REAL DEFAULT 0`);
                console.log('✅ KPI columns added to positions');
            } else {
                console.log('ℹ️  KPI columns already exist in positions');
            }

            const profilesInfo = await query(`PRAGMA table_info(profiles)`);
            const hasPersonalKpiCurrent = profilesInfo.some(col => col.name === 'personal_kpi_current');

            if (!hasPersonalKpiCurrent) {
                console.log('Adding KPI columns to profiles table (SQLite)...');
                await query(`ALTER TABLE profiles ADD COLUMN personal_kpi_current REAL`);
                await query(`ALTER TABLE profiles ADD COLUMN management_kpi_current REAL`);
                await query(`ALTER TABLE profiles ADD COLUMN kpi_last_updated TEXT`);
                console.log('✅ KPI columns added to profiles');
            } else {
                console.log('ℹ️  KPI columns already exist in profiles');
            }
        }

        console.log('✅ KPI fields migration completed');
    } catch (error) {
        console.error('❌ Error adding KPI fields:', error.message);
        // Don't throw - allow server to continue
    }
}

module.exports = addKpiFields;
