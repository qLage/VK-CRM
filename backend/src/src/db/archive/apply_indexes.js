const { pool } = require('./index');
const fs = require('fs');
const path = require('path');

async function applyIndexes() {
    if (!pool) {
        console.log('⚠️  PostgreSQL not configured, skipping index creation');
        return;
    }

    try {
        console.log('📊 Applying performance indexes...');

        const sqlPath = path.join(__dirname, 'add_indexes.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        await pool.query(sql);

        console.log('✓ Performance indexes applied successfully');
    } catch (error) {
        console.error('❌ Error applying indexes:', error.message);
        // Don't throw - indexes might already exist
    }
}

// Run if called directly
if (require.main === module) {
    applyIndexes()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = applyIndexes;
