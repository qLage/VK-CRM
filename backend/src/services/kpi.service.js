// Use ES module import syntax for tsx compatibility
// Note: tsx resolves .ts files automatically - don't include extensions for TypeScript modules
import { pool, query, db } from '../db';
// Removed legacy cache import for unification
import KpiCalculatorFactory from './kpi/KpiCalculatorFactory';
import aggregationServiceModule from './aggregation.service';
import cacheServiceModule from '../lib/cache.service';
import { parseNumeric } from '../lib/formatting.utils';
import { sumManualGross } from '../lib/employeeManualFinance';


// Feature flags
// Off by default: restores pre–KPI-refactor behavior unless explicitly enabled (USE_NEW_KPI_SERVICE=true).
const USE_NEW_KPI_SERVICE = process.env.USE_NEW_KPI_SERVICE === 'true';
const USE_MATERIALIZED_VIEWS = process.env.USE_MATERIALIZED_VIEWS !== 'false';

// Services
const aggregationService = aggregationServiceModule || null;
const cacheService = cacheServiceModule || null;

class KpiService {
    constructor() {
        this.calculatorFactory = new KpiCalculatorFactory(this);
    }

    _ensureMetrics(result, role) {
        // v9: Corrected dual kpi salary scaling aggregation
        if (!result) result = {};
        if (!result.metrics) {
            result.metrics = {
                totalRevenue: result.totalRevenue || 0,
                estimatedIncome: result.estimatedIncome || 0,
                currentPercent: result.currentPercent || 0,
                nextThreshold: result.nextThreshold || null,
                planCompletion: result.planCompletion || 0,
                totalDeposits: result.totalDeposits || 0,
                totalObjects: result.totalObjects || 0,
                baseSalary: result.baseSalary || 0
            };
        }
        if (!result.role) result.role = role;
        return result;
    }
    async getRules(role) {
        if (pool) {
            const res = await query('SELECT * FROM kpi_rules WHERE role = $1', [role || null]);
            return res.rows;
        }
        return db.prepare('SELECT * FROM kpi_rules WHERE role = ?').all(role);
    }
    
    async getRatingConfig() {
        try {
            const res = await query('SELECT value FROM system_settings WHERE key = $1', ['rating_config']);
            if (res.rows.length > 0) {
                return JSON.parse(res.rows[0].value);
            }
        } catch (e) {
            console.error('Error fetching rating config:', e);
        }
        return null;
    }

    async getGlobalKpiSettings() {
        try {
            const settings = {
                mop: { base_salary: 0, percentages: [] },
                rop: { base_salary: 0, percentages: [] }
            };

            // Removed MAX() to allow salary to decrease.
            // We'll fetch all matching positions and pick the best one in JS.
            // Priority: Technical IDs 'pos-mop'/'pos-rop' > exact name matches > partial matches
            const salarySql = `
                SELECT id, name, base_salary 
                FROM positions 
                WHERE lower(name) LIKE '%моп%' OR lower(name) LIKE '%роп%' OR id IN ('pos-mop', 'pos-rop')
            `;

            const salaryResult = await query(salarySql, []);
            
            for (const row of salaryResult.rows) {
                const name = row.name.toLowerCase();
                const salary = Number(row.base_salary || 0);
                const id = row.id;
                
                if (salary <= 0) continue;

                if (id === 'pos-mop' || name.includes('моп')) {
                    // pos-mop is the highest priority
                    if (id === 'pos-mop' || name === 'менеджер моп' || !settings.mop.base_salary) {
                        settings.mop.base_salary = salary;
                    }
                } 
                
                if (id === 'pos-rop' || name.includes('роп')) {
                    // pos-rop is the highest priority
                    if (id === 'pos-rop' || name === 'руководитель роп' || !settings.rop.base_salary) {
                        settings.rop.base_salary = salary;
                    }
                }
            }

            console.log(`[KPI Settings Sync] MOP: ${settings.mop.base_salary}, ROP: ${settings.rop.base_salary}, Time: ${new Date().toLocaleTimeString()}`);

            return settings;
        } catch (e) {
            console.error('Error in getGlobalKpiSettings:', e);
            return { mop: { base_salary: 40000 }, rop: { base_salary: 80000 } };
        }
    }

    _calculateRatingFromConfig(metrics, config, isQuarter) {
        if (!config || !config.metrics || config.metrics.length === 0) return null;
        
        let totalCompletion = 0;
        let metricsCount = 0;
        
        config.metrics.forEach(m => {
            let fact = 0;
            const key = m.key;
            
            // Map config keys (target_*) to internal metric keys
            if (key === 'target_revenue' || key === 'revenue') fact = metrics.totalRevenue || 0;
            else if (key === 'target_deposits' || key === 'deposits') fact = metrics.totalDeposits || 0;
            else if (key === 'target_objects' || key === 'objects') fact = metrics.totalObjects || 0;
            else if (key === 'target_deals' || key === 'dealsCount' || key === 'totalDeals') fact = metrics.dealsCount || metrics.totalDeals || 0;
            else if (key === 'target_meetings' || key === 'meetings') fact = metrics.meetings || 0;
            else if (key === 'target_showings' || key === 'showings') fact = metrics.showings || 0;
            else if (key === 'target_calls' || key === 'calls') fact = metrics.calls || 0;
            else return; // Skip unknown metrics
            
            let target = parseFloat(m.value) || 1;
            // Config targets are quarterly. If calculating for a month, divide by 3.
            if (!isQuarter) {
                target = target / 3;
            }
            
            if (target > 0) {
                totalCompletion += (fact / target) * 100;
                metricsCount++;
            }
        });
        
        if (metricsCount === 0) return null;
        const avgCompletion = totalCompletion / metricsCount;
        return parseFloat(Math.min((avgCompletion / 100) * 5, 5).toFixed(2));
    }

    async calculateRealtorKPI(userId, startDate, endDate, period = 'month', role = 'realtor') {
        // Get refresh timestamp for cache key generation (Plan 02-04)
        const refreshTime = aggregationService ? await aggregationService.getLastRefreshTime() : null;

        // Generate cache key
        let cacheKey;
        if (cacheService) {
            const cacheParams = {
                userId,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                period,
                cacheVersion: 'v18'
            };
            
            if (refreshTime) {
                cacheParams.refreshTime = refreshTime.toISOString();
            }
            
            cacheKey = cacheService.generateKey('kpi:realtor', cacheParams);
        } else {
            return { role: 'realtor', metrics: { totalRevenue: 0 } };
        }

        // Check cache (using unified cacheService)
        const cached = await cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

        // Try materialized views first (Plan 02-03)
        if (USE_MATERIALIZED_VIEWS && aggregationService && period === 'month') {
            const startDateObj = new Date(startDate);
            const year = startDateObj.getFullYear();
            const month = startDateObj.getMonth() + 1;

            const startTime = Date.now();
            const stats = await aggregationService.getEmployeeStats(userId, year, month);

            if (stats) {
                // Use calculator for full KPI calculation with view data
                // Hybrid approach: fast aggregation from views + full logic from calculator
            }
        }

        // Optional new decimal calculator (USE_NEW_KPI_SERVICE=true on server)
        if (USE_NEW_KPI_SERVICE) {
            try {
                const calculators = this.calculatorFactory.getCalculators('realtor');
                const calculator = calculators[0];
                let result = await calculator.calculate(userId, startDate, endDate, period);
                const ensuredResult = this._ensureMetrics(result, 'realtor');

                if (cacheService) {
                    await cacheService.set(cacheKey, ensuredResult, 300);
                }

                return ensuredResult;
            } catch (error) {
                console.error(`[KPI Service] Error calculating Realtor KPI for ${userId}:`, error);
                return this._ensureMetrics(null, 'realtor');
            }
        }

        // Legacy calculation logic below
        const isQuarter = period === 'quarter';

        // Get Actions from service_requests
        const actions = await this.getUserActions(userId, startDate, endDate);

        // Get objects from daily reports (type='daily', status='approved')
        let objectsFromReports = 0;
        const reportsSql = pool
            ? `SELECT content FROM reports WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3 AND type = 'daily' AND status = 'approved'`
            : `SELECT content FROM reports WHERE user_id = ? AND created_at >= ? AND created_at <= ? AND type = 'daily' AND status = 'approved'`;

        if (pool) {
            const reportsRes = await query(reportsSql, [userId, startDate, endDate]);
            reportsRes.rows.forEach(row => {
                if (row.content) {
                    const content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
                    // Look for object-related fields in content
                    if (content['Набор базы'] || content['Объекты'] || content['objects']) {
                        objectsFromReports += parseInt(content['Набор базы'] || content['Объекты'] || content['objects']) || 0;
                    }
                }
            });
        } else {
            const reportsRows = db.prepare(reportsSql).all(userId, startDate, endDate);
            reportsRows.forEach(row => {
                if (row.content) {
                    const content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
                    if (content['Набор базы'] || content['Объекты'] || content['objects']) {
                        objectsFromReports += parseInt(content['Набор базы'] || content['Объекты'] || content['objects']) || 0;
                    }
                }
            });
        }

        // Calculate totals for 3 metrics: deposits, objects, revenue
        const totalDeposits = (actions.deposits || 0);
        const totalObjects = (actions.takes || 0) + objectsFromReports;

        // Get revenue from deal_table_rows
        let totalRevenue = 0;

        // Extract year and month from date range
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        const startYear = startDateObj.getFullYear();
        const startMonth = startDateObj.getMonth() + 1;
        const endYear = endDateObj.getFullYear();
        const endMonth = endDateObj.getMonth() + 1;

        // Build year/month filter (numeric: YYYYMM)
        const startVal = startYear * 100 + startMonth;
        const endVal = endYear * 100 + endMonth;
        const yearMonthFilter = `(dtr.year * 100 + dtr.month) BETWEEN ${startVal} AND ${endVal}`;
        

        // Get realtor name for fallback name matching
        let fullName;
        if (pool) {
            const res = await query('SELECT full_name FROM profiles WHERE id = $1', [userId]);
            fullName = res.rows[0]?.full_name;
        } else {
            const res = db.prepare('SELECT full_name FROM profiles WHERE id = ?').get(userId);
            fullName = res?.full_name;
        }

        // Shared logic for revenue calculation to ensure consistency
        const revenueData = await this.getRevenueForUser(userId, startDate, endDate, role);
        totalRevenue = revenueData.revenue;
        let mopRevenue = 0;
        let ropPayout = 0;
        let mortgageDeduction = 0;
        let otherExpenses = 0;

        mopRevenue = revenueData.mop_revenue;
        ropPayout = revenueData.rop_payout;
        mortgageDeduction = revenueData.mortgage_deduction;
        otherExpenses = revenueData.other_expenses;

        // Fetch Plan Targets
        const now = new Date(startDate);
        let planDeposits = 0, planObjects = 0, planRevenue = 0, planDeals = 0;

        if (isQuarter) {
            const year = now.getFullYear();
            const quarter = Math.floor(now.getMonth() / 3) + 1;
            const m1 = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}`;
            const m2 = `${year}-${String((quarter - 1) * 3 + 2).padStart(2, '0')}`;
            const m3 = `${year}-${String((quarter - 1) * 3 + 3).padStart(2, '0')}`;

            console.log('[calculateRealtorKPI] Fetching quarter plan for months:', { m1, m2, m3, userId });
            const mPlanSql = pool
                ? `SELECT SUM(target_deposits) as deposits, SUM(target_objects) as objects, SUM(target_revenue) as revenue, COALESCE(SUM(target_deals), 0) as deals FROM user_plans WHERE user_id = $1 AND period_month IN ($2, $3, $4)`
                : `SELECT SUM(target_deposits) as deposits, SUM(target_objects) as objects, SUM(target_revenue) as revenue, COALESCE(SUM(target_deals), 0) as deals FROM user_plans WHERE user_id = ? AND period_month IN (?, ?, ?)`;
            const mRes = pool ? await pool.query(mPlanSql, [userId, m1, m2, m3]) : { rows: [db.prepare(mPlanSql).get(userId, m1, m2, m3)] };
            console.log('[calculateRealtorKPI] Quarter plan result:', mRes.rows[0]);
            planDeposits = parseInt(mRes.rows[0]?.deposits) || 0;
            planObjects = parseInt(mRes.rows[0]?.objects) || 0;
            planRevenue = parseFloat(mRes.rows[0]?.revenue) || 0;
            planDeals = parseInt(mRes.rows[0]?.deals) || 0;
        } else {
            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            console.log('[calculateRealtorKPI] Fetching month plan for:', { month, userId });
            const mPlanSql = pool ? 'SELECT target_deposits, target_objects, target_revenue, COALESCE(target_deals, 0) as target_deals FROM user_plans WHERE user_id = $1 AND period_month = $2' : 'SELECT target_deposits, target_objects, target_revenue, COALESCE(target_deals, 0) as target_deals FROM user_plans WHERE user_id = ? AND period_month = ?';
            const mRes = pool ? await pool.query(mPlanSql, [userId, month]) : { rows: [db.prepare(mPlanSql).get(userId, month)] };
            console.log('[calculateRealtorKPI] Month plan result:', mRes.rows[0]);
            planDeposits = parseInt(mRes.rows[0]?.target_deposits) || 0;
            planObjects = parseInt(mRes.rows[0]?.target_objects) || 0;
            planRevenue = parseFloat(mRes.rows[0]?.target_revenue) || 0;
            planDeals = parseInt(mRes.rows[0]?.target_deals) || 0;
        }

        console.log('[calculateRealtorKPI] Plan targets:', { planDeposits, planObjects, planRevenue, planDeals });

        // Calculate plan completion % for 3 metrics only
        const depositsPercent = planDeposits > 0 ? (totalDeposits / planDeposits) * 100 : 0;
        const objectsPercent = planObjects > 0 ? (totalObjects / planObjects) * 100 : 0;
        const revenuePercent = planRevenue > 0 ? (totalRevenue / planRevenue) * 100 : 0;
        const dealsCountFact = revenueData.deal_count || 0;
        const dealsPercent = planDeals > 0 ? (dealsCountFact / planDeals) * 100 : 0;

        // Average plan completion across metrics that have targets
        const metricsWithTargets = [];
        if (planDeposits > 0) metricsWithTargets.push(depositsPercent);
        if (planObjects > 0) metricsWithTargets.push(objectsPercent);
        if (planRevenue > 0) metricsWithTargets.push(revenuePercent);

        const avgCompletion = metricsWithTargets.length > 0
            ? metricsWithTargets.reduce((a, b) => a + b, 0) / metricsWithTargets.length
            : 0;

        // Convert to 0-5 rating scale
        let rating = 0;
        const ratingConfig = await this.getRatingConfig();
        
        // Prepare metrics object for helper
        const calcMetrics = {
            totalRevenue,
            totalDeposits,
            totalObjects,
            meetings: actions.meetings || 0,
            showings: actions.showings || 0,
            dealsCount: dealsCountFact
        };

        const configRating = this._calculateRatingFromConfig(calcMetrics, ratingConfig, isQuarter);
        if (configRating !== null) {
            rating = configRating;
        } else {
            // Fallback to legacy plan-based rating
            rating = Math.min((avgCompletion / 100) * 5, 5);
        }

        // Load realtor KPI tiers from database
        const rulesRes = pool
            ? await pool.query('SELECT min_threshold, percent FROM kpi_rules WHERE role = $1 ORDER BY min_threshold ASC', ['realtor'])
            : { rows: db.prepare('SELECT min_threshold, percent FROM kpi_rules WHERE role = ? ORDER BY min_threshold ASC').all('realtor') };
        const KPI_TIERS = rulesRes.rows.map(r => ({ percent: Number(r.percent), threshold: Number(r.min_threshold) }));
        if (KPI_TIERS.length === 0) {
            // Fallback to defaults if no rules in DB
            KPI_TIERS.push({ percent: 40, threshold: 0 });
        }

        const factor = 1;
        let currentPercent = KPI_TIERS[0].percent;
        let currentTierIndex = 0;

        // Find current tier by revenue
        for (let i = KPI_TIERS.length - 1; i >= 0; i--) {
            if (totalRevenue >= KPI_TIERS[i].threshold * factor) {
                currentTierIndex = i;
                currentPercent = KPI_TIERS[i].percent;
                break;
            }
        }

        const currentThreshold = KPI_TIERS[currentTierIndex].threshold * factor;
        const nextThreshold = currentTierIndex < KPI_TIERS.length - 1 ? KPI_TIERS[currentTierIndex + 1].threshold * factor : null;
        
        let estimatedIncome = revenueData.personal_income;
        if (role === 'mortgage_broker') {
            estimatedIncome += revenueData.mop_revenue;
        }

        const result = {
            role: 'realtor',
            currentPercent,
            currentThreshold,
            nextThreshold,
            estimatedIncome,
            metrics: {
                totalDeposits,
                totalObjects,
                totalRevenue,
                mopRevenue,
                ropPayout,
                mortgageDeduction,
                otherExpenses,
                planDeposits,
                planObjects,
                planRevenue,
                planDeals,
                planCompletion: parseFloat(avgCompletion.toFixed(2)),
                depositsPercent: parseFloat(depositsPercent.toFixed(2)),
                objectsPercent: parseFloat(objectsPercent.toFixed(2)),
                revenuePercent: parseFloat(revenuePercent.toFixed(2)),
                dealsPercent: parseFloat(dealsPercent.toFixed(2)),
                rating: parseFloat(rating.toFixed(2)),
                meetings: actions.meetings || 0,
                showings: actions.showings || 0,
                dealsCount: dealsCountFact,
                currentPercent,
                currentThreshold,
                nextThreshold,
                estimatedIncome
            }
        };

        // Cache for 3 minutes
        if (cacheService) {
            await cacheService.set(cacheKey, result, 180);
        }
        return result;
    }

    async getUserActions(userId, startDate, endDate) {
        const { query } = require('../db');

        const queryStr = `
            SELECT type, COUNT(*) as count
            FROM service_requests
            WHERE user_id = $1
            AND created_at BETWEEN $2 AND $3
            GROUP BY type
        `;

        const result = await query(queryStr, [userId, startDate, endDate]);
        const rows = result.rows;

        const stats = {
            takes: 0,
            meetings: 0,
            showings: 0,
            deposits: 0,
            deals: 0
        };

        rows.forEach(r => {
            if (r.type === 'listing' || r.type === 'take' || r.type === 'object') stats.takes += parseInt(r.count);
            if (r.type === 'meeting' || r.type === 'meeting_office') stats.meetings += parseInt(r.count);
            if (r.type === 'showing') stats.showings += parseInt(r.count);
            if (r.type === 'deposit' || r.type === 'prepayment') stats.deposits += parseInt(r.count);
            if (r.type === 'deal' || r.type === 'sale') stats.deals += parseInt(r.count);
        });

        return stats;
    }

    async calculateTeamKPI(leaderId, startDate, endDate, period = 'month') {
        // Get refresh timestamp for cache key generation (Plan 02-04)
        const refreshTime = aggregationService ? await aggregationService.getLastRefreshTime() : null;

        // Generate cache key
        let cacheKey;
        if (cacheService) {
            const cacheParams = {
                leaderId,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                period,
                cacheVersion: 'v18'
            };
            
            if (refreshTime) {
                cacheParams.refreshTime = refreshTime.toISOString();
            }
            
            cacheKey = cacheService.generateKey('kpi:mop', cacheParams);
        } else {
            return { role: 'sales_manager', metrics: { teamRevenue: 0 } };
        }

        // Check cache (using unified cacheService)
        const cached = await cacheService.get(cacheKey);
        if (cached) {
            console.log('[KPI] Cache HIT for team KPI');
            return cached;
        }

        console.log('[KPI] Cache MISS for team KPI - calculating...');

        // Try materialized views first (Plan 02-03)
        if (USE_MATERIALIZED_VIEWS && aggregationService && period === 'month') {
            const startDateObj = new Date(startDate);
            const year = startDateObj.getFullYear();
            const month = startDateObj.getMonth() + 1;

            // Get team ID for the leader
            let teamId;
            if (pool) {
                const res = await pool.query('SELECT team_id FROM profiles WHERE id = $1', [leaderId]);
                teamId = res.rows[0]?.team_id;
            } else {
                const res = db.prepare('SELECT team_id FROM profiles WHERE id = ?').get(leaderId);
                teamId = res?.team_id;
            }

            if (teamId) {
                const startTime = Date.now();
                const stats = await aggregationService.getTeamStats(teamId, year, month);

                if (stats) {
                    const duration = Date.now() - startTime;
                    console.log(`[KPI] Team stats from materialized view in ${duration}ms`);
                }
            }
        }

        // Use new decimal-based calculator if feature flag is enabled
        if (USE_NEW_KPI_SERVICE) {
            try {
                const calculators = this.calculatorFactory.getCalculators('sales_manager');
                const calculator = calculators[1] || calculators[0]; // Prefer MOP calculator
                let result = await calculator.calculate(leaderId, startDate, endDate, period);
                return this._ensureMetrics(result, 'sales_manager');
            } catch (error) {
                console.error(`[KPI Service] Error calculating Team KPI for ${leaderId}:`, error);
                return this._ensureMetrics(null, 'sales_manager');
            }
        }

        // Legacy calculation logic below
        const isQuarter = period === 'quarter';

        // Get MOP's full name for querying mop_name in deal_table_rows
        let mopFullName;
        if (pool) {
            const res = await pool.query('SELECT full_name FROM profiles WHERE id = $1', [leaderId]);
            mopFullName = res.rows[0]?.full_name;
        } else {
            const res = db.prepare('SELECT full_name FROM profiles WHERE id = ?').get(leaderId);
            mopFullName = res?.full_name;
        }

        if (!mopFullName) return { error: 'User not found' };

        // Get team actions from service_requests (team members' actions)
        let teamId;
        if (pool) {
            const res = await pool.query('SELECT team_id FROM profiles WHERE id = $1', [leaderId]);
            teamId = res.rows[0]?.team_id;
        } else {
            const res = db.prepare('SELECT team_id FROM profiles WHERE id = ?').get(leaderId);
            teamId = res?.team_id;
        }

        let aRows = [];
        if (teamId) {
            const teamActionsQuery = `
                SELECT type, COUNT(*) as count
                FROM service_requests sr
                JOIN profiles p ON sr.user_id = p.id
                WHERE p.team_id = ${pool ? '$1' : '?'}
                AND sr.created_at BETWEEN ${pool ? '$2' : '?'} AND ${pool ? '$3' : '?'}
                GROUP BY type
            `;
            aRows = pool ? (await pool.query(teamActionsQuery, [teamId, startDate, endDate])).rows : db.prepare(teamActionsQuery).all(teamId, startDate, endDate);
        }

        let totalDeposits = 0;
        let totalObjects = 0;
        let totalMeetings = 0;
        let totalShowings = 0;
        let totalDeals = 0;
        aRows.forEach(r => {
            if (r.type === 'listing' || r.type === 'take' || r.type === 'object') totalObjects += parseInt(r.count);
            if (r.type === 'deposit' || r.type === 'prepayment') totalDeposits += parseInt(r.count);
            if (r.type === 'meeting' || r.type === 'meeting_office') totalMeetings += parseInt(r.count);
            if (r.type === 'showing') totalShowings += parseInt(r.count);
        });
        totalDeals = teamDealsCount;

        // Get MOP revenue from deal_table_rows by mop_name
        let totalRevenue = 0;

        // Extract year and month from date range
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        const startYear = startDateObj.getFullYear();
        const startMonth = startDateObj.getMonth() + 1;
        const endYear = endDateObj.getFullYear();
        const endMonth = endDateObj.getMonth() + 1;

        // Build year/month filter
        let yearMonthFilter = '';
        if (startYear === endYear && startMonth === endMonth) {
            yearMonthFilter = pool
                ? `dtr.year = ${startYear} AND dtr.month = ${startMonth}`
                : `dtr.year = ${startYear} AND dtr.month = ${startMonth}`;
        } else {
            yearMonthFilter = pool
                ? `CONCAT(dtr.year, '-', LPAD(dtr.month::text, 2, '0')) >= '${startYear}-${String(startMonth).padStart(2, '0')}'
                   AND CONCAT(dtr.year, '-', LPAD(dtr.month::text, 2, '0')) <= '${endYear}-${String(endMonth).padStart(2, '0')}'`
                : `printf('%04d-%02d', dtr.year, dtr.month) >= '${startYear}-${String(startMonth).padStart(2, '0')}'
                   AND printf('%04d-%02d', dtr.year, dtr.month) <= '${endYear}-${String(endMonth).padStart(2, '0')}'`;
        }

        const revenueSql = pool
            ? `SELECT
                COALESCE(SUM(dtr.mop_revenue), 0) as mop_revenue,
                COALESCE(SUM(dtr.commission_total_fact), 0) as total_revenue,
                COALESCE(SUM(dtr.rop_payout), 0) as rop_payout,
                COALESCE(SUM(dtr.mortgage_deduction), 0) as mortgage_deduction,
                COALESCE(SUM(dtr.other_expenses), 0) as other_expenses,
                COUNT(*) as deal_count
               FROM deal_table_rows dtr
               WHERE (dtr.team_id::TEXT = $1 OR dtr.mop_name = $2 OR (dtr.mop_name IS NULL AND dtr.agent_name IN (SELECT full_name FROM profiles WHERE team_id = $3))) 
                 AND ${yearMonthFilter}
                 AND dtr.status IN ('approved', 'active')`
            : `SELECT
                COALESCE(SUM(dtr.mop_revenue), 0) as mop_revenue,
                COALESCE(SUM(dtr.commission_total_fact), 0) as total_revenue,
                COALESCE(SUM(dtr.rop_payout), 0) as rop_payout,
                COALESCE(SUM(dtr.mortgage_deduction), 0) as mortgage_deduction,
                COALESCE(SUM(dtr.other_expenses), 0) as other_expenses,
                COUNT(*) as deal_count
               FROM deal_table_rows dtr
               WHERE (dtr.team_id = ? OR dtr.mop_name = ? OR (dtr.mop_name IS NULL AND dtr.agent_name IN (SELECT full_name FROM profiles WHERE team_id = ?))) 
                 AND ${yearMonthFilter}
                 AND dtr.status IN ('approved', 'active')`;

        const revenueParams = [teamId || null, mopFullName || null, teamId || null];

        let mopRevenue = 0, ropPayout = 0, mortgageDeduction = 0, otherExpenses = 0, teamDealsCount = 0;
        if (pool) {
            const revRes = await query(revenueSql, revenueParams);
            const row = revRes.rows[0] || {};
            mopRevenue = parseFloat(row.mop_revenue) || 0;
            totalRevenue = parseFloat(row.total_revenue) || 0;
            ropPayout = parseFloat(row.rop_payout) || 0;
            mortgageDeduction = parseFloat(row.mortgage_deduction) || 0;
            otherExpenses = parseFloat(row.other_expenses) || 0;
            teamDealsCount = parseInt(row.deal_count) || 0;
        } else {
            const revRow = db.prepare(revenueSql).get(...revenueParams);
            mopRevenue = parseFloat(revRow?.mop_revenue) || 0;
            totalRevenue = parseFloat(revRow?.revenue) || 0;
            ropPayout = parseFloat(revRow?.rop_payout) || 0;
            mortgageDeduction = parseFloat(revRow?.mortgage_deduction) || 0;
            otherExpenses = parseFloat(revRow?.other_expenses) || 0;
            teamDealsCount = parseInt(revRow?.deal_count) || 0;
        }

        // Get plan targets
        const now = new Date(startDate);
        let planDeposits = 0, planObjects = 0, planRevenue = 0, planDeals = 0;

        if (isQuarter) {
            const year = now.getFullYear();
            const quarter = Math.floor(now.getMonth() / 3) + 1;
            const m1 = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}`;
            const m2 = `${year}-${String((quarter - 1) * 3 + 2).padStart(2, '0')}`;
            const m3 = `${year}-${String((quarter - 1) * 3 + 3).padStart(2, '0')}`;

            const qStr = pool
                ? `SELECT SUM(target_deposits) as deposits, SUM(target_objects) as objects, SUM(target_revenue) as revenue, COALESCE(SUM(target_deals), 0) as deals FROM user_plans WHERE period_month IN ($1, $2, $3) AND user_id IN (SELECT p.id FROM profiles p LEFT JOIN positions pos ON p.position_id = pos.id WHERE p.team_id = $4::TEXT AND COALESCE(pos.access_level, 0) < 90)`
                : `SELECT SUM(target_deposits) as deposits, SUM(target_objects) as objects, SUM(target_revenue) as revenue, COALESCE(SUM(target_deals), 0) as deals FROM user_plans WHERE period_month IN (?, ?, ?) AND user_id IN (SELECT p.id FROM profiles p LEFT JOIN positions pos ON p.position_id = pos.id WHERE p.team_id = ? AND COALESCE(pos.access_level, 0) < 90)`;
            const planRes = pool ? await query(qStr, [m1, m2, m3, teamId]) : { rows: [db.prepare(qStr).get(m1, m2, m3, teamId)] };
            planDeposits = parseInt(planRes.rows[0]?.deposits) || 0;
            planObjects = parseInt(planRes.rows[0]?.objects) || 0;
            planRevenue = parseFloat(planRes.rows[0]?.revenue) || 0;
            planDeals = parseInt(planRes.rows[0]?.deals) || 0;
        } else {
            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const qStr = pool
                ? 'SELECT SUM(target_deposits) as deposits, SUM(target_objects) as objects, SUM(target_revenue) as revenue, COALESCE(SUM(target_deals), 0) as deals FROM user_plans WHERE period_month = $1 AND user_id IN (SELECT p.id FROM profiles p LEFT JOIN positions pos ON p.position_id = pos.id WHERE p.team_id = $2::TEXT AND COALESCE(pos.access_level, 0) < 90)'
                : 'SELECT SUM(target_deposits) as deposits, SUM(target_objects) as objects, SUM(target_revenue) as revenue, COALESCE(SUM(target_deals), 0) as deals FROM user_plans WHERE period_month = ? AND user_id IN (SELECT p.id FROM profiles p LEFT JOIN positions pos ON p.position_id = pos.id WHERE p.team_id = ? AND COALESCE(pos.access_level, 0) < 90)';
            const planRes = pool ? await query(qStr, [month, teamId]) : { rows: [db.prepare(qStr).get(month, teamId)] };
            planDeposits = parseInt(planRes.rows[0]?.deposits) || 0;
            planObjects = parseInt(planRes.rows[0]?.objects) || 0;
            planRevenue = parseFloat(planRes.rows[0]?.revenue) || 0;
            planDeals = parseInt(planRes.rows[0]?.deals) || 0;
        }

        // Calculate completion % for 3 metrics
        const depositsPercent = planDeposits > 0 ? (totalDeposits / planDeposits) * 100 : 0;
        const objectsPercent = planObjects > 0 ? (totalObjects / planObjects) * 100 : 0;
        const revenuePercent = planRevenue > 0 ? (totalRevenue / planRevenue) * 100 : 0;
        const dealsPercent = planDeals > 0 ? (totalDeals / planDeals) * 100 : 0;

        // Average completion
        const metricsWithTargets = [];
        if (planDeposits > 0) metricsWithTargets.push(depositsPercent);
        if (planObjects > 0) metricsWithTargets.push(objectsPercent);
        if (planRevenue > 0) metricsWithTargets.push(revenuePercent);

        const avgCompletion = metricsWithTargets.length > 0
            ? metricsWithTargets.reduce((a, b) => a + b, 0) / metricsWithTargets.length
            : 0;

        // Convert to 0-5 rating
        let rating = 0;
        const ratingConfig = await this.getRatingConfig();
        
        const calcMetrics = {
            totalRevenue,
            totalDeposits,
            totalObjects,
            meetings: totalMeetings,
            showings: totalShowings,
            dealsCount: totalDeals
        };

        const configRating = this._calculateRatingFromConfig(calcMetrics, ratingConfig, isQuarter);
        if (configRating !== null) {
            rating = configRating;
        } else {
            // Fallback to plan-based rating
            rating = Math.min((avgCompletion / 100) * 5, 5);
        }

        const result = {
            role: 'sales_manager',
            metrics: {
                totalDeposits,
                totalObjects,
                totalRevenue,
                mopRevenue,
                ropPayout,
                mortgageDeduction,
                otherExpenses,
                planDeposits,
                planObjects,
                planRevenue,
                planDeals,
                planCompletion: parseFloat(avgCompletion.toFixed(2)),
                depositsPercent: parseFloat(depositsPercent.toFixed(2)),
                objectsPercent: parseFloat(objectsPercent.toFixed(2)),
                revenuePercent: parseFloat(revenuePercent.toFixed(2)),
                dealsPercent: parseFloat(dealsPercent.toFixed(2)),
                rating: parseFloat(rating.toFixed(2)),
                meetings: totalMeetings,
                showings: totalShowings,
                dealsCount: totalDeals
            }
        };

        // Cache for 3 minutes
        await cacheService.set(cacheKey, result, 180);
        return result;
    }

    async calculateBranchKPI(userId, startDate, endDate, period = 'month', explicitBranchId = null) {
        // Get refresh timestamp for cache key generation (Plan 02-04)
        const refreshTime = aggregationService ? await aggregationService.getLastRefreshTime() : null;

        // Generate cache key
        let cacheKey;
        if (cacheService) {
            const cacheParams = {
                userId,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                period,
                explicitBranchId: explicitBranchId || 'default',
                cacheVersion: 'v18'
            };
            
            if (refreshTime) {
                cacheParams.refreshTime = refreshTime.toISOString();
            }
            
            cacheKey = cacheService.generateKey('kpi:rop', cacheParams);
        } else {
            return { role: 'head_sales', metrics: { branchRevenue: 0 } };
        }

        // Check cache (using unified cacheService)
        const cached = await cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

        console.log('[KPI] Cache MISS for branch KPI - calculating...');

        // Use new decimal-based calculator if feature flag is enabled
        if (USE_NEW_KPI_SERVICE) {
            // Determine role for calculator
            let role = 'head_sales'; // Default to ROP
            if (pool) {
                const res = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
                const dbRole = res.rows[0]?.role;
                if (dbRole === 'director' || dbRole === 'commercial') role = dbRole;
                else {
                    // Fallback: check positions.access_level for director-level users without user_roles entry
                    const profileRes = await pool.query('SELECT pos.access_level FROM profiles p JOIN positions pos ON p.position_id = pos.id WHERE p.id = $1', [userId]);
                    const accessLevel = profileRes.rows[0]?.access_level;
                    if (accessLevel >= 90) role = 'director';
                }
            }

            try {
                const calculators = this.calculatorFactory.getCalculators(role);
                // For dual-KPI roles (Director, ROP, MOP), calculators[0] is often Realtor, 
                // but calculateBranchKPI MUST use the management-tier calculator (calculators[1] or ONLY calculator)
                const calculator = calculators.length > 1 ? calculators[1] : calculators[0]; 
                const result = await calculator.calculate(userId, startDate, endDate, period, explicitBranchId || null);
                const ensuredResult = this._ensureMetrics(result, role);
                
                // FORCE CACHE INVALIDATION for incorrect astronomical numbers
                if (cacheService) await cacheService.set(cacheKey, ensuredResult, 300);
                
                return ensuredResult;
            } catch (error) {
                console.error(`[KPI Service] CRITICAL ERROR calculating individual KPI for user ${userId}:`, error.message);
                console.error(error.stack); 
                return this._ensureMetrics({}, role); // Safe fallback to avoid 500 error
            }
        }

        // Legacy calculation logic below

        const isQuarter = period === 'quarter';
        let branchId;
        let role;
        const profileRes = pool ? await pool.query('SELECT p.branch_id, ur.role FROM profiles p JOIN user_roles ur ON p.id = ur.user_id WHERE p.id = $1', [userId])
            : { rows: [db.prepare('SELECT p.branch_id, ur.role FROM profiles p JOIN user_roles ur ON p.id = ur.user_id WHERE p.id = ?').get(userId)] };

        branchId = explicitBranchId && explicitBranchId !== 'all' ? explicitBranchId : profileRes.rows[0]?.branch_id;
        role = profileRes.rows[0]?.role;

        // Commercial and Directors see everything IF no specific branch chosen
        const isGlobal = (role === 'commercial' || role === 'director') && (!explicitBranchId || explicitBranchId === 'all');

        // Get actions from service_requests
        let actionsParams;
        if (isGlobal) {
            actionsParams = [startDate, endDate];
        } else {
            actionsParams = [branchId, startDate, endDate];
        }

        const actionsQuery = isGlobal
            ? `SELECT type, COUNT(*) as count FROM service_requests WHERE created_at BETWEEN $1 AND $2 GROUP BY type`
            : `SELECT type, COUNT(*) as count FROM service_requests sr JOIN profiles p ON sr.user_id = p.id WHERE p.branch_id = $1 AND sr.created_at BETWEEN $2 AND $3 GROUP BY type`;

        const aRows = pool ? (await pool.query(actionsQuery, actionsParams)).rows : db.prepare(actionsQuery.replace(/\$\d+/g, '?')).all(...actionsParams);

        console.log('[calculateBranchKPI] Service requests results:', JSON.stringify(aRows, null, 2));

        let totalDeposits = 0;
        let totalObjects = 0;
        let totalMeetings = 0;
        let totalShowings = 0;
        let totalDeals = 0;
        aRows.forEach(r => {
            if (r.type === 'listing' || r.type === 'take' || r.type === 'object') totalObjects += parseInt(r.count);
            if (r.type === 'deposit' || r.type === 'prepayment') totalDeposits += parseInt(r.count);
            if (r.type === 'meeting' || r.type === 'meeting_office') totalMeetings += parseInt(r.count);
            if (r.type === 'showing') totalShowings += parseInt(r.count);
        });
        totalDeals = branchDealsCount;

        console.log('[calculateBranchKPI] Calculated totals:', { totalDeposits, totalObjects, totalMeetings, totalShowings, totalDeals });

        // Get branch revenue from deal_table_rows
        let totalRevenue = 0;

        // Extract year and month from date range
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        const startYear = startDateObj.getFullYear();
        const startMonth = startDateObj.getMonth() + 1;
        const endYear = endDateObj.getFullYear();
        const endMonth = endDateObj.getMonth() + 1;

        // Build year/month filter (numeric: YYYYMM)
        const startVal = startYear * 100 + startMonth;
        const endVal = endYear * 100 + endMonth;
        const yearMonthFilter = `(year * 100 + month) BETWEEN ${startVal} AND ${endVal}`;

        const revenueSql = pool
            ? `SELECT
                COALESCE(SUM(dtr.commission_total_fact - COALESCE(dtr.mop_revenue, 0)), 0) as revenue,
                COALESCE(SUM(dtr.mop_revenue), 0) as mop_revenue,
                COALESCE(SUM(dtr.rop_payout), 0) as rop_payout,
                COALESCE(SUM(dtr.mortgage_deduction), 0) as mortgage_deduction,
                COALESCE(SUM(dtr.other_expenses), 0) as other_expenses,
                COUNT(*) as deal_count
               FROM deal_table_rows dtr
               ${isGlobal ? '' : 'LEFT JOIN profiles p ON dtr.agent_name = p.full_name'}
               WHERE ${isGlobal ? '' : '(dtr.branch_id::TEXT = $1 OR p.branch_id::TEXT = $2) AND '}${yearMonthFilter}
                 AND dtr.status IN ('approved', 'active')`
            : `SELECT
                COALESCE(SUM(dtr.commission_total_fact - COALESCE(dtr.mop_revenue, 0)), 0) as revenue,
                COALESCE(SUM(dtr.mop_revenue), 0) as mop_revenue,
                COALESCE(SUM(dtr.rop_payout), 0) as rop_payout,
                COALESCE(SUM(dtr.mortgage_deduction), 0) as mortgage_deduction,
                COALESCE(SUM(dtr.other_expenses), 0) as other_expenses,
                COUNT(*) as deal_count
               FROM deal_table_rows dtr
               ${isGlobal ? '' : 'LEFT JOIN profiles p ON dtr.agent_name = p.full_name'}
               WHERE ${isGlobal ? '' : '(dtr.branch_id = ? OR p.branch_id = ?) AND '}${yearMonthFilter}
                 AND dtr.status IN ('approved', 'active')`;

        const revenueParams = isGlobal ? [] : [branchId || null, branchId || null];

        let mopRevenue = 0, ropPayout = 0, mortgageDeduction = 0, otherExpenses = 0, branchDealsCount = 0;
        if (pool) {
            const revRes = await query(revenueSql, revenueParams);
            const row = revRes.rows[0] || {};
            totalRevenue = parseFloat(row.revenue) || 0;
            mopRevenue = parseFloat(row.mop_revenue) || 0;
            ropPayout = parseFloat(row.rop_payout) || 0;
            mortgageDeduction = parseFloat(row.mortgage_deduction) || 0;
            otherExpenses = parseFloat(row.other_expenses) || 0;
            branchDealsCount = parseInt(row.deal_count) || 0;
        } else {
            const revRow = db.prepare(revenueSql).get(...revenueParams);
            totalRevenue = parseFloat(revRow?.revenue) || 0;
            mopRevenue = parseFloat(revRow?.mop_revenue) || 0;
            ropPayout = parseFloat(revRow?.rop_payout) || 0;
            mortgageDeduction = parseFloat(revRow?.mortgage_deduction) || 0;
            otherExpenses = parseFloat(revRow?.other_expenses) || 0;
            branchDealsCount = parseInt(revRow?.deal_count) || 0;
        }

        // Get plan targets
        const now = new Date(startDate);
        let planDeposits = 0, planObjects = 0, planRevenue = 0, planDeals = 0;

        if (isQuarter) {
            const year = now.getFullYear();
            const quarter = Math.floor(now.getMonth() / 3) + 1;
            const m1 = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}`;
            const m2 = `${year}-${String((quarter - 1) * 3 + 2).padStart(2, '0')}`;
            const m3 = `${year}-${String((quarter - 1) * 3 + 3).padStart(2, '0')}`;

            let planQueryStr;
            let planParams;
            if (isGlobal) {
                planQueryStr = pool
                    ? `SELECT SUM(target_deposits) as deposits, SUM(target_objects) as objects, SUM(target_revenue) as revenue, COALESCE(SUM(target_deals), 0) as deals FROM user_plans WHERE period_month IN ($1, $2, $3)`
                    : `SELECT SUM(target_deposits) as deposits, SUM(target_objects) as objects, SUM(target_revenue) as revenue, COALESCE(SUM(target_deals), 0) as deals FROM user_plans WHERE period_month IN (?, ?, ?)`;
                planParams = [m1, m2, m3];
            } else {
                planQueryStr = pool
                    ? `SELECT SUM(target_deposits) as deposits, SUM(target_objects) as objects, SUM(target_revenue) as revenue, COALESCE(SUM(target_deals), 0) as deals FROM user_plans WHERE period_month IN ($1, $2, $3) AND user_id IN (SELECT p.id FROM profiles p LEFT JOIN positions pos ON p.position_id = pos.id WHERE p.branch_id = $4::TEXT AND COALESCE(pos.access_level, 0) < 90)`
                    : `SELECT SUM(target_deposits) as deposits, SUM(target_objects) as objects, SUM(target_revenue) as revenue, COALESCE(SUM(target_deals), 0) as deals FROM user_plans WHERE period_month IN (?, ?, ?) AND user_id IN (SELECT p.id FROM profiles p LEFT JOIN positions pos ON p.position_id = pos.id WHERE p.branch_id = ? AND COALESCE(pos.access_level, 0) < 90)`;
                planParams = [m1, m2, m3, branchId];
            }

            const planRes = pool ? await pool.query(planQueryStr, planParams) : { rows: [db.prepare(planQueryStr).get(...planParams)] };
            planDeposits = parseInt(planRes.rows[0]?.deposits) || 0;
            planObjects = parseInt(planRes.rows[0]?.objects) || 0;
            planRevenue = parseFloat(planRes.rows[0]?.revenue) || 0;
            planDeals = parseInt(planRes.rows[0]?.deals) || 0;
        } else {
            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            let planQueryStr;
            let planParams;
            if (isGlobal) {
                planQueryStr = pool
                    ? 'SELECT SUM(target_deposits) as deposits, SUM(target_objects) as objects, SUM(target_revenue) as revenue, COALESCE(SUM(target_deals), 0) as deals FROM user_plans WHERE period_month = $1'
                    : 'SELECT SUM(target_deposits) as deposits, SUM(target_objects) as objects, SUM(target_revenue) as revenue, COALESCE(SUM(target_deals), 0) as deals FROM user_plans WHERE period_month = ?';
                planParams = [month];
            } else {
                planQueryStr = pool
                    ? 'SELECT SUM(target_deposits) as deposits, SUM(target_objects) as objects, SUM(target_revenue) as revenue, COALESCE(SUM(target_deals), 0) as deals FROM user_plans WHERE period_month = $1 AND user_id IN (SELECT p.id FROM profiles p LEFT JOIN positions pos ON p.position_id = pos.id WHERE p.branch_id = $2 AND COALESCE(pos.access_level, 0) < 90)'
                    : 'SELECT SUM(target_deposits) as deposits, SUM(target_objects) as objects, SUM(target_revenue) as revenue, COALESCE(SUM(target_deals), 0) as deals FROM user_plans WHERE period_month = ? AND user_id IN (SELECT p.id FROM profiles p LEFT JOIN positions pos ON p.position_id = pos.id WHERE p.branch_id = ? AND COALESCE(pos.access_level, 0) < 90)';
                planParams = [month, branchId];
            }

            const planRes = pool ? await pool.query(planQueryStr, planParams) : { rows: [db.prepare(planQueryStr).get(...planParams)] };
            planDeposits = parseInt(planRes.rows[0]?.deposits) || 0;
            planObjects = parseInt(planRes.rows[0]?.objects) || 0;
            planRevenue = parseFloat(planRes.rows[0]?.revenue) || 0;
            planDeals = parseInt(planRes.rows[0]?.deals) || 0;
        }

        // Calculate completion % for 3 metrics
        const depositsPercent = planDeposits > 0 ? (totalDeposits / planDeposits) * 100 : 0;
        const objectsPercent = planObjects > 0 ? (totalObjects / planObjects) * 100 : 0;
        const revenuePercent = planRevenue > 0 ? (totalRevenue / planRevenue) * 100 : 0;
        const dealsPercent = planDeals > 0 ? (totalDeals / planDeals) * 100 : 0;

        // Average completion
        const metricsWithTargets = [];
        if (planDeposits > 0) metricsWithTargets.push(depositsPercent);
        if (planObjects > 0) metricsWithTargets.push(objectsPercent);
        if (planRevenue > 0) metricsWithTargets.push(revenuePercent);

        const avgCompletion = metricsWithTargets.length > 0
            ? metricsWithTargets.reduce((a, b) => a + b, 0) / metricsWithTargets.length
            : 0;

        // Convert to 0-5 rating
        let rating = 0;
        const ratingConfig = await this.getRatingConfig();
        
        const calcMetrics = {
            totalRevenue,
            totalDeposits,
            totalObjects,
            meetings: totalMeetings,
            showings: totalShowings,
            dealsCount: totalDeals
        };

        const configRating = this._calculateRatingFromConfig(calcMetrics, ratingConfig, isQuarter);
        if (configRating !== null) {
            rating = configRating;
        } else {
            // Fallback to plan-based rating
            rating = Math.min((avgCompletion / 100) * 5, 5);
        }

        // Calculate personal KPI for the user (needed for widget display).
        // IMPORTANT: directors/admins must not have personal KPI % / personal plan.
        const noPersonalKpi = role === 'director' || role === 'admin';
        let currentPercent = 0;
        let currentThreshold = 0;
        let nextThreshold = null;
        let estimatedIncome = 0;

        if (!noPersonalKpi) try {
            // Get user's personal KPI setting
            const profileRes = pool
                ? await pool.query('SELECT personal_kpi_current FROM profiles WHERE id = $1', [userId])
                : { rows: [db.prepare('SELECT personal_kpi_current FROM profiles WHERE id = ?').get(userId)] };

            const personalKpiValue = profileRes.rows[0]?.personal_kpi_current;
            // Use personal KPI if set (not null/undefined), otherwise default to 40
            // Note: personal_kpi_current = 0 is a valid setting (user explicitly set 0%)
            const manualKpi = (personalKpiValue !== null && personalKpiValue !== undefined)
                ? parseFloat(personalKpiValue) || 40
                : 40;

            // Load realtor KPI tiers from database
            const rulesRes = pool
                ? await pool.query('SELECT min_threshold, percent FROM kpi_rules WHERE role = $1 ORDER BY min_threshold ASC', ['realtor'])
                : { rows: db.prepare('SELECT min_threshold, percent FROM kpi_rules WHERE role = ? ORDER BY min_threshold ASC').all('realtor') };
            const KPI_TIERS = rulesRes.rows.map(r => ({ percent: Number(r.percent), threshold: Number(r.min_threshold) }));
            if (KPI_TIERS.length === 0) {
                KPI_TIERS.push({ percent: 40, threshold: 0 });
            }

            // For quarterly view, multiply thresholds by 3
            const isQuarterly = period === 'quarter';
            const factor = isQuarterly ? 3 : 1;

            // Find current tier by revenue
            let currentTierIndex = 0;
            for (let i = KPI_TIERS.length - 1; i >= 0; i--) {
                if (totalRevenue >= KPI_TIERS[i].threshold * factor) {
                    currentTierIndex = i;
                    break;
                }
            }

            // Use effective percent (higher of tier or manual, capped at 60)
            const effectivePercent = Math.min(Math.max(KPI_TIERS[currentTierIndex].percent, manualKpi), 60);
            currentPercent = effectivePercent;
            currentThreshold = KPI_TIERS[currentTierIndex].threshold * factor;

            // Get next threshold
            if (currentTierIndex < KPI_TIERS.length - 1) {
                nextThreshold = KPI_TIERS[currentTierIndex + 1].threshold * factor;
            }

            // Use ropPayout from deals as the source of truth for branch managers
            estimatedIncome = ropPayout;
        } catch (err) {
            console.error('[calculateBranchKPI] Personal KPI calculation error:', err.message);
            // Fallback to defaults (40%, no next threshold)
        }

        const result = {
            role: role || 'head_sales',
            currentPercent,
            currentThreshold,
            nextThreshold,
            estimatedIncome,
            metrics: {
                totalDeposits,
                totalObjects,
                totalRevenue,
                mopRevenue,
                ropPayout,
                mortgageDeduction,
                otherExpenses,
                planDeposits,
                planObjects,
                planRevenue,
                planDeals,
                planCompletion: noPersonalKpi ? 0 : parseFloat(avgCompletion.toFixed(2)),
                depositsPercent: parseFloat(depositsPercent.toFixed(2)),
                objectsPercent: parseFloat(objectsPercent.toFixed(2)),
                revenuePercent: parseFloat(revenuePercent.toFixed(2)),
                dealsPercent: parseFloat(dealsPercent.toFixed(2)),
                rating: parseFloat(rating.toFixed(2)),
                meetings: totalMeetings,
                showings: totalShowings,
                dealsCount: totalDeals
            }
        };

        // Cache for 3 minutes
        await cacheService.set(cacheKey, result, 180);
        return result;
    }

    calculatePoints(actions, revenue = 0) {
        const pointsMap = {
            deposit: 10,
            object: 5,
            showing: 5,
            meeting: 3,
        };

        let points = (actions.takes || 0) * pointsMap.object +
            (actions.meetings || 0) * pointsMap.meeting +
            (actions.showings || 0) * pointsMap.showing +
            (actions.deposits || 0) * pointsMap.deposit;

        // Add points for revenue - 5 points for every 100,000 rub (50 points per 1M)
        // This gives proper weight to deals via revenue without double counting
        points += Math.floor(revenue / 20000);

        return points;
    }

    async getLeaderboard(startDate, endDate, branchId = null, teamId = null) {
        // Get refresh timestamp for cache key generation (Plan 02-04)
        const refreshTime = aggregationService ? await aggregationService.getLastRefreshTime() : null;

        // Generate cache key
        let cacheKey;
        if (cacheService) {
            const cacheParams = {
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                branchId: branchId || 'all',
                teamId: teamId || 'all',
                cacheVersion: 'v18'
            };
            
            if (refreshTime) {
                cacheParams.refreshTime = refreshTime.toISOString();
            }
            
            cacheKey = cacheService.generateKey('kpi:leaderboard', cacheParams);
        } else {
            return [];
        }

        // Check cache (using unified cacheService)
        const cached = await cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

        // For "all time", use earliest possible date that makes sense (2020-01-01 instead of 1970)
        // This avoids issues with plan calculations over unrealistic time ranges
        const start = startDate === 'all' ? new Date('2020-01-01').toISOString() : startDate;
        const startDateObj = new Date(start);
        const endDateObj = new Date(endDate);

        let profiles = [];
        let queryStr = `
            SELECT p.id, p.full_name, ('/api/profiles/' || p.id || '/avatar') as avatar_url, r.role, p.team_id, p.branch_id, t.name as team_name,
                   p.custom_total_deals, p.custom_total_objects, pos.name as position_name,
                   p.personal_kpi_current, p.management_kpi_current,
                   COALESCE(p.registration_date::TEXT, p.created_at::TEXT, u.created_at::TEXT) as created_at
            FROM profiles p
            LEFT JOIN auth_users u ON p.id = u.id
            LEFT JOIN user_roles r ON p.id = r.user_id
            LEFT JOIN teams t ON p.team_id = t.id
            LEFT JOIN positions pos ON p.position_id = pos.id
            WHERE p.is_active = 1
        `;

        const params = [];
        if (branchId) {
            queryStr += ` AND p.branch_id = ${pool ? '$' + (params.length + 1) : '?'}`;
            params.push(branchId);
        }
        if (teamId) {
            queryStr += ` AND p.team_id = ${pool ? '$' + (params.length + 1) : '?'}`;
            params.push(teamId);
        }

        if (pool) {
            const res = await pool.query(queryStr, params);
            profiles = res.rows;
        } else {
            profiles = db.prepare(queryStr).all(...params);
        }

        const leaderboard = [];

        // Batch fetch all metrics to avoid N+1 query problem
        const userIds = profiles.map(p => p.id);
        const profileMap = new Map();
        profiles.forEach(p => profileMap.set(p.id, { 
          ...p, 
          deposits: 0, 
          takes: 0, 
          revenue: 0, 
          plan_deposits: 0, 
          plan_objects: 0, 
          plan_revenue: 0 
        }));

        // Fetch KPI rules for managers once
        const rulesRes = pool 
          ? await pool.query('SELECT role, min_threshold, percent FROM kpi_rules ORDER BY min_threshold ASC')
          : { rows: db.prepare('SELECT role, min_threshold, percent FROM kpi_rules ORDER BY min_threshold ASC').all() };
        
        const kpiRulesMap = new Map();
        rulesRes.rows.forEach(r => {
          if (!kpiRulesMap.has(r.role)) kpiRulesMap.set(r.role, []);
          kpiRulesMap.get(r.role).push(r);
        });

        if (userIds.length > 0) {
            // 1. Get service requests actions
            let actionsQuery;
            let actionsRes;
            if (pool) {
                actionsQuery = `
                    SELECT user_id, type, COUNT(*) as count
                    FROM service_requests
                    WHERE user_id = ANY($1::TEXT[]) AND created_at BETWEEN $2 AND $3
                    GROUP BY user_id, type
                `;
                actionsRes = await query(actionsQuery, [userIds, start, endDate]);
            } else {
                const placeholders = userIds.map(() => '?').join(',');
                actionsQuery = `
                    SELECT user_id, type, COUNT(*) as count
                    FROM service_requests
                    WHERE user_id IN (${placeholders}) AND created_at BETWEEN ? AND ?
                    GROUP BY user_id, type
                `;
                actionsRes = await query(actionsQuery, [...userIds, start, endDate]);
            }

            actionsRes.rows.forEach(r => {
                const p = profileMap.get(r.user_id);
                if (!p) return;
                const count = parseInt(r.count) || 0;
                if (r.type === 'listing' || r.type === 'take' || r.type === 'object') p.takes += count;
                if (r.type === 'deposit' || r.type === 'prepayment') p.deposits += count;
                if (r.type === 'meeting' || r.type === 'meeting_office') p.meetings = (p.meetings || 0) + count;
                if (r.type === 'showing') p.showings = (p.showings || 0) + count;
            });

            // 2. Get objects from daily reports
            let reportsQuery;
            let reportsRes;
            if (pool) {
                reportsQuery = `
                    SELECT user_id, content 
                    FROM reports 
                    WHERE user_id = ANY($1::TEXT[]) AND created_at BETWEEN $2 AND $3 AND type = 'daily' AND status = 'approved'
                `;
                reportsRes = await query(reportsQuery, [userIds, start, endDate]);
            } else {
                const placeholders = userIds.map(() => '?').join(',');
                reportsQuery = `
                    SELECT user_id, content 
                    FROM reports 
                    WHERE user_id IN (${placeholders}) AND created_at BETWEEN ? AND ? AND type = 'daily' AND status = 'approved'
                `;
                reportsRes = await query(reportsQuery, [...userIds, start, endDate]);
            }

            reportsRes.rows.forEach(row => {
                const p = profileMap.get(row.user_id);
                if (!p || !row.content) return;
                const content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
                if (content['Набор базы'] || content['Объекты'] || content['objects']) {
                    p.takes += parseInt(content['Набор базы'] || content['Объекты'] || content['objects']) || 0;
                }
            });

            // 2.5. Override "Набор базы" with count of properties created in period
            //      (status: approved / on Avito / in feed), only client-sourced objects count.
            try {
                const propsQuery = pool ? `
                    SELECT owner_id::TEXT as user_id, COUNT(*)::int as cnt
                    FROM properties
                    WHERE owner_id = ANY($1::TEXT[])
                      AND created_at BETWEEN $2 AND $3
                      AND status IN ('approved', 'avito_approved', 'published_avito', 'in_feed')
                      AND (source_type IS NULL OR source_type = 'client')
                    GROUP BY owner_id
                ` : `
                    SELECT owner_id as user_id, COUNT(*) as cnt
                    FROM properties
                    WHERE owner_id IN (${userIds.map(() => '?').join(',')})
                      AND created_at BETWEEN ? AND ?
                      AND status IN ('approved', 'avito_approved', 'published_avito', 'in_feed')
                      AND (source_type IS NULL OR source_type = 'client')
                    GROUP BY owner_id
                `;
                const propsParams = pool ? [userIds, start, endDate] : [...userIds, start, endDate];
                const propsRes = await query(propsQuery, propsParams);
                propsRes.rows.forEach(r => {
                    const p = profileMap.get(r.user_id);
                    if (p) p.takes = parseInt(r.cnt) || 0;
                });
            } catch (e) {
                console.warn('[Leaderboard] Failed to load properties counts for takes:', e.message);
            }


            // 3. Get revenue from deal_table_rows
            // Extract dates for filter
            const startYear = startDateObj.getFullYear();
            const startMonth = startDateObj.getMonth() + 1;
            const endYear = endDateObj.getFullYear();
            const endMonth = endDateObj.getMonth() + 1;

            // Build year-month comparison logic (numeric: YYYYMM)
            const startVal = startYear * 100 + startMonth;
            const endVal = endYear * 100 + endMonth;
            const yearMonthSql = `(dtr.year * 100 + dtr.month) BETWEEN ${startVal} AND ${endVal}`;

            // Optimized role-based revenue query (Plan 04-04)
            // Fix: Join user_roles to get role column, canonicalize roles (RU/EN), and ensure UUID casting
            const revenueQuery = pool ? `
                SELECT 
                    p.id::TEXT as user_id,
                    SUM(CASE 
                        -- Realtor: Only Agent Revenue (Consistent with RealtorCalculator)
                        WHEN (p.role_canonical = 'realtor') 
                             AND (dtr.agent_id::TEXT = p.id::TEXT OR (dtr.agent_id IS NULL AND LOWER(TRIM(dtr.agent_name)) = LOWER(TRIM(p.full_name))))
                        THEN (dtr.commission_total_fact - COALESCE(dtr.mop_revenue, 0))
                        
                        -- MOP: Only MOP Revenue
                        WHEN (p.role_canonical = 'mop')
                             AND (dtr.mop_id::TEXT = p.id::TEXT OR (dtr.mop_id IS NULL AND LOWER(TRIM(dtr.mop_name)) = LOWER(TRIM(p.full_name))))
                        THEN dtr.commission_total_fact
                        
                        -- ROP: Only ROP Revenue
                        WHEN (p.role_canonical = 'rop')
                             AND (dtr.rop_id::TEXT = p.id::TEXT OR (dtr.rop_id IS NULL AND LOWER(TRIM(dtr.rop_name)) = LOWER(TRIM(p.full_name))))
                        THEN dtr.commission_total_fact
                        
                        ELSE 0 
                    END) as revenue
                FROM deal_table_rows dtr
                CROSS JOIN (
                    SELECT pr.id, pr.full_name,
                           CASE 
                             WHEN LOWER(TRIM(ur.role)) IN ('realtor', 'риелтор', 'agent', 'агент', '') OR ur.role IS NULL THEN 'realtor'
                             WHEN LOWER(TRIM(ur.role)) IN ('mop', 'моп', 'manager', 'sales_manager', 'менеджер', 'менеджер оп') THEN 'mop'
                             WHEN LOWER(TRIM(ur.role)) IN ('rop', 'роп', 'head', 'head_sales', 'director', 'commercial', 'директор', 'коммерческий') THEN 'rop'
                             ELSE 'realtor'
                           END as role_canonical
                    FROM profiles pr
                    LEFT JOIN user_roles ur ON pr.id = ur.user_id
                    WHERE pr.id = ANY($1::TEXT[])
                ) p
                WHERE (dtr.year * 100 + dtr.month) BETWEEN ${startVal} AND ${endVal}
                  AND dtr.status IN ('approved', 'active')
                GROUP BY p.id
            ` : `
                SELECT 
                    p.id as user_id,
                    SUM(CASE 
                        WHEN (p.role_canonical = 'realtor') 
                             AND (dtr.agent_id = p.id OR (dtr.agent_id IS NULL AND LOWER(TRIM(dtr.agent_name)) = LOWER(TRIM(p.full_name))))
                        THEN (dtr.commission_total_fact - COALESCE(dtr.mop_revenue, 0))
                        
                        WHEN (p.role_canonical = 'mop')
                             AND (dtr.mop_id = p.id OR (dtr.mop_id IS NULL AND LOWER(TRIM(dtr.mop_name)) = LOWER(TRIM(p.full_name))))
                        THEN dtr.commission_total_fact
                        
                        WHEN (p.role_canonical = 'rop')
                             AND (dtr.rop_id = p.id OR (dtr.rop_id IS NULL AND LOWER(TRIM(dtr.rop_name)) = LOWER(TRIM(p.full_name))))
                        THEN dtr.commission_total_fact
                        
                        ELSE 0 
                    END) as revenue
                FROM deal_table_rows dtr
                CROSS JOIN (
                    SELECT pr.id, pr.full_name,
                           CASE 
                             WHEN LOWER(TRIM(ur.role)) IN ('realtor', 'риелтор', 'agent', 'агент', '') OR ur.role IS NULL THEN 'realtor'
                             WHEN LOWER(TRIM(ur.role)) IN ('mop', 'моп', 'manager', 'sales_manager', 'менеджер', 'менеджер оп') THEN 'mop'
                             WHEN LOWER(TRIM(ur.role)) IN ('rop', 'роп', 'head', 'head_sales', 'director', 'commercial', 'директор', 'коммерческий') THEN 'rop'
                             ELSE 'realtor'
                           END as role_canonical
                    FROM profiles pr
                    LEFT JOIN user_roles ur ON pr.id = ur.user_id
                    WHERE pr.id IN (${userIds.map(() => '?').join(',')})
                ) p
                WHERE (dtr.year * 100 + dtr.month) BETWEEN ${startVal} AND ${endVal}
                  AND dtr.status IN ('approved', 'active')
                GROUP BY p.id
            `;

            const revRes = await query(revenueQuery, pool ? [userIds] : [...userIds]);
            revRes.rows.forEach(r => {
                const p = profileMap.get(r.user_id);
                if (p) p.revenue = parseFloat(r.revenue) || 0;
            });

            // 3b. Ручные транзакции с привязкой к сотруднику — учитываются в выручке для мотивации/KPI (лидерборд)
            try {
                if (pool && userIds.length > 0) {
                    const manualRev = await query(`
                        SELECT user_id::TEXT as user_id,
                          COALESCE(SUM(
                            CASE
                              WHEN type = 'income' AND category IN ('commission','mortgage_service_fee') THEN amount::double precision
                              ELSE 0
                            END
                          ), 0)::float AS extra
                        FROM transactions
                        WHERE user_id IS NOT NULL
                          AND user_id = ANY($1::TEXT[])
                          AND created_at BETWEEN $2 AND $3
                        GROUP BY user_id
                    `, [userIds, start, endDate]);
                    manualRev.rows.forEach((r) => {
                        const p = profileMap.get(r.user_id);
                        if (p) p.revenue = (parseFloat(p.revenue) || 0) + (parseFloat(r.extra) || 0);
                    });
                }
            } catch (e) {
                console.warn('[Leaderboard] manual transaction revenue merge failed:', e?.message || e);
            }

            // 4. Get plan targets (Refactored to aggregate for managers)
            const startMonthStr = `${startDateObj.getFullYear()}-${String(startDateObj.getMonth() + 1).padStart(2, '0')}`;
            const endMonthStr = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, '0')}`;

            // Fetch personal plans
            let personalPlanRes;
            if (pool) {
                personalPlanRes = await query(`
                    SELECT user_id, SUM(target_deposits) as target_deposits, SUM(target_objects) as target_objects, SUM(target_revenue) as target_revenue
                    FROM user_plans
                    WHERE user_id = ANY($1::TEXT[]) AND period_month >= $2 AND period_month <= $3
                    GROUP BY user_id
                `, [userIds, startMonthStr, endMonthStr]);
            } else {
                personalPlanRes = await query(`
                    SELECT user_id, SUM(target_deposits) as target_deposits, SUM(target_objects) as target_objects, SUM(target_revenue) as target_revenue
                    FROM user_plans
                    WHERE user_id IN (${userIds.map(() => '?').join(',')}) AND period_month >= ? AND period_month <= ?
                    GROUP BY user_id
                `, [...userIds, startMonthStr, endMonthStr]);
            }

            // Fetch team plans (optional for optimization: only if MOPs in map)
            const teamPlanRes = pool ? await query(`
                SELECT p.team_id, SUM(up.target_revenue) as target_revenue, SUM(up.target_deposits) as target_deposits, SUM(up.target_objects) as target_objects
                FROM user_plans up
                JOIN profiles p ON up.user_id::TEXT = p.id::TEXT
                WHERE up.period_month >= $1 AND up.period_month <= $2 AND p.team_id IS NOT NULL
                GROUP BY p.team_id
            `, [startMonthStr, endMonthStr]) : { rows: [] };

            // Fetch branch plans (optional: only if ROPs in map)
            const branchPlanRes = pool ? await query(`
                SELECT p.branch_id, SUM(up.target_revenue) as target_revenue, SUM(up.target_deposits) as target_deposits, SUM(up.target_objects) as target_objects
                FROM user_plans up
                JOIN profiles p ON up.user_id::TEXT = p.id::TEXT
                WHERE up.period_month >= $1 AND up.period_month <= $2 AND p.branch_id IS NOT NULL
                GROUP BY p.branch_id
            `, [startMonthStr, endMonthStr]) : { rows: [] };

            const teamPlanMap = new Map(teamPlanRes.rows.map(r => [String(r.team_id), r]));
            const branchPlanMap = new Map(branchPlanRes.rows.map(r => [String(r.branch_id), r]));
            const personalPlanMap = new Map(personalPlanRes.rows.map(r => [String(r.user_id), r]));

            for (const p of profileMap.values()) {
                const role = (p.role || '').toLowerCase();
                const teamId = p.teamId ? String(p.teamId) : null;
                const branchId = p.branchId ? String(p.branchId) : null;
                const userId = String(p.id);

                let planData = personalPlanMap.get(userId);

                // For managers, we use aggregated plans IF their personal plan is missing or they are primarily managers
                // Based on requirements, MOP = Team Plan, ROP/Director = Branch Plan
                if (role.includes('manager') || role === 'mop') {
                    if (teamId && teamPlanMap.has(teamId)) {
                        planData = teamPlanMap.get(teamId);
                    }
                } else if (role.includes('head') || role === 'rop' || role === 'director' || role === 'commercial') {
                    if (branchId && branchPlanMap.has(branchId)) {
                        planData = branchPlanMap.get(branchId);
                    }
                }

                if (planData) {
                    p.plan_deposits = parseInt(planData.target_deposits) || 0;
                    p.plan_objects = parseInt(planData.target_objects) || 0;
                    p.plan_revenue = parseNumeric(planData.target_revenue || 0);
                }
            }
        }

        for (const p of profileMap.values()) {
            const totalDeposits = p.deposits || 0;
            const totalObjects = p.takes || 0;
            const totalRevenue = p.revenue || 0;
            const planDeposits = p.plan_deposits || 0;
            const planObjects = p.plan_objects || 0;
            const planRevenue = p.plan_revenue || 0;

            const depositsPercent = planDeposits > 0 ? (totalDeposits / planDeposits) * 100 : 0;
            const objectsPercent = planObjects > 0 ? (totalObjects / planObjects) * 100 : 0;
            const revenuePercent = planRevenue > 0 ? (totalRevenue / planRevenue) * 100 : 0;

            const metricsWithTargets = [];
            if (planDeposits > 0) metricsWithTargets.push(depositsPercent);
            if (planObjects > 0) metricsWithTargets.push(objectsPercent);
            if (planRevenue > 0) metricsWithTargets.push(revenuePercent);

            const avgCompletion = metricsWithTargets.length > 0
                ? metricsWithTargets.reduce((a, b) => a + b, 0) / metricsWithTargets.length
                : 0;

            // Use global rating config if available
            let rating = 0;
            const ratingConfig = await this.getRatingConfig();
            const isQuarter = Math.round((endDateObj - startDateObj) / (1000 * 60 * 60 * 24)) > 45;

            const calcMetrics = {
                totalRevenue,
                totalDeposits,
                totalObjects,
                meetings: p.meetings || 0,
                showings: p.showings || 0,
                dealsCount: p.dealsCount || 0
            };

            const configRating = this._calculateRatingFromConfig(calcMetrics, ratingConfig, isQuarter);
            if (configRating !== null) {
                rating = configRating;
            } else {
                // Fallback to plan-based rating
                rating = Math.min((avgCompletion / 100) * 5, 5);
            }

            // Calculate actual kpiRate (personal commission percentage) - consistent with dashboard
            let kpiRate = 0;
            
            // If employee started after this period ended, they had no KPI then (Plan 03-31)
            // If employee started after this period ended, they had no KPI then
            const hiredAt = p.created_at ? new Date(p.created_at) : null;
            const periodEnd = new Date(endDate);
            // If we don't have hiredAt, we assume they're present (safe for old migrated data),
            // but for recent periods we check u.created_at specifically.
            const wasPresent = !hiredAt || hiredAt <= periodEnd;

            const role = (p.role || '').toLowerCase();
            
            if (!wasPresent) {
                kpiRate = null;
            } else if (role === 'realtor' || !role) {
                const realtorRules = kpiRulesMap.get('realtor') || [];
                const tiers = realtorRules.length > 0 ? realtorRules : [
                    { percent: 40, min_threshold: 0 },
                    { percent: 45, min_threshold: 700000 },
                    { percent: 50, min_threshold: 900000 },
                    { percent: 55, min_threshold: 1200000 },
                    { percent: 60, min_threshold: 1550000 },
                ];
                
                // Adjust thresholds for the actual duration
                const dateStart = new Date(start);
                const dateEnd = new Date(endDate);
                const diffMonths = Math.max(1, Math.round((dateEnd.getTime() - dateStart.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
                
                const tier = [...tiers].reverse().find(t => totalRevenue >= t.min_threshold * diffMonths);
                const calcRate = tier?.percent || (tiers.length > 0 ? tiers[0].percent : 40);
                const profileRate = parseFloat(p.personal_kpi_current) || 0;
                kpiRate = Math.max(calcRate, profileRate);
            } else {
                // Management role logic
                const rules = kpiRulesMap.get(role) || kpiRulesMap.get(role === 'head_sales' ? 'rop' : 'mop') || [];
                const floor = parseFloat(p.management_kpi_current) || 3;
                
                if (rules.length > 0) {
                    const rule = [...rules].reverse().find(r => avgCompletion >= r.min_threshold);
                    kpiRate = Math.max(rule?.percent || floor, floor);
                } else {
                    kpiRate = floor;
                }
            }

            leaderboard.push({
                userId: p.id,
                name: p.full_name,
                avatar: p.avatar_url,
                role: p.role,
                positionName: p.position_name || null,
                teamId: p.team_id,
                teamName: p.team_name,
                branchId: p.branch_id,
                deposits: totalDeposits,
                takes: totalObjects,
                revenue: totalRevenue,
                targetRevenue: planRevenue,
                targetDeposits: planDeposits,
                targetObjects: planObjects,
                planCompletion: parseFloat(avgCompletion.toFixed(2)),
                rating: parseFloat(rating.toFixed(2)),
                score: rating,
                kpiRate: parseFloat((kpiRate || 0).toFixed(2)) 
            });
        }

        const result = leaderboard.sort((a, b) => b.score - a.score);

        // Cache for 2 minutes - leaderboard changes frequently (Plan 02-04)
        if (cacheService) {
            await cacheService.set(cacheKey, result, 60); // Shorter TTL for competitive data
        }
        return result;
    }
    async getTrends(userId, role, currentStart, currentEnd, branchId = null) {
        const start = new Date(currentStart);
        const end = new Date(currentEnd);
        const duration = end.getTime() - start.getTime();
        const prevStart = new Date(start.getTime() - duration).toISOString();
        const prevEnd = new Date(end.getTime() - duration).toISOString();

        let currentRevenue = 0;
        let prevRevenue = 0;

        if (role === 'realtor' || role === 'mortgage_broker') {
            const current = await this.calculateRealtorKPI(userId, currentStart, currentEnd);
            const prev = await this.calculateRealtorKPI(userId, prevStart, prevEnd);
            currentRevenue = current.metrics?.totalRevenue || 0;
            prevRevenue = prev.metrics?.totalRevenue || 0;
        } else if (role === 'sales_manager') {
            const current = await this.calculateTeamKPI(userId, currentStart, currentEnd);
            const prev = await this.calculateTeamKPI(userId, prevStart, prevEnd);
            currentRevenue = current.metrics?.totalRevenue || 0;
            prevRevenue = prev.metrics?.totalRevenue || 0;
        } else if (role === 'head_sales' || role === 'commercial' || role === 'director') {
            // Gross revenue = SUM(commission_total_fact) for the branch(es)
            // Use the shared query() helper which handles both PG and SQLite
            const buildGrossQuery = (s, e, bId) => {
                const sObj = new Date(s), eObj = new Date(e);
                const sY = sObj.getFullYear(), sM = sObj.getMonth() + 1;
                const eY = eObj.getFullYear(), eM = eObj.getMonth() + 1;
                const sVal = sY * 100 + sM;
                const eVal = eY * 100 + eM;
                let sql = `SELECT COALESCE(SUM(commission_total_fact), 0) as total FROM deal_table_rows WHERE (year * 100 + month) BETWEEN $1 AND $2 AND status IN ('approved', 'active')`;
                let params = [sVal, eVal];
                if (bId && bId !== 'all') {
                    sql += ` AND branch_id::TEXT = $3`;
                    params.push(bId);
                }
                return { sql, params };
            };
            const curQ = buildGrossQuery(currentStart, currentEnd, branchId);
            const prevQ = buildGrossQuery(prevStart, prevEnd, branchId);
            console.log('[getTrends] branchId:', branchId, 'curQ:', curQ.sql, 'params:', curQ.params);
            const curRes = await query(curQ.sql, curQ.params);
            const prevRes = await query(prevQ.sql, prevQ.params);
            console.log('[getTrends] curRes:', curRes.rows[0], 'prevRes:', prevRes.rows[0]);
            currentRevenue = parseFloat(curRes.rows[0]?.total) || 0;
            prevRevenue = parseFloat(prevRes.rows[0]?.total) || 0;
        }

        const growth = prevRevenue === 0 ? (currentRevenue > 0 ? 100 : 0) : ((currentRevenue - prevRevenue) / prevRevenue) * 100;

        return {
            revenue: currentRevenue,
            prev_revenue: prevRevenue,
            growth: Math.round(growth)
        };
    }

    async getCompanyFinancials(startDate, endDate, branchId = null) {
        // 1. Gross Revenue from deal_table_rows
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        const startYear = startDateObj.getFullYear();
        const startMonth = startDateObj.getMonth() + 1;
        const endYear = endDateObj.getFullYear();
        const endMonth = endDateObj.getMonth() + 1;

        let yearMonthFilter = '';
        if (startYear === endYear && startMonth === endMonth) {
            yearMonthFilter = pool ? `year = ${startYear} AND month = ${startMonth}` : `year = ${startYear} AND month = ${startMonth}`;
        } else {
            yearMonthFilter = pool
                ? `CONCAT(year, '-', LPAD(month::text, 2, '0')) >= '${startYear}-${String(startMonth).padStart(2, '0')}'
                   AND CONCAT(year, '-', LPAD(month::text, 2, '0')) <= '${endYear}-${String(endMonth).padStart(2, '0')}'`
                : `printf('%04d-%02d', year, month) >= '${startYear}-${String(startMonth).padStart(2, '0')}'
                   AND printf('%04d-%02d', year, month) <= '${endYear}-${String(endMonth).padStart(2, '0')}'`;
        }

        let branchFilter = '';
        let params = [];
        if (branchId && branchId !== 'all') {
            branchFilter = pool ? ` AND branch_id::TEXT = $1` : ` AND branch_id = ?`;
            params.push(branchId);
        }

        const revQuery = `SELECT COALESCE(SUM(commission_total_fact), 0) as total FROM deal_table_rows WHERE ${yearMonthFilter}${branchFilter} AND status IN ('approved', 'active')`;
        const revRes = pool ? await pool.query(revQuery, params) : { rows: [db.prepare(revQuery).get(...params)] };
        const grossRevenue = parseFloat(revRes.rows[0]?.total) || 0;

        // 2. FOT (Sum of all commissions)
        let fot = 0;
        let usersQuery = `SELECT p.id, ur.role FROM profiles p JOIN user_roles ur ON p.id = ur.user_id WHERE p.is_active = 1`;
        let userParams = [];
        if (branchId && branchId !== 'all') {
            usersQuery += pool ? ` AND p.branch_id = $1` : ` AND p.branch_id = ?`;
            userParams.push(branchId);
        }
        const users = pool ? (await pool.query(usersQuery, userParams)).rows : db.prepare(usersQuery).all(...userParams);

        for (const user of users) {
            if (user.role === 'realtor' || user.role === 'mortgage_broker') {
                const res = await this.calculateRealtorKPI(user.id, startDate, endDate);
                fot += res.metrics.estimatedIncome || 0;
            } else if (user.role === 'sales_manager') {
                const res = await this.calculateTeamKPI(user.id, startDate, endDate);
                if (!res.error) fot += res.metrics.estimatedIncome || 0;
            } else if (user.role === 'head_sales' || user.role === 'commercial') {
                const res = await this.calculateBranchKPI(user.id, startDate, endDate);
                if (!res.error) fot += res.metrics.estimatedIncome || 0;
            }
        }

        return {
            grossRevenue,
            fot,
            netProfit: grossRevenue - fot
        };
    }

    async getDashboardStats(userId, role, startDate, endDate, branchId = null) {
        // Get refresh timestamp for cache key generation (Plan 02-04)
        const refreshTime = aggregationService ? await aggregationService.getLastRefreshTime() : null;

        // Generate cache key
        let cacheKey;
        if (cacheService) {
            const cacheParams = {
                userId,
                role,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                branchId: branchId || 'all',
                cacheVersion: 'v18'
            };
            
            if (refreshTime) {
                cacheParams.refreshTime = refreshTime.toISOString();
            }
            
            cacheKey = cacheService.generateKey('kpi:dashboard', cacheParams);
        } else {
            return { plan_percent: 0, active_deals: 0 };
        }

        // TEMP: Disable cache for debugging
        // const cached = await cacheService.get(cacheKey);
        const cached = null;
        if (cached) {
            return cached;
        }

        let stats = {
            rating: 0,
            rating_change: 0,
            plan_percent: 0,
            active_deals: 0,
            team_rank: 0,
            trends: { revenue: 0, growth: 0 },
            active_branches: 0,
            companyFinancials: null
        };

        if (role === 'director' || role === 'commercial') {
            stats.companyFinancials = await this.getCompanyFinancials(startDate, endDate, branchId);
        }

        const trends = await this.getTrends(userId, role, startDate, endDate, branchId);
        stats.trends = trends;

        // Convert 'all' to null for proper filtering
        const effectiveBranchId = (branchId === 'all' || branchId === undefined) ? null : branchId;

        const leaderboard = await this.getLeaderboard(startDate, endDate, effectiveBranchId);
        const myEntry = leaderboard.find(u => u.userId === userId);
        const myRank = leaderboard.findIndex(u => u.userId === userId) + 1;

        const isDirector = role === 'director' || role === 'admin' || role === 'commercial';
        const isManager = role === 'head_sales' || role === 'sales_manager';

        // Use overall plan completion from leaderboard (based on all 3 metrics)
        // If user not in leaderboard (e.g. manager with no personal deals), 
        // use average of their subordinates
        if (myEntry && (myEntry.planCompletion || 0) > 0) {
            stats.plan_percent = myEntry.planCompletion;
        } else if (isDirector || isManager) {
            const subordinates = leaderboard.filter(u => u.userId !== userId && (u.planCompletion || 0) > 0);
            if (subordinates.length > 0) {
                const avgCompletion = subordinates.reduce((sum, u) => sum + (u.planCompletion || 0), 0) / subordinates.length;
                stats.plan_percent = Math.round(avgCompletion);
            }
        }

        stats.rating = myRank > 0 ? myRank : '-';

        // Build year/month filter for active deals
        const startDateObj = new Date(startDate);
        const startYear = startDateObj.getFullYear();
        const startMonth = startDateObj.getMonth() + 1;
        const endDateObj = new Date(endDate);
        const endYear = endDateObj.getFullYear();
        const endMonth = endDateObj.getMonth() + 1;

        let queryParams = [];
        let activeQuery = '';
        const startVal = startYear * 100 + startMonth;
        const endVal = endYear * 100 + endMonth;
        const yearMonthFilter = `(year * 100 + month) BETWEEN $${queryParams.length + 1} AND $${queryParams.length + 2}`;
        queryParams.push(startVal, endVal);

        if (isDirector) {
            // Count all deals for current period, respect branchId
            let bFilter = '';
            if (branchId && branchId !== 'all') {
                bFilter = pool ? ` AND branch_id::TEXT = $${queryParams.length + 1}` : ` AND branch_id = ?`;
                queryParams.push(branchId);
            }
            activeQuery = `SELECT COUNT(*) as count FROM deal_table_rows WHERE ${yearMonthFilter}${bFilter} AND status IN ('approved', 'active')`;
        } else if (isManager) {
            let teamIdSql = pool ? `SELECT branch_id, team_id FROM profiles WHERE id = $1` : `SELECT branch_id, team_id FROM profiles WHERE id = ?`;
            let teamIdRes = pool ? await query(teamIdSql, [userId]) : { rows: [db.prepare(teamIdSql).get(userId)] };
            let p = teamIdRes.rows[0];
            if (role === 'head_sales') {
                activeQuery = `SELECT COUNT(*) as count FROM deal_table_rows WHERE branch_id::TEXT = ${pool ? '$' + (queryParams.length + 1) : '?'} AND ${yearMonthFilter} AND status IN ('approved', 'active')`;
                queryParams.push(p?.branch_id);
            } else {
                activeQuery = `SELECT COUNT(*) as count FROM deal_table_rows WHERE team_id::TEXT = ${pool ? '$' + (queryParams.length + 1) : '?'} AND ${yearMonthFilter} AND status IN ('approved', 'active')`;
                queryParams.push(p?.team_id || null);
            }
        } else {
            // Count deals where user is the agent
            const nameSearch = myEntry?.name ? myEntry.name.split(' ').pop() : '';
            if (pool) {
                activeQuery = `SELECT COUNT(*) as count FROM deal_table_rows dtr LEFT JOIN profiles pf ON dtr.agent_name = pf.full_name WHERE (pf.id = $${queryParams.length + 1} OR dtr.agent_name = $${queryParams.length + 2} OR (dtr.agent_name LIKE '%' || $${queryParams.length + 3} || '%')) AND ${yearMonthFilter} AND dtr.status IN ('approved', 'active')`;
                queryParams.push(userId, myEntry?.name || null, nameSearch || '');
            } else {
                activeQuery = `SELECT COUNT(*) as count FROM deal_table_rows dtr LEFT JOIN profiles pf ON dtr.agent_name = pf.full_name WHERE (pf.id = ? OR dtr.agent_name = ? OR (dtr.agent_name LIKE '%' || ? || '%')) AND ${yearMonthFilter} AND dtr.status IN ('approved', 'active')`;
                // Keep queryParams as is since they were pushed by yearMonthFilter logic, 
                // but we need the agent params at the START if they appear first in SQL.
                // Re-creating queryParams to be safe and ordered.
                const yearMonthParams = [...queryParams];
                queryParams = [userId, myEntry?.name || '', nameSearch || '', ...yearMonthParams];
            }
        }

        if (pool) {
            const res = await query(activeQuery, queryParams);
            stats.active_deals = parseInt(res.rows[0]?.count || 0);

            const branchRes = await query('SELECT COUNT(*) as count FROM branches');
            stats.active_branches = parseInt(branchRes.rows[0]?.count || 0);
        } else {
            const res = db.prepare(activeQuery).get(...queryParams);
            stats.active_deals = res?.count || 0;

            const branchRes = db.prepare('SELECT COUNT(*) as count FROM branches').get();
            stats.active_branches = branchRes?.count || 0;
        }

        // Cache for 2 minutes (Plan 02-04)
        // Cache the result (unified cacheService)
        if (cacheService) {
            await cacheService.set(cacheKey, stats, 300); // 5 minutes TTL
        }
        return stats;
    }

    /**
     * Calculate Dual KPI for management roles
     * Returns both personal and management KPIs for МОП, РОП, Commercial Director
     * @param {string} userId - User ID
     * @param {string} role - User role
     * @param {string} startDate - ISO date string
     * @param {string} endDate - ISO date string
     * @param {string} period - 'month' or 'quarter'
     * @param {string} branchId - Optional branch ID for РОП/Commercial
     * @returns {Promise<Object>} { hasDualKpi: boolean, kpis: Array }
     */
    async calculateDualKPI(userId, role, startDate, endDate, period = 'month', branchId = null) {
        // Get refresh timestamp for cache key generation (Plan 02-04)
        const refreshTime = aggregationService ? await aggregationService.getLastRefreshTime() : null;

        // Generate cache key
        let cacheKey;
        if (cacheService) {
            const cacheParams = {
                userId,
                startDate,
                endDate,
                period,
                branchId: branchId || 'all',
                cacheVersion: 'v18' // KPI + manual finance gross/personal separation
            };
            
            if (refreshTime) {
                cacheParams.refreshTime = refreshTime.toISOString();
            }
            
            cacheKey = cacheService.generateKey('kpi:dual', cacheParams);
        } else {
            // Minimal fallback if cacheService is missing (unlikely in production)
            return { hasDualKpi: false, kpis: [] };
        }
        
        // Check cache (using unified cacheService)
        const cached = await cacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

        const KpiCalculatorFactory = require('./kpi/KpiCalculatorFactory').default || require('./kpi/KpiCalculatorFactory');
        const factory = new KpiCalculatorFactory(this);

        // Check if role has dual KPI
        const hasDualKpi = factory.hasDualKpi(role);
        console.log(`[KPI Dual] Role: ${role}, hasDualKpi: ${hasDualKpi}`);

        // Get calculators for this role
        const calculators = factory.getCalculators(role);
        console.log(`[KPI Dual] Number of calculators: ${calculators.length}`);

        // Calculate KPIs
        const kpis = [];
        console.log(`[KPI Dual] Calculating for user ${userId}, role ${role}, period ${period}, startDate ${startDate}, endDate ${endDate}`);
        console.log(`[KPI Dual] Calculators: ${calculators.map(c => c.constructor.name).join(', ')}`);
        for (const calculator of calculators) {
            let result;
            try {
                console.log(`[KPI Dual] Running calculator: ${calculator.constructor.name}`);
                result = await calculator.calculate(userId, startDate, endDate, period, branchId);
                console.log(`[KPI Dual] Result from ${calculator.constructor.name}:`, JSON.stringify({
                    type: result?.type,
                    metrics: result?.metrics ? {
                        totalRevenue: result.metrics.totalRevenue,
                        estimatedIncome: result.metrics.estimatedIncome,
                        currentPercent: result.metrics.currentPercent,
                        planCompletion: result.metrics.planCompletion
                    } : null
                }, null, 2));
                
                // If quarterly, calculate breakdown by month
                if (period === 'quarter') {
                    const monthlyResults = [];
                    const start = new Date(startDate);
                    // Adjust for UTC/Local offset (12 hours) to ensure we start in the correct month
                    const adjustedBase = new Date(start.getTime() + 12 * 60 * 60 * 1000);
                    const baseYear = adjustedBase.getUTCFullYear();
                    const baseMonth = adjustedBase.getUTCMonth();

                    // Get 3 months of the quarter
                    for (let i = 0; i < 3; i++) {
                        const monthStart = new Date(baseYear, baseMonth + i, 1);
                        const monthEnd = new Date(baseYear, baseMonth + i + 1, 0, 23, 59, 59, 999);

                        try {
                            const mResult = await calculator.calculate(
                                userId,
                                monthStart.toISOString(),
                                monthEnd.toISOString(),
                                'month',
                                branchId
                            );
                            monthlyResults.push(this._ensureMetrics(mResult, role));
                        } catch (mError) {
                            console.error(`[KPI Service] Error calculating monthly breakdown for ${userId}:`, mError);
                            monthlyResults.push(this._ensureMetrics(null, role));
                        }
                    }
                    result.monthly = monthlyResults;
                }
            } catch (error) {
                console.error(`[KPI Service] Error in Dual KPI calculator for ${userId}:`, error);
                result = null;
            }

            kpis.push(this._ensureMetrics(result, role));
        }

        const result = {
            hasDualKpi,
            kpis
        };

        // Cache the result (unified cacheService)
        if (cacheService) {
            await cacheService.set(cacheKey, result, 300); // Standard 5 min TTL
        }

        return result;
    }
    async getRevenueForUser(userId, startDate, endDate, role = 'realtor') {
        let fullName, firstName, lastName;
        if (pool) {
            const res = await query('SELECT full_name, first_name, last_name FROM profiles WHERE id = $1', [userId]);
            fullName = res.rows[0]?.full_name;
            firstName = res.rows[0]?.first_name;
            lastName = res.rows[0]?.last_name;
        } else {
            const res = db.prepare('SELECT full_name, first_name, last_name FROM profiles WHERE id = ?').get(userId);
            fullName = res?.full_name;
            firstName = res?.first_name;
            lastName = res?.last_name;
        }

        // Collect all possible name variants for matching (important for brokers)
        const nameVariants = new Set();
        if (fullName) nameVariants.add(fullName.trim().toLowerCase());
        if (firstName && lastName) {
            nameVariants.add(`${lastName.trim()} ${firstName.trim()}`.toLowerCase());
            nameVariants.add(`${firstName.trim()} ${lastName.trim()}`.toLowerCase());
        }
        const names = Array.from(nameVariants);
        // Fallback if no names found (unlikely but safe)
        if (names.length === 0) names.push('__NON_EXISTENT_NAME__');

        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        const startYear = startDateObj.getFullYear();
        const startMonth = startDateObj.getMonth() + 1;
        const endYear = endDateObj.getFullYear();
        const endMonth = endDateObj.getMonth() + 1;

        // Build year-month comparison logic (numeric)
        const startVal = startYear * 100 + startMonth;
        const endVal = endYear * 100 + endMonth;
        const yearMonthFilter = `(dtr.year * 100 + dtr.month) BETWEEN ${startVal} AND ${endVal}`;

        const revenueSql = pool
            ? `SELECT 
                COALESCE(SUM(dtr.commission_total_fact), 0) as revenue,
                COALESCE(SUM(dtr.agent_income), 0) as personal_income,
                COALESCE(SUM(dtr.mop_revenue), 0) as mop_revenue,
                COALESCE(SUM(dtr.rop_payout), 0) as rop_payout,
                COALESCE(SUM(dtr.mortgage_deduction), 0) as mortgage_deduction,
                COALESCE(SUM(dtr.other_expenses), 0) as other_expenses,
                COUNT(*) as deal_count
               FROM deal_table_rows dtr
               WHERE (dtr.agent_id::TEXT = $1 
                      OR dtr.mop_id::TEXT = $1
                      OR LOWER(TRIM(dtr.agent_name)) = ANY($2::TEXT[]) 
                      OR LOWER(TRIM(dtr.mop_name)) = ANY($2::TEXT[])) 
                 AND ${yearMonthFilter}
                 AND dtr.status IN ('approved', 'active')`
             : `SELECT 
                COALESCE(SUM(CASE WHEN dtr.agent_id = ? OR LOWER(TRIM(dtr.agent_name)) IN (${names.map(() => '?').join(',')}) THEN dtr.commission_total_fact ELSE 0 END), 0) as revenue,
                COALESCE(SUM(CASE WHEN dtr.agent_id = ? OR LOWER(TRIM(dtr.agent_name)) IN (${names.map(() => '?').join(',')}) THEN dtr.agent_income ELSE 0 END), 0) as personal_income,
                COALESCE(SUM(CASE WHEN dtr.mop_id = ? OR LOWER(TRIM(dtr.mop_name)) IN (${names.map(() => '?').join(',')}) THEN dtr.mop_revenue ELSE 0 END), 0) as mop_revenue,
                COALESCE(SUM(CASE WHEN dtr.rop_id = ? THEN dtr.rop_payout ELSE 0 END), 0) as rop_payout,
                COALESCE(SUM(CASE WHEN dtr.agent_id = ? THEN dtr.mortgage_deduction ELSE 0 END), 0) as mortgage_deduction,
                COALESCE(SUM(dtr.other_expenses), 0) as other_expenses,
                COUNT(*) as deal_count
               FROM deal_table_rows dtr
               WHERE (dtr.agent_id = ? 
                      OR dtr.mop_id = ?
                      OR LOWER(TRIM(dtr.agent_name)) IN (${names.map(() => '?').join(',')}) 
                      OR LOWER(TRIM(dtr.mop_name)) IN (${names.map(() => '?').join(',')})) 
                 AND ${yearMonthFilter}
                 AND dtr.status IN ('approved', 'active')`;

        const params = pool
            ? [userId, names]
            : [userId, ...names, userId, ...names, userId, ...names, userId, userId, userId, userId, ...names, ...names];
        const res = await query(revenueSql, params);
        const row = res.rows[0] || {};

        const manualGross = pool
            ? await sumManualGross(
                  userId,
                  startDateObj.toISOString(),
                  endDateObj.toISOString(),
              )
            : 0;
        const dealRevenue = parseFloat(row.revenue) || 0;

        return {
            revenue: dealRevenue + manualGross,
            personal_income: parseFloat(row.personal_income) || 0,
            mop_revenue: parseFloat(row.mop_revenue) || 0,
            rop_payout: parseFloat(row.rop_payout) || 0,
            mortgage_deduction: parseFloat(row.mortgage_deduction) || 0,
            other_expenses: parseFloat(row.other_expenses) || 0,
            deal_count: parseInt(row.deal_count) || 0
        };
    }
}

const kpiService = new KpiService();

// Support both CommonJS and ES module imports
module.exports = kpiService;
module.exports.default = kpiService;
export default kpiService;
