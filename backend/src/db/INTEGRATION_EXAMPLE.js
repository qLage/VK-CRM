/**
 * Integration Example: Add Performance Monitoring to Express App
 *
 * Add this to your main app.js or server.js file
 */

// ============================================================================
// 1. Import the materialized view refresh service
// ============================================================================
const materializedViewRefreshService = require('./services/materializedViewRefresh');

// ============================================================================
// 2. Add performance monitoring routes (admin only)
// ============================================================================
const performanceRoutes = require('./routes/admin/performance');
app.use('/api/admin/performance', performanceRoutes);

// ============================================================================
// 3. Start automatic materialized view refresh schedule
// ============================================================================
// Refresh every hour (cron format: minute hour day month weekday)
materializedViewRefreshService.startSchedule('0 * * * *');

// Or refresh every 30 minutes for more up-to-date data:
// materializedViewRefreshService.startSchedule('*/30 * * * *');

console.log('✅ Materialized view refresh scheduled');

// ============================================================================
// 4. Trigger refresh after deal updates (optional)
// ============================================================================
// In your deal creation/update endpoints, add:
/*
const DealTableRow = require('./models/DealTableRow');
const materializedViewRefreshService = require('./services/materializedViewRefresh');

router.post('/deal-table', async (req, res) => {
    try {
        const deal = await DealTableRow.create(req.body);

        // Trigger refresh (debounced - won't spam the database)
        materializedViewRefreshService.refreshAfterDealUpdate();

        res.json(deal);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
*/

// ============================================================================
// 5. Graceful shutdown - stop cron jobs
// ============================================================================
process.on('SIGTERM', () => {
    console.log('SIGTERM received, stopping materialized view refresh...');
    materializedViewRefreshService.stopSchedule();
    // ... other cleanup
});

process.on('SIGINT', () => {
    console.log('SIGINT received, stopping materialized view refresh...');
    materializedViewRefreshService.stopSchedule();
    // ... other cleanup
});

// ============================================================================
// 6. Health check endpoint (optional)
// ============================================================================
app.get('/api/health/database', async (req, res) => {
    try {
        const { query } = require('./db');

        // Test database connection
        await query('SELECT 1');

        // Get materialized view stats
        const mvStats = materializedViewRefreshService.getStats();
        const freshness = await materializedViewRefreshService.getViewFreshness();

        res.json({
            status: 'healthy',
            database: 'connected',
            materializedViews: {
                lastRefresh: mvStats.lastRefresh,
                successRate: mvStats.successRate,
                freshness: freshness
            }
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

// ============================================================================
// 7. Example: Use optimized employee stats in routes
// ============================================================================
/*
const { getSingleEmployeeStats } = require('./services/employeeStatsOptimized');

router.get('/employees/:id/stats', authenticateToken, async (req, res) => {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        const stats = await getSingleEmployeeStats(req.params.id, year, month);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
*/

// ============================================================================
// Complete Example: Full Integration
// ============================================================================

/*
// app.js or server.js

const express = require('express');
const app = express();

// ... other middleware ...

// Import services
const materializedViewRefreshService = require('./services/materializedViewRefresh');

// Add routes
const performanceRoutes = require('./routes/admin/performance');
app.use('/api/admin/performance', performanceRoutes);

// Start materialized view refresh schedule
if (process.env.NODE_ENV === 'production') {
    // In production, refresh every hour
    materializedViewRefreshService.startSchedule('0 * * * *');
} else {
    // In development, refresh every 15 minutes for testing
    materializedViewRefreshService.startSchedule('*\/15 * * * *');
}

// Health check
app.get('/api/health/database', async (req, res) => {
    try {
        const { query } = require('./db');
        await query('SELECT 1');

        const mvStats = materializedViewRefreshService.getStats();

        res.json({
            status: 'healthy',
            database: 'connected',
            materializedViews: mvStats
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

// Graceful shutdown
const gracefulShutdown = () => {
    console.log('Shutting down gracefully...');
    materializedViewRefreshService.stopSchedule();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('✅ Materialized view refresh scheduled');
});
*/
