import { Telegraf, Markup, Context } from 'telegraf';
import Docker from 'dockerode';

/**
 * Telegram Bot Service for CRM Monitoring and Management
 * 
 * Features:
 * - /status: Check container health
 * - /logs: View recent logs via inline buttons
 * - /restart: Restart containers via inline buttons
 * - Alerting: Instant notification on 500 errors and crashes
 */

class TelegramBotService {
    private bot: Telegraf | null = null;
    private docker: Docker | null = null;
    private adminChatId: string | null = null;

    constructor() {
        const token = process.env.TG_BOT_TOKEN;
        this.adminChatId = process.env.TG_ADMIN_ID || null;

        if (token && token.length > 10) {
            try {
                this.bot = new Telegraf(token);
                this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
                this.setupHandlers();
                console.log('🤖 Telegram Bot Service initialized (waiting for launch)');
            } catch (err) {
                console.error('❌ Failed to initialize Telegraf instance:', err instanceof Error ? err.message : err);
            }
        } else {
            console.warn('⚠️ Telegram Bot Token not found or invalid. Bot service disabled.');
        }
    }

    private setupHandlers() {
        if (!this.bot) return;

        // Middleware for Admin check
        this.bot.use(async (ctx: Context, next: () => Promise<void>) => {
            const chatId = ctx.chat?.id.toString();
            if (this.adminChatId && chatId !== this.adminChatId) {
                console.warn(`🔒 Unauthorized access attempt to TG Bot from Chat ID: ${chatId}`);
                return ctx.reply('⛔ Доступ запрещен. Этот бот предназначен только для администратора.');
            }
            return next();
        });

        // /start command
        this.bot.start((ctx: Context) => {
            const chatId = ctx.chat.id.toString();
            if (!this.adminChatId) {
                console.log(`ℹ️ Admin Chat ID detected: ${chatId}. Set TG_ADMIN_ID=${chatId} in .env to enable security.`);
            }
            
            return ctx.reply(
                '👋 Добро пожаловать в панель управления CRM!\n\nИспользуйте кнопки ниже для мониторинга системы:',
                Markup.inlineKeyboard([
                    [Markup.button.callback('📊 Статус системы', 'status')],
                    [Markup.button.callback('📝 Просмотр логов', 'logs_menu')],
                    [Markup.button.callback('🔄 Перезагрузка', 'restart_menu')]
                ])
            );
        });

        // Main Menu Action
        this.bot.action('main_menu', async (ctx: Context) => {
            await ctx.editMessageText(
                '👋 Панель управления CRM:\nВыберите действие:',
                Markup.inlineKeyboard([
                    [Markup.button.callback('📊 Статус системы', 'status')],
                    [Markup.button.callback('📝 Просмотр логов', 'logs_menu')],
                    [Markup.button.callback('🔄 Перезагрузка', 'restart_menu')]
                ])
            );
        });

        // Status Action
        this.bot.action('status', async (ctx: Context) => {
            try {
                await ctx.editMessageText('🔄 Получаю статус контейнеров...');
                const containers = await this.docker!.listContainers({ all: true });
                
                let message = '📊 *Статус контейнеров:*\n\n';
                containers.forEach((c: any) => {
                    const statusIcon = c.State === 'running' ? '✅' : '❌';
                    const name = c.Names[0].replace('/', '');
                    message += `${statusIcon} *${name}*: ${c.Status}\n`;
                });

                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'main_menu')]])
                });
            } catch (error) {
                console.error('Bot Status Error:', error);
                await ctx.editMessageText('❌ Ошибка при получении статуса Docker. Проверьте доступ к /var/run/docker.sock');
            }
        });

        // Logs Menu
        this.bot.action('logs_menu', async (ctx: Context) => {
            await ctx.editMessageText(
                '📝 Выберите сервис для просмотра логов:',
                Markup.inlineKeyboard([
                    [Markup.button.callback('Бэкенд (Backend)', 'logs_backend')],
                    [Markup.button.callback('Фронтенд (Frontend)', 'logs_frontend')],
                    [Markup.button.callback('⬅️ Назад', 'main_menu')]
                ])
            );
        });

        // Specific Logs Action
        const handleLogs = async (ctx: Context, service: string) => {
            try {
                await (ctx as any).answerCbQuery(`Загружаю логи ${service}...`);
                const containers = await this.docker!.listContainers({ all: true });
                const containerInfo = containers.find((c: any) => c.Names[0].includes(service));

                if (!containerInfo) return ctx.reply(`❌ Контейнер ${service} не найден.`);

                const container = this.docker!.getContainer(containerInfo.Id);
                const logs = await container.logs({
                    stdout: true,
                    stderr: true,
                    tail: 30, // Get last 30 lines
                    timestamps: false
                });

                // Docker logs are multiplexed, we need to strip headers
                const cleanLogs = logs.toString('utf8').replace(/[\x00-\x1F\x7F-\x9F]/g, "").substring(0, 3000);

                await ctx.editMessageText(
                    `📝 *Последние логи ${service}:*\n\`\`\`\n${cleanLogs || 'Логи пусты'}\n\`\`\``,
                    {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад к логам', 'logs_menu')]])
                    }
                );
            } catch (error) {
                const err = error as Error;
                console.error('Bot Logs Error:', err);
                await ctx.editMessageText(`❌ Не удалось получить логи: ${err.message}`);
            }
        };

        this.bot.action('logs_backend', (ctx: Context) => handleLogs(ctx, 'backend'));
        this.bot.action('logs_frontend', (ctx: Context) => handleLogs(ctx, 'frontend'));

        // Restart Menu
        this.bot.action('restart_menu', async (ctx: Context) => {
            await ctx.editMessageText(
                '⚠️ *ВНИМАНИЕ!* Выберите сервис для ПЕРЕЗАГРУЗКИ:',
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔄 Перезагрузить Бэкенд', 'confirm_restart_backend')],
                        [Markup.button.callback('🔄 Перезагрузить Фронтенд', 'confirm_restart_frontend')],
                        [Markup.button.callback('⬅️ Назад', 'main_menu')]
                    ])
                }
            );
        });

        // Confirmation and Restart Logic
        this.bot.action(/confirm_restart_(.+)/, async (ctx: Context) => {
            const service = (ctx as any).match[1];
            await ctx.editMessageText(
                `❓ Вы уверены, что хотите перезагрузить *${service}*?`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('✅ ДА, ПЕРЕЗАГРУЗИТЬ', `do_restart_${service}`)],
                        [Markup.button.callback('❌ ОТМЕНА', 'restart_menu')]
                    ])
                }
            );
        });

        this.bot.action(/do_restart_(.+)/, async (ctx: Context) => {
            const service = (ctx as any).match[1];
            try {
                await ctx.editMessageText(`⏳ Перезапуск ${service}... Пожалуйста, подождите.`);
                const containers = await this.docker!.listContainers({ all: true });
                const containerInfo = containers.find((c: any) => c.Names[0].includes(service));

                if (!containerInfo) throw new Error('Контейнер не найден');

                const container = this.docker!.getContainer(containerInfo.Id);
                await container.restart();

                await ctx.editMessageText(`✅ Сервис *${service}* успешно перезапущен!`, {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ В меню', 'main_menu')]])
                });
            } catch (error) {
                const err = error as Error;
                console.error('Bot Restart Error:', err);
                await ctx.editMessageText(`❌ Ошибка перезапуска: ${err.message}`, {
                    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'restart_menu')]])
                });
            }
        });
    }

    public async launch() {
        if (!this.bot) return;
        try {
            // Manually fetch bot info to ensure it's available and token is valid
            const botInfo = await this.bot.telegram.getMe();
            console.log(`🤖 Bot @${botInfo.username} (ID: ${botInfo.id}) verified`);

            // Launch in background — bot.launch() is a blocking long-polling call
            // that never returns, so we must NOT await it
            this.bot.launch().catch((error: Error) => {
                console.error('❌ Telegram Bot polling error:', error.message);
            });
            console.log('🚀 Telegram Bot launched and polling...');
        } catch (error) {
            console.error('❌ Failed to launch Telegram Bot:', error instanceof Error ? error.message : error);
            // Don't let bot failure crash the whole server
        }
    }

    public async notifyError(error: Error | any, context?: string) {
        if (!this.bot || !this.adminChatId) return;

        try {
            const message = `🚨 *КРИТИЧЕСКАЯ ОШИБКА*\n\n` +
                `*Контекст:* ${context || 'Бэкенд'}\n` +
                `*Сообщение:* ${error.message || error}\n` +
                `*Время:* ${new Date().toLocaleString()}\n\n` +
                `📧 Проверьте логи для деталей.`;

            await this.bot.telegram.sendMessage(this.adminChatId, message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('📝 Посмотреть логи', 'logs_backend')]])
            });
        } catch (err) {
            // Silently fail to avoid loop if TG is down
        }
    }

    public async notifyInfo(msg: string) {
        if (!this.bot || !this.adminChatId) return;
        try {
            await this.bot.telegram.sendMessage(this.adminChatId, `ℹ️ ${msg}`, { parse_mode: 'Markdown' });
        } catch (err) {
            console.error('Failed to send info notification to TG:', err instanceof Error ? err.message : err);
        }
    }
}

export const telegramBotService = new TelegramBotService();
