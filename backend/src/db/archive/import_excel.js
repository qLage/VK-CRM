
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { transliterate } = require('transliteration');
const { query, db } = require('./index');

const FILES_DIR = path.join(__dirname, '../../../files');

// Excel Files to process
const EXCEL_FILES = [
    path.join(FILES_DIR, 'Комиссия АН Ваша Крыша 2025.xlsx'),
    path.join(FILES_DIR, '2025 год Комиссия АН ВК 3КВ МОП Шишакова.xlsx')
];

// Helper to clean strings
const cleanStr = (s) => s ? String(s).trim() : null;

// Helper to parsing dates from Excel (serial number or string)
const parseExcelDate = (serial) => {
    if (!serial) return new Date().toISOString();

    // Check if it's already a date string (YYYY-MM-DD or similar)
    if (typeof serial === 'string') {
        // Try parsing basic string
        const d = new Date(serial);
        if (!isNaN(d.getTime())) return d.toISOString();
        return new Date().toISOString(); // Fallback
    }

    // Excel serial date to JS Date
    // Excel base date is Dec 30 1899 (dates are number of days since then)
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return date_info.toISOString();
};

const run = async () => {
    console.log('🚀 Starting Data Reset & Import...');

    try {
        // 1. WIPE DATA
        console.log('🗑️  Wiping database...');
        // Order matters for Foreign Keys
        await query('DELETE FROM reports');
        await query('DELETE FROM notifications');
        await query('DELETE FROM transactions'); // If exists
        await query('DELETE FROM attendance');
        await query('DELETE FROM user_roles');
        await query('DELETE FROM profiles');
        await query('DELETE FROM auth_users');

        // Reset sequences if Postgres (not needed for SQLite usually but good practice? SQLite uses sqlite_sequence)
        // For SQLite:
        // await query('DELETE FROM sqlite_sequence WHERE name IN ("reports", ...)'); 

        console.log('✅ Database wiped.');

        // 2.a CREATE BRANCHES
        console.log('🏢 Creating Branches...');
        const branches = {
            'Voronezh': uuidv4(),
            'Moscow': uuidv4(),
            'Sochi': uuidv4()
        };

        await query('INSERT INTO branches (id, name, city, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [branches['Voronezh'], 'Филиал Воронеж', 'Воронеж', 'ул. Ленина, 10', new Date().toISOString(), new Date().toISOString()]);
        await query('INSERT INTO branches (id, name, city, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [branches['Moscow'], 'Филиал Москва', 'Москва', 'ул. Тверская, 1', new Date().toISOString(), new Date().toISOString()]);
        await query('INSERT INTO branches (id, name, city, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [branches['Sochi'], 'Филиал Сочи', 'Сочи', 'Курортный проспект, 50', new Date().toISOString(), new Date().toISOString()]);

        // 3. CREATE DIRECTORS & POSITIONS
        // ... (Positions logic same)
        const positionsRaw = await query('SELECT * FROM positions');
        let positions = {};
        positionsRaw.rows.forEach(p => positions[p.name] = p.id);

        if (Object.keys(positions).length === 0) {
            console.log('⚠️  No positions found. Seeding positions...');
            const newPositions = [
                { name: 'Риелтор', salary: 0, comm: 50 },
                { name: 'РОП', salary: 50000, comm: 10 },
                { name: 'Директор', salary: 100000, comm: 0 },
            ];
            for (const p of newPositions) {
                const id = uuidv4();
                await query('INSERT INTO positions (id, name, base_salary, commission_percent) VALUES (?, ?, ?, ?)',
                    [id, p.name, p.salary, p.comm]);
                positions[p.name] = id;
            }
        }

        // 3. CREATE DIRECTOR (Alexander Matveev)
        console.log('👤 Creating Director...');
        const dirId = uuidv4();
        const dirEmail = 'director@vk.com';
        const dirPass = bcrypt.hashSync('123456', 10);

        await query('INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at) VALUES (?, ?, ?, ?)',
            [dirId, dirEmail, dirPass, new Date().toISOString()]);

        await query('INSERT INTO profiles (id, email, full_name, phone, position_id, is_active, avatar_url, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [dirId, dirEmail, 'Александр Матвеев', '+7 (999) 000-00-00', positions['Директор'], 1, null, branches['Voronezh']]);

        await query('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)',
            [uuidv4(), dirId, 'director']);

        // 4. IMPORT FROM EXCEL
        console.log('📂  Processing Excel files...');

        const createdUsers = new Set();
        createdUsers.add('Александр Матвеев');

        for (const filePath of EXCEL_FILES) {
            if (!fs.existsSync(filePath)) {
                console.warn(`⚠️  File not found: ${filePath}`);
                continue;
            }
            console.log(`Processing ${path.basename(filePath)}...`);

            const workbook = xlsx.readFile(filePath);

            for (const sheetName of workbook.SheetNames) {
                let rawName = sheetName.replace(/СПН|4 квартал|\d+/gi, '').trim();
                if (rawName.length < 3) continue;

                let role = 'realtor';
                // Determine Branch (Default to Voronezh for now as most files look like Voronezh)
                let branchId = branches['Voronezh'];

                if (!createdUsers.has(rawName)) {
                    // Create User
                    const userId = uuidv4();
                    const email = `${transliterate(rawName).replace(/\s+/g, '.').toLowerCase()}@vk.crm`;
                    const password = bcrypt.hashSync('123456', 10);

                    await query('INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at) VALUES (?, ?, ?, ?)',
                        [userId, email, password, new Date().toISOString()]);

                    await query('INSERT INTO profiles (id, email, full_name, phone, position_id, is_active, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [userId, email, rawName, null, positions['Риелтор'], 1, branchId]);

                    const roleId = uuidv4();
                    await query('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)',
                        [roleId, userId, role]);

                    createdUsers.add(rawName);
                }

                // GET USER ID
                // We need to fetch it back or store in map.
                const userRes = await query('SELECT id FROM profiles WHERE full_name = ?', [rawName]);
                if (!userRes.rows.length) continue;
                const currentUserId = userRes.rows[0].id;

                // PARSE DEALS
                const sheet = workbook.Sheets[sheetName];
                const data = xlsx.utils.sheet_to_json(sheet); // Array of objects

                for (const row of data) {
                    // Mapping columns (based on inspection.txt)
                    // "Объект недвижимости" -> object
                    // "Комиссия продавец (получено)" + "Комиссия покупатель (получено)" -> revenue/amount
                    // "дата сделки" -> created_at

                    // Keys might be messy due to encoding in inspection.txt, but xlsx should read keys correctly in UTF8.
                    // Let's look for keywords in keys.

                    let amount = 0;
                    let objectName = '';
                    let dealDate = new Date().toISOString();
                    let dealType = 'deal';

                    for (const [key, val] of Object.entries(row)) {
                        const kw = key.toLowerCase();

                        if (kw.includes('объект')) objectName = val;

                        // Amount: Sum of commissions received
                        if (kw.includes('комиссия') && kw.includes('получено')) {
                            const v = parseFloat(val);
                            if (!isNaN(v)) amount += v;
                        }

                        if (kw.includes('дата сделки') || kw.includes('дата задатка')) {
                            // Prefer deal date, fallback to deposit date
                            if (!dealDate || (kw.includes('сделки') && val)) {
                                dealDate = parseExcelDate(val);
                            }
                        }
                    }

                    if (amount > 0) {
                        // Create Report (Approved)
                        const reportId = uuidv4();
                        const content = JSON.stringify({
                            deal_type: 'sale', // generic
                            object: objectName || 'Неизвестный объект',
                            amount: amount,
                            client: 'Клиент из Excel',
                            address: objectName || 'Неизвестный адрес'
                        });

                        await query(`INSERT INTO reports 
                            (id, user_id, type, status, content, amount, deal_date, client_name, property_address, created_at, updated_at) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                reportId,
                                currentUserId,
                                'deal',
                                'approved',
                                content,
                                amount,
                                dealDate,
                                row['Покупатель'] || 'Клиент', // Map client name from row
                                objectName,
                                dealDate,
                                dealDate
                            ]
                        );
                    }
                }

                console.log(`   Imported ${data.length} rows for ${rawName}`);
            }
        }

        console.log('🎉 Import completed successfully!');

    } catch (error) {
        console.error('❌ Import failed:', error);
    }
};

run();
