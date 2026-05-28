const { query, pool } = require('../db');

/**
 * Get the latest period that has actual deal data
 * Falls back to current month if no deals exist
 */
async function getLatestPeriodWithData() {
    try {
        const result = await query(`
            SELECT year, month
            FROM (
                SELECT year, month FROM deal_table_rows
                UNION ALL
                SELECT year, month FROM mortgage_service_rows
            ) u
            WHERE year IS NOT NULL AND month IS NOT NULL
              AND year >= 2000 AND year <= 2100
              AND month >= 1 AND month <= 12
            ORDER BY year DESC, month DESC
            LIMIT 1
        `);

        if (result.rows.length > 0) {
            const { year, month } = result.rows[0];
            return `${year}-${String(month).padStart(2, '0')}`;
        }

        // Fallback to current month if no deals
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    } catch (err) {
        console.error('Error getting latest period:', err);
        // Fallback to current month
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
}

/**
 * Get start and end dates for a period
 */
function getPeriodDates(periodString) {
    const [year, month] = periodString.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    return {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        year,
        month
    };
}

module.exports = {
    getLatestPeriodWithData,
    getPeriodDates
};
