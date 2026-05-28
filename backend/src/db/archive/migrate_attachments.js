const { query } = require('./index');

async function migrate() {
    console.log('🚀 Starting service request attachments migration...');
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS service_request_attachments (
                id UUID PRIMARY KEY,
                request_id UUID REFERENCES service_requests(id) ON DELETE CASCADE,
                file_name TEXT NOT NULL,
                file_url TEXT NOT NULL,
                file_size INTEGER,
                uploaded_by UUID REFERENCES profiles(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ service_request_attachments table created or already exists.');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    migrate();
}

module.exports = migrate;
