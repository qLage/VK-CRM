import express, { Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken, requireAccessLevel } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Seed database with test data (admin only)
router.post('/seed-activities', authenticateToken, requireAccessLevel(100), async (_req: Request, res: Response): Promise<void> => {
    try {
        console.log('Starting database seed...');

        const employees = await query('SELECT id, email FROM profiles LIMIT 20');
        console.log(`Found ${employees.rows.length} employees`);

        if (employees.rows.length === 0) {
            res.status(400).json({ error: { message: 'No employees found in database' } });
            return;
        }

        const types = ['deal', 'meeting', 'showing', 'object', 'call', 'email', 'task'];
        const titles: Record<string, string[]> = {
            deal: ['Сделка с клиентом', 'Закрытие договора', 'Продажа квартиры', 'Сделка по новостройке'],
            meeting: ['Встреча с клиентом', 'Показ объекта', 'Консультация', 'Переговоры'],
            showing: ['Показ квартиры', 'Осмотр дома', 'Показ офиса', 'Просмотр участка'],
            object: ['Новый объект', 'Обновление объекта', 'Снятие с продажи', 'Изменение цены'],
            call: ['Звонок клиенту', 'Входящий звонок', 'Консультация по телефону', 'Уточнение деталей'],
            email: ['Отправка документов', 'Ответ клиенту', 'Рассылка предложений', 'Согласование условий'],
            task: ['Подготовка документов', 'Проверка объекта', 'Обновление базы', 'Отчет по сделке']
        };

        let totalInserted = 0;

        for (const emp of employees.rows) {
            const userId = emp.id;

            const activityCount = Math.floor(Math.random() * 30) + 20;

            for (let i = 0; i < activityCount; i++) {
                const type = types[Math.floor(Math.random() * types.length)];
                const titleOptions = titles[type];
                const title = titleOptions[Math.floor(Math.random() * titleOptions.length)];

                const daysAgo = Math.floor(Math.random() * 90);
                const hoursAgo = Math.floor(Math.random() * 24);
                const date = new Date();
                date.setDate(date.getDate() - daysAgo);
                date.setHours(date.getHours() - hoursAgo);

                const metadata = JSON.stringify({
                    revenue: type === 'deal' ? Math.floor(Math.random() * 5000000) + 1000000 : undefined,
                    client: 'Клиент ' + Math.floor(Math.random() * 100),
                    status: ['completed', 'in_progress', 'pending'][Math.floor(Math.random() * 3)]
                });

                await query(
                    'INSERT INTO service_requests (id, user_id, type, title, description, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [uuidv4(), userId, type, title, 'Описание активности', metadata, date.toISOString()]
                );

                totalInserted++;
            }
        }

        for (const emp of employees.rows) {
            const userId = emp.id;
            const activityCount = Math.floor(Math.random() * 15) + 10;

            for (let i = 0; i < activityCount; i++) {
                const type = types[Math.floor(Math.random() * types.length)];
                const titleOptions = titles[type];
                const title = titleOptions[Math.floor(Math.random() * titleOptions.length)];

                const daysAgo = Math.floor(Math.random() * 7);
                const hour = Math.floor(Math.random() * 12) + 8;
                const minute = Math.floor(Math.random() * 60);

                const date = new Date();
                date.setDate(date.getDate() - daysAgo);
                date.setHours(hour, minute, 0, 0);

                const metadata = JSON.stringify({
                    revenue: type === 'deal' ? Math.floor(Math.random() * 5000000) + 1000000 : undefined,
                    client: 'Клиент ' + Math.floor(Math.random() * 100),
                    status: ['completed', 'in_progress', 'pending'][Math.floor(Math.random() * 3)]
                });

                await query(
                    'INSERT INTO service_requests (id, user_id, type, title, description, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [uuidv4(), userId, type, title, 'Описание активности', metadata, date.toISOString()]
                );

                totalInserted++;
            }
        }

        console.log(`Seed completed: ${totalInserted} activities created`);

        const countResult = await query('SELECT COUNT(*) as count FROM service_requests');
        const totalCount = countResult.rows[0].count;

        res.json({
            success: true,
            message: 'Database seeded successfully',
            inserted: totalInserted,
            total: totalCount
        });
    } catch (error) {
        console.error('Seed error:', error);
        res.status(500).json({ error: { message: 'Seed failed', details: (error as Error).message } });
    }
});

// Clear all service requests (admin only, for testing)
router.delete('/clear-activities', authenticateToken, requireAccessLevel(100), async (_req: Request, res: Response): Promise<void> => {
    try {
        await query('DELETE FROM service_requests');
        res.json({ success: true, message: 'All activities cleared' });
    } catch (error) {
        console.error('Clear error:', error);
        res.status(500).json({ error: { message: 'Clear failed', details: (error as Error).message } });
    }
});

export default router;
