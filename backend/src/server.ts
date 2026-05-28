import path from 'path';
import dotenv from 'dotenv';
// __dirname in bundled output points to dist/, so we need to go up one more level
dotenv.config({ path: path.join(__dirname, '../../.env') });

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import compression from 'compression';
import morgan from 'morgan';
import { Server } from 'http';

// Middleware imports
import { generalLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Route imports
import kpiRoutes from './routes/kpi.routes';
import cacheRoutes from './routes/cache.routes';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import employeesRoutes from './routes/employees';
import financesRoutes from './routes/finances';
import reportsRoutes from './routes/reports';
import attendanceRoutes from './routes/attendance';
import positionsRoutes from './routes/positions';
import notificationsRoutes from './routes/notifications';
import pushRoutes from './routes/push';
import recurringExpensesRoutes from './routes/recurring-expenses';
import integrationsRoutes from './routes/integrations';
import plansRoutes from './routes/plans';
import templatesRoutes from './routes/templates';
import branchesRoutes from './routes/branches';
import teamsRoutes from './routes/teams';
import buildingsRoutes from './routes/buildings';
import settingsRoutes from './routes/settings';
import serviceRequestsRoutes from './routes/service_requests';
import propertiesRoutes from './routes/properties';
import avitoRoutes from './routes/avito';
import calendarRoutes from './routes/calendar';
import profilesRoutes from './routes/profiles';
import permissionsRoutes from './routes/permissions';
import seedRoutes from './routes/seed';
import diagnosticRoutes from './routes/diagnostic';
import dealsRoutes from './routes/deals';
import participantsRoutes from './routes/participants';
import commissionsRoutes from './routes/commissions';
import commissionRulesRoutes from './routes/commissionRules';
import kpiSettingsRoutes from './routes/kpi-settings';
import documentsRoutes from './routes/documents';
import paymentsRoutes from './routes/payments';
import activitiesRoutes from './routes/activities';
import dealTableRoutes from './routes/deal-table';
import auditRoutes from './routes/audit';
import mortgageServicesRoutes from './routes/mortgage-services';
import clientsRoutes from './routes/clients';
import leadsRoutes from './routes/leads';
import sessionsRoutes from './routes/sessions';

import runMigrations from './db/consolidated_migrations';
import { query as dbQuery, runInitialMigrations } from './db/legacy';

// Realtime services
import redisService from './services/redis.service';
import websocketService from './services/websocket.service';
import { startWorker } from './services/queue.service';
import pushService from './services/push.service';
import { startAllCronJobs } from './services/cronJobs';
import { startMaterializedViewRefreshJob, stopMaterializedViewRefreshJob } from './jobs/refresh-materialized-views.job';
import { startCacheWarmingJob, stopCacheWarmingJob } from './jobs/cache-warming.job';
import { telegramBotService } from './services/telegramBot.service';

const PORT = parseInt(process.env.PORT || '5000', 10);

// Verify database connection
async function verifyDatabaseConnection(): Promise<void> {
    console.log('🔍 Verifying database connection...');

    try {
        const result = await dbQuery('SELECT 1 as connected');
        if (result.rows[0]?.connected === 1 || result.rows[0]?.connected === '1') {
            console.log('✅ Database connection verified');
        } else {
            throw new Error('Database connection test failed');
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Database connection failed:', message);
        throw error;
    }
}

// Initialize server
async function startServer(): Promise<void> {
    try {
        console.log('🚀 Starting CRM Backend Server...');
        console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);

        // Step 1: Initialize Database [BLOCKING FOR CRITICAL PARTS]
        console.log('🔍 Initializing database...');
        try {
            // Verify connection
            await verifyDatabaseConnection();
            
            // Run migrations
            console.log('📦 Running database migrations...');
            await runInitialMigrations();
            await runMigrations();
            console.log('✅ Database initialization completed');
        } catch (error) {
            console.error('❌ Database initialization failed:', error instanceof Error ? error.message : 'Unknown error');
            // We should probably NOT exit if it's just a transient error, 
            // but for production migrations failure is usually fatal.
            if (process.env.NODE_ENV === 'production') {
                console.error('CRITICAL: Migrations failed in production. Exiting.');
                process.exit(1);
            }
        }

        // Step 3: Create Express app
        const app: Application = express();

        // Trust proxy - required for Render.com and rate limiting
        app.set('trust proxy', 1);

        // Health check endpoints - BEFORE CORS to allow Docker health checks without Origin header
        app.get('/health', (_req: Request, res: Response) => {
            res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
        });

        app.get('/api/health', (_req: Request, res: Response) => {
            res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
        });

        // Middleware
        console.log('⚙️  Configuring middleware...');

        app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    connectSrc: [
                        "'self'", 
                        "https://vk-crm-ykgc.onrender.com", 
                        ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
                        ...(process.env.NODE_ENV === 'development' ? ["http://localhost:5000", "http://127.0.0.1:5000", "ws://127.0.0.1:5000"] : [])
                    ],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:", "blob:", "https://*.onrender.com"],
                    fontSrc: ["'self'", "data:"],
                    objectSrc: ["'none'"],
                    upgradeInsecureRequests: null,
                },
            },
            crossOriginResourcePolicy: { policy: "cross-origin" }
        }));

        // CORS Configuration
        const allowedOrigins: (string | RegExp)[] = [
            process.env.FRONTEND_URL,
            'https://vk-crm-ykgc.onrender.com'
        ].filter(Boolean) as string[];

        if (process.env.NODE_ENV === 'development') {
            allowedOrigins.push(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/);
        }

        app.use(cors({
            origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
                if (!origin) {
                    // Allow requests with no origin (like mobile apps or local requests)
                    return callback(null, true);
                }

                const isAllowed = allowedOrigins.some(allowed => {
                    if (allowed instanceof RegExp) {
                        return allowed.test(origin);
                    }
                    return allowed === origin;
                });

                if (isAllowed) {
                    callback(null, true);
                } else {
                    console.warn(`CORS blocked origin: ${origin}`);
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma', 'Expires'],
            maxAge: 86400
        }));

        app.use(compression({
            // Lower threshold so small JSON responses also get compressed
            threshold: 512,
            // Faster compression (1=fastest, 9=best). Default is 6, way too slow for hot paths.
            level: 4,
            filter: (req: Request, res) => {
                // Disable compression for SSE endpoints — it breaks chunked streaming
                if (req.originalUrl && req.originalUrl.includes('/notifications/stream')) {
                    return false;
                }
                return compression.filter(req, res);
            }
        }));
        app.use(morgan('combined'));
        app.use(express.json({ limit: '50mb' }));
        app.use(express.urlencoded({ extended: true, limit: '50mb' }));

        // Ensure all API responses use UTF-8 charset (fixes Cyrillic garbling)
        app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            next();
        });

        app.use('/api/', generalLimiter);

        // Step 4: Register API Routes
        console.log('🔌 Registering API routes...');

        const routes = [
            { path: '/api/auth', handler: authRoutes, name: 'Auth' },
            { path: '/api/users', handler: usersRoutes, name: 'Users' },
            { path: '/api/employees', handler: employeesRoutes, name: 'Employees' },
            { path: '/api/finances', handler: financesRoutes, name: 'Finances' },
            { path: '/api/reports', handler: reportsRoutes, name: 'Reports' },
            { path: '/api/attendance', handler: attendanceRoutes, name: 'Attendance' },
            { path: '/api/positions', handler: positionsRoutes, name: 'Positions' },
            { path: '/api/notifications', handler: notificationsRoutes, name: 'Notifications' },
            { path: '/api/push', handler: pushRoutes, name: 'Push' },
            { path: '/api/recurring-expenses', handler: recurringExpensesRoutes, name: 'Recurring Expenses' },
            { path: '/api/integrations', handler: integrationsRoutes, name: 'Integrations' },
            { path: '/api/plans', handler: plansRoutes, name: 'Plans' },
            { path: '/api/templates', handler: templatesRoutes, name: 'Templates' },
            { path: '/api/kpi', handler: kpiRoutes, name: 'KPI' },
            { path: '/api/kpi-settings', handler: kpiSettingsRoutes, name: 'KPI Settings' },
            { path: '/api/cache', handler: cacheRoutes, name: 'Cache' },
            { path: '/api/branches', handler: branchesRoutes, name: 'Branches' },
            { path: '/api/teams', handler: teamsRoutes, name: 'Teams' },
            { path: '/api/buildings', handler: buildingsRoutes, name: 'Buildings' },
            { path: '/api/settings', handler: settingsRoutes, name: 'Settings' },
            { path: '/api/service-requests', handler: serviceRequestsRoutes, name: 'Service Requests' },
            { path: '/api/properties', handler: propertiesRoutes, name: 'Properties' },
            { path: '/api/avito', handler: avitoRoutes, name: 'Avito' },
            { path: '/api/calendar', handler: calendarRoutes, name: 'Calendar' },
            { path: '/api/profiles', handler: profilesRoutes, name: 'Profiles' },
            { path: '/api/permissions', handler: permissionsRoutes, name: 'Permissions' },
            { path: '/api/seed', handler: seedRoutes, name: 'Seed' },
            { path: '/api/diagnostic', handler: diagnosticRoutes, name: 'Diagnostic' },
            { path: '/api/deals', handler: dealsRoutes, name: 'Deals' },
            { path: '/api/participants', handler: participantsRoutes, name: 'Participants' },
            { path: '/api/commissions', handler: commissionsRoutes, name: 'Commissions' },
            { path: '/api/commission-rules', handler: commissionRulesRoutes, name: 'Commission Rules' },
            { path: '/api/documents', handler: documentsRoutes, name: 'Documents' },
            { path: '/api/payments', handler: paymentsRoutes, name: 'Payments' },
            { path: '/api/activities', handler: activitiesRoutes, name: 'Activities' },
            { path: '/api/deal-table', handler: dealTableRoutes, name: 'Deal Table' },
            { path: '/api/audit', handler: auditRoutes, name: 'Audit' },
            { path: '/api/mortgage-services', handler: mortgageServicesRoutes, name: 'Mortgage Services' },
            { path: '/api/clients', handler: clientsRoutes, name: 'Clients' },
            { path: '/api/leads', handler: leadsRoutes, name: 'Leads' },
            { path: '/api/sessions', handler: sessionsRoutes, name: 'Sessions' },

        ];

        routes.forEach(route => {
            app.use(route.path, route.handler);
            console.log(`  ✓ ${route.name.padEnd(20)} → ${route.path}`);
        });

        console.log('✅ API routes registered successfully');
        console.log(`📋 Total routes registered: ${routes.length}`);

        // Serve Static Files
        const storageDir = path.join(__dirname, '../storage');
        const uploadsBase = path.join(storageDir, 'uploads');
        if (!fs.existsSync(uploadsBase)) fs.mkdirSync(uploadsBase, { recursive: true });

        console.log('Serving uploads from:', uploadsBase);
        app.use('/uploads', express.static(uploadsBase));

        if (process.env.NODE_ENV === 'production') {
            const distPath = path.join(__dirname, '../../dist');

            app.use('/assets', express.static(path.join(distPath, 'assets'), {
                maxAge: '1y',
                immutable: true,
                index: false,
                setHeaders: (res, filePath) => {
                    if (filePath.endsWith('.css')) {
                        res.setHeader('Content-Type', 'text/css; charset=UTF-8');
                    }
                    if (filePath.endsWith('.js')) {
                        res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
                    }
                }
            }));

            app.use(express.static(distPath, {
                maxAge: 0,
                setHeaders: (res, filePath) => {
                    if (filePath.includes(path.sep + 'assets' + path.sep)) {
                        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                    } else {
                        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                        res.setHeader('Pragma', 'no-cache');
                        res.setHeader('Expires', '0');
                    }
                }
            }));

            app.get('*', (req: Request, res: Response, next: NextFunction): void => {
                if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path.startsWith('/assets/')) {
                    next();
                    return;
                }
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                res.setHeader('Content-Type', 'text/html; charset=UTF-8');
                res.sendFile(path.join(distPath, 'index.html'));
            });
        } else {
            app.get('*', (req: Request, res: Response, next: NextFunction): void => {
                if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path.startsWith('/assets/')) {
                    next();
                    return;
                }
                res.status(200).json({
                    message: 'Backend API server running in development mode',
                    frontend: process.env.FRONTEND_URL || 'http://localhost:8080',
                    api: `http://localhost:${PORT}/api`,
                    health: `http://localhost:${PORT}/health`
                });
            });
        }

        app.get('/api/debug/files', (_req: Request, res: Response): void => {
            const storageDir = path.join(__dirname, '../storage/uploads/avatars');
            if (!fs.existsSync(storageDir)) {
                res.json({ error: 'Folder not found', path: storageDir });
                return;
            }
            const files = fs.readdirSync(storageDir);
            res.json({ files, path: storageDir });
        });

        app.use(errorHandler);
        app.use('/api/*', notFoundHandler);

        // Step 5: Start HTTP server
        const server: Server = app.listen(PORT, async () => {
            console.log(`🚀 Server running on port ${PORT}`);

            await redisService.connect();
            websocketService.initialize(server);

            console.log('⚡ Realtime services initialized');

            if (process.env.RUN_WORKERS !== 'false') {
                startWorker();
                pushService.startPushWorker();
            }

            startAllCronJobs();

            if (process.env.ENABLE_BACKGROUND_JOBS !== 'false') {
                startMaterializedViewRefreshJob();
                console.log('📊 Materialized view refresh job started');

                startCacheWarmingJob();
                console.log('🔥 Cache warming job started');
            } else {
                console.log('⚠️  Background jobs disabled (ENABLE_BACKGROUND_JOBS=false)');
            }

            await telegramBotService.launch();
            await telegramBotService.notifyInfo('🚀 *Backend CRM запущен успешно!*');
            console.log('✅ Server initialization complete');
        });

        process.on('SIGTERM', async () => {
            console.log('SIGTERM received, shutting down gracefully...');
            stopMaterializedViewRefreshJob();
            stopCacheWarmingJob();
            await redisService.disconnect();
            server.close(() => {
                console.log('Server closed');
                process.exit(0);
            });
        });

        process.on('SIGINT', async () => {
            console.log('SIGINT received, shutting down gracefully...');
            stopMaterializedViewRefreshJob();
            stopCacheWarmingJob();
            await redisService.disconnect();
            server.close(() => {
                console.log('Server closed');
                process.exit(0);
            });
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Server startup failed:', message);
        console.error(error);
        process.exit(1);
    }
}

process.on('uncaughtException', (error) => {
    console.error('FATAL ERROR: Uncaught Exception');
    console.error(error.stack || error);
    fs.appendFileSync('fatal_error.log', `[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${error.stack || error}\n`);
    telegramBotService.notifyError(error, 'FATAL: Uncaught Exception').catch(console.error);
    // Consider whether to exit or continue. Usually it's better to restart.
    // process.exit(1); 
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('FATAL ERROR: Unhandled Rejection at:', promise, 'reason:', reason);
    fs.appendFileSync('fatal_error.log', `[${new Date().toISOString()}] UNHANDLED REJECTION: ${reason}\n`);
    telegramBotService.notifyError(new Error(String(reason)), 'FATAL: Unhandled Rejection').catch(console.error);
});

startServer().catch((error) => {
    console.error('Fatal error during server startup:', error);
    process.exit(1);
});

export default express();
