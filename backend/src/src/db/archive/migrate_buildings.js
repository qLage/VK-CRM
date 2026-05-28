require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // ssl: { rejectUnauthorized: false } // Disabled for local dev without SSL
});

const MOCK_BUILDINGS = [
    {
        name: "ЖК Высота",
        developer: "ГК Прогресс",
        status: "Продажи открыты",
        price: "от 8.5M ₽",
        address: "Центральный р-н, ул. Мира 15",
        image: "bg-gradient-to-br from-indigo-900 to-slate-900",
        tags: ["Бизнес-класс", "Центр города"],
        floor: 24,
        delivery: "4 кв. 2025"
    },
    {
        name: "ЖК Северный",
        developer: "Девелопмент-Юг",
        status: "Пресейл",
        price: "от 6.2M ₽",
        address: "Северный р-н, пр. Ленина 101",
        image: "bg-gradient-to-br from-emerald-900 to-teal-900",
        tags: ["Эко-квартал", "Рядом парк"],
        floor: 16,
        delivery: "2 кв. 2026"
    },
    {
        name: "ЖК Риверсайд",
        developer: "Аква-Строй",
        status: "Финальный этап",
        price: "от 12.9M ₽",
        address: "Набережная, д. 5",
        image: "bg-gradient-to-br from-blue-900 to-indigo-900",
        tags: ["Премиум", "Вид на реку"],
        floor: 32,
        delivery: "1 кв. 2025"
    },
    {
        name: "ЖК Лофт Пространство",
        developer: "Сити Билд",
        status: "Продано",
        price: "от 15.0M ₽",
        address: "г. Москва, ул. Лофт 5",
        image: "bg-gradient-to-br from-orange-900 to-amber-900",
        tags: ["Лофт", "Апартаменты"],
        floor: 5,
        delivery: "Сдан"
    },
    {
        name: "ЖК Зеленая Долина",
        developer: "ЭкоСтрой",
        status: "Продажи открыты",
        price: "от 7.5M ₽",
        address: "Пригородный р-н, ул. Зеленая 1",
        image: "bg-gradient-to-br from-green-900 to-lime-900",
        tags: ["Комфорт+", "Закрытая территория"],
        floor: 9,
        delivery: "3 кв. 2024"
    }
];

const migrate = async () => {
    const client = await pool.connect();
    try {
        console.log('🔌 Connected to PostgreSQL');
        console.log('🛠 Starting buildings migration...');

        await client.query('BEGIN');

        // Create Table
        await client.query(`
      CREATE TABLE IF NOT EXISTS buildings (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        developer TEXT,
        status TEXT,
        price TEXT,
        address TEXT,
        image TEXT,
        tags TEXT[],
        floor INTEGER,
        delivery TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('✅ Table buildings created/verified');

        // Seed Data
        for (const b of MOCK_BUILDINGS) {
            // Check if exists
            const res = await client.query('SELECT id FROM buildings WHERE name = $1', [b.name]);
            if (res.rowCount === 0) {
                await client.query(`
          INSERT INTO buildings (name, developer, status, price, address, image, tags, floor, delivery)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [b.name, b.developer, b.status, b.price, b.address, b.image, b.tags, b.floor, b.delivery]);
            }
        }
        console.log(`✅ Seeded ${MOCK_BUILDINGS.length} buildings`);

        await client.query('COMMIT');
        console.log('✅ Migration completed successfully');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', e);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
};

migrate();
