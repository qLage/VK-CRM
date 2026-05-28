import express, { Request, Response, Router } from 'express';
import { authenticateToken, requireAccessLevel } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import DealTableRow from '../models/DealTableRow';
import DealFinanceIntegration from '../services/dealFinanceIntegration';
import { query } from '../db';
import { emitDealEvent, emitKpiEvent } from '../services/realtime-broadcaster.service';
import cacheService from '../lib/cache.service';
import * as notificationService from '../services/notificationService';
import { v4 as uuidv4 } from 'uuid';
import websocketService from '../services/websocket.service';
import aggregationService from '../services/aggregation.service';

const router: Router = express.Router();

// Helper function to strip PostgREST operators (eq., neq., etc.)
const stripOperator = (value: any): any => {
  if (typeof value === 'string' && value.startsWith('eq.')) {
    return value.substring(3);
  }
  return value;
};

// Get all rows with filters and pagination (legacy endpoint)
router.get('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { year, month, agent_name, agent_id, rop_name, rop_id, document_type, team_id, branch_id, page, limit, cursor, compact } = req.query;

    const filters: any = {};
    if (year) filters.year = parseInt(stripOperator(year));
    if (month) filters.month = parseInt(stripOperator(month));
    if (agent_id) filters.agent_id = stripOperator(agent_id);
    if (agent_name) filters.agent_name = stripOperator(agent_name);
    if (rop_id) filters.rop_id = stripOperator(rop_id);
    if (rop_name) filters.rop_name = stripOperator(rop_name);
    if (document_type) filters.document_type = stripOperator(document_type);
    if (team_id) filters.team_id = stripOperator(team_id);
    if (branch_id) filters.branch_id = stripOperator(branch_id);

    console.log('🔍 BACKEND: Fetching deals with filters:', filters);

    // Support both cursor-based and page-based pagination
    const pagination = {
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 100,
      cursor: cursor || null,
      compact: compact === '1' || compact === 'true'
    };

    const result = await DealTableRow.list(filters, pagination);

    console.log('📊 BACKEND: Found deals:', {
      count: result.rows.length,
      total: result.pagination?.total || result.rows.length
    });

    res.json(result);
  } catch (error: any) {
    console.error('Error fetching deal table rows:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Get employee's personal deals (for realtors) or all deals (for directors)
router.get('/my-deals', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { year, month, page, limit, agent_name, agent_id, compact, dealStatus, minAmount, maxAmount, branch_id, team_id, isMyDealsOnly } = req.query;

    const currentUserId = (req.user as any).id;
    const access_level = (req.user as any).access_level || 0;

    // Get user's full name from profile (fallback if no specific agent requested)
    const profileResult = await query('SELECT full_name FROM profiles WHERE id = $1', [currentUserId]);
    if (!profileResult.rows[0]) {
      res.status(404).json({ error: { message: 'Profile not found' } });
      return;
    }

    const employeeName = profileResult.rows[0].full_name;

    const filters: any = {};
    if (year) filters.year = parseInt(year as string);
    if (month) filters.month = parseInt(month as string);
    if (dealStatus) filters.dealStatus = dealStatus;

    // Only Directors can use branch/team and amount filters
    if (access_level >= 90) {
      if (branch_id) filters.branch_id = stripOperator(branch_id);
      if (team_id) filters.team_id = stripOperator(team_id);
      if (minAmount) filters.minAmount = parseFloat(minAmount as string);
      if (maxAmount) filters.maxAmount = parseFloat(maxAmount as string);
    }

    const pagination = {
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 100,
      compact: compact === '1' || compact === 'true'
    };

    let result: any;

    const shouldShowOnlyPersonalDeals = isMyDealsOnly === 'true';

    // If a specific agent is requested (drill-down from team), use that agent
    const isDrillDown = !!agent_name || !!agent_id;

    if (shouldShowOnlyPersonalDeals) {
      // If drilling down to a specific employee, use only their filters
      if (isDrillDown) {
        if (agent_id) filters.agent_id = agent_id as string;
        if (agent_name) filters.agent_name = agent_name as string;
      } else {
        filters.agent_id = currentUserId;
        filters.agent_name = employeeName;
      }
      console.log('👤 BACKEND: Fetching personal deals for:', filters.agent_name || filters.agent_id);
      result = await DealTableRow.list(filters, pagination);
    } else if (access_level >= 90 && !isDrillDown) {
      console.log('👤 BACKEND: Fetching ALL company deals for director');
      result = await DealTableRow.getCompanyDeals(filters, pagination);
    } else {
      // If drilling down to a specific employee, use only their filters
      if (isDrillDown) {
        if (agent_id) filters.agent_id = agent_id as string;
        if (agent_name) filters.agent_name = agent_name as string;
      } else {
        filters.agent_id = currentUserId;
        filters.agent_name = employeeName;
      }
      console.log('👤 BACKEND: Fetching personal deals for:', filters.agent_name || filters.agent_id);
      result = await DealTableRow.list(filters, pagination);
    }

    console.log('👤 BACKEND: Query returned', result.rows.length, 'deals');

    // Calculate totals for the filtered results
    const totals = await DealTableRow.getTotals(filters);

    res.json({
      ...result,
      totals: totals
    });
  } catch (error: any) {
    console.error('Error fetching employee deals:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Get team deals GROUPED by employee (for team leads - МОП and above, and employees with team)
router.get('/team-deals-grouped', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { year, month, team_id, dealStatus, minAmount, maxAmount } = req.query;

    const access_level = (req.user as any).access_level || 0;
    const userId = (req.user as any).id;

    // Employees (< 50) must have a team to access this endpoint
    if (access_level < 50) {
      const profileResult = await query('SELECT team_id FROM profiles WHERE id = $1', [userId]);
      if (!profileResult.rows[0] || !profileResult.rows[0].team_id) {
        res.status(403).json({ error: { message: 'Доступ запрещен' } });
        return;
      }
    }

    // Use provided team_id or get from user's profile
    let teamId = team_id as string;
    if (!teamId) {
      const profileResult = await query('SELECT team_id FROM profiles WHERE id = $1', [(req.user as any).id]);
      if (!profileResult.rows[0] || !profileResult.rows[0].team_id) {
        res.status(404).json({ error: { message: 'Team not found' } });
        return;
      }
      teamId = profileResult.rows[0].team_id;
    }

    // Get deals grouped by employee
    let sql = `
      SELECT
        agent_name,
        agent_id,
        COUNT(*) as deal_count,
        SUM(commission_seller_plan) as total_commission_seller_plan,
        SUM(commission_buyer_plan) as total_commission_buyer_plan,
        SUM(commission_seller_fact) as total_commission_seller_fact,
        SUM(commission_buyer_fact) as total_commission_buyer_fact,
        SUM(commission_total_fact) as total_commission_fact,
        SUM(agent_income) as total_agent_income,
        SUM(mop_revenue) as total_mop_revenue,
        SUM(rop_payout) as total_rop_payout,
        SUM(mortgage_deduction) as total_mortgage_deduction,
        SUM(other_expenses) as total_other_expenses,
        SUM(company_revenue) as total_company_revenue,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count
      FROM deal_table_rows
      WHERE team_id = $1::uuid
    `;

    const params: any[] = [teamId];
    console.log('👥 BACKEND: /team-deals-grouped query', { teamId, params });
    let paramIndex = 2;

    if (year) {
      sql += ` AND year = $${paramIndex}`;
      params.push(parseInt(year as string));
      paramIndex++;
    }

    if (month) {
      sql += ` AND month = $${paramIndex}`;
      params.push(parseInt(month as string));
      paramIndex++;
    }

    if (dealStatus && dealStatus !== 'all') {
      sql += ` AND status = $${paramIndex}`;
      params.push(dealStatus);
      paramIndex++;
    }

    // Only Directors can use amount filters
    if (access_level >= 90) {
      if (minAmount) {
        sql += ` AND deal_amount >= $${paramIndex}`;
        params.push(parseFloat(minAmount as string));
        paramIndex++;
      }

      if (maxAmount) {
        sql += ` AND deal_amount <= $${paramIndex}`;
        params.push(parseFloat(maxAmount as string));
        paramIndex++;
      }
    }

    sql += ` GROUP BY agent_name, agent_id ORDER BY agent_name`;

    const groupedResult = await query(sql, params);

    // Calculate team totals
    const teamTotals = {
      deal_count: 0,
      total_commission_seller_plan: 0,
      total_commission_buyer_plan: 0,
      total_commission_seller_fact: 0,
      total_commission_buyer_fact: 0,
      total_commission_fact: 0,
      total_agent_income: 0,
      total_mop_revenue: 0,
      total_rop_payout: 0,
      total_mortgage_deduction: 0,
      total_other_expenses: 0,
      total_company_revenue: 0
    };

    groupedResult.rows.forEach((row: any) => {
      teamTotals.deal_count += parseInt(row.deal_count);
      teamTotals.total_commission_seller_plan += parseFloat(row.total_commission_seller_plan || 0);
      teamTotals.total_commission_buyer_plan += parseFloat(row.total_commission_buyer_plan || 0);
      teamTotals.total_commission_seller_fact += parseFloat(row.total_commission_seller_fact || 0);
      teamTotals.total_commission_buyer_fact += parseFloat(row.total_commission_buyer_fact || 0);
      teamTotals.total_commission_fact += parseFloat(row.total_commission_fact || 0);
      teamTotals.total_agent_income += parseFloat(row.total_agent_income || 0);
      teamTotals.total_mop_revenue += parseFloat(row.total_mop_revenue || 0);
      teamTotals.total_rop_payout += parseFloat(row.total_rop_payout || 0);
      teamTotals.total_mortgage_deduction += parseFloat(row.total_mortgage_deduction || 0);
      teamTotals.total_other_expenses += parseFloat(row.total_other_expenses || 0);
      teamTotals.total_company_revenue += parseFloat(row.total_company_revenue || 0);
    });

    res.json({
      groups: groupedResult.rows,
      totals: teamTotals
    });
  } catch (error: any) {
    console.error('Error fetching grouped team deals:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Get team deals (for team leads - МОП and above)
router.get('/team-deals', authenticateToken, requireAccessLevel(50), async (req: Request, res: Response): Promise<void> => {
  try {
    const { year, month, page, limit, compact, dealStatus, minAmount, maxAmount } = req.query;

    // Get user's profile to find their team
    const profileResult = await query('SELECT team_id FROM profiles WHERE id = $1', [(req.user as any).id]);

    if (!profileResult.rows[0] || !profileResult.rows[0].team_id) {
      res.status(404).json({ error: { message: 'Team not found' } });
      return;
    }

    const teamId = profileResult.rows[0].team_id;
    const access_level = (req.user as any).access_level || 0;

    const filters: any = {};
    if (year) filters.year = parseInt(year as string);
    if (month) filters.month = parseInt(month as string);
    if (dealStatus) filters.dealStatus = dealStatus;

    // Only Directors can use amount filters
    if (access_level >= 90) {
      if (minAmount) filters.minAmount = parseFloat(minAmount as string);
      if (maxAmount) filters.maxAmount = parseFloat(maxAmount as string);
    }

    const pagination = {
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 100,
      compact: compact === '1' || compact === 'true'
    };

    console.log('👥 BACKEND: Fetching team deals for team:', teamId);

    const result = await DealTableRow.getTeamDeals(teamId, filters, pagination);

    // Calculate totals for the filtered results
    const totals = await DealTableRow.getTotals({ ...filters, team_id: teamId });

    res.json({
      ...result,
      totals: totals
    });
  } catch (error: any) {
    console.error('Error fetching team deals:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Get branch deals GROUPED by team (for branch managers - РОП and Commercial Director)
router.get('/branch-deals-grouped', authenticateToken, requireAccessLevel(90), async (req: Request, res: Response): Promise<void> => {
  try {
    const { year, month, branch_id, dealStatus, minAmount, maxAmount } = req.query;

    const access_level = (req.user as any).access_level || 0;

    // Use provided branch_id or get from user's profile
    let branchId = branch_id as string;
    if (!branchId) {
      const profileResult = await query('SELECT branch_id FROM profiles WHERE id = $1', [(req.user as any).id]);
      if (!profileResult.rows[0] || !profileResult.rows[0].branch_id) {
        res.status(404).json({ error: { message: 'Branch not found' } });
        return;
      }
      branchId = profileResult.rows[0].branch_id;
    }

    // Get deals grouped by team
    let sql = `
      SELECT
        d.team_id,
        t.name as team_name,
        COUNT(*) as deal_count,
        SUM(d.commission_seller_plan) as total_commission_seller_plan,
        SUM(d.commission_buyer_plan) as total_commission_buyer_plan,
        SUM(d.commission_seller_fact) as total_commission_seller_fact,
        SUM(d.commission_buyer_fact) as total_commission_buyer_fact,
        SUM(d.commission_total_fact) as total_commission_fact,
        SUM(d.agent_income) as total_agent_income,
        SUM(d.mop_revenue) as total_mop_revenue,
        SUM(d.rop_payout) as total_rop_payout,
        SUM(d.mortgage_deduction) as total_mortgage_deduction,
        SUM(d.other_expenses) as total_other_expenses,
        SUM(d.company_revenue) as total_company_revenue,
        COUNT(*) FILTER (WHERE d.status = 'pending') as pending_count
      FROM deal_table_rows d
      LEFT JOIN teams t ON t.id::uuid = d.team_id
      WHERE d.branch_id = $1
    `;

    const params: any[] = [branchId];
    console.log('🏢 BACKEND: /branch-deals-grouped query', { branchId, params });
    let paramIndex = 2;

    if (year) {
      sql += ` AND d.year = $${paramIndex}`;
      params.push(parseInt(year as string));
      paramIndex++;
    }

    if (month) {
      sql += ` AND d.month = $${paramIndex}`;
      params.push(parseInt(month as string));
      paramIndex++;
    }

    if (dealStatus && dealStatus !== 'all') {
      sql += ` AND d.status = $${paramIndex}`;
      params.push(dealStatus);
      paramIndex++;
    }

    // Only Directors can use amount filters
    if (access_level >= 90) {
      if (minAmount) {
        sql += ` AND d.deal_amount >= $${paramIndex}`;
        params.push(parseFloat(minAmount as string));
        paramIndex++;
      }

      if (maxAmount) {
        sql += ` AND d.deal_amount <= $${paramIndex}`;
        params.push(parseFloat(maxAmount as string));
        paramIndex++;
      }
    }

    sql += ` GROUP BY d.team_id, t.name ORDER BY t.name`;

    const groupedResult = await query(sql, params);

    // Calculate branch totals
    const branchTotals = {
      deal_count: 0,
      total_commission_seller_plan: 0,
      total_commission_buyer_plan: 0,
      total_commission_seller_fact: 0,
      total_commission_buyer_fact: 0,
      total_commission_fact: 0,
      total_agent_income: 0,
      total_mop_revenue: 0,
      total_rop_payout: 0,
      total_mortgage_deduction: 0,
      total_other_expenses: 0,
      total_company_revenue: 0
    };

    groupedResult.rows.forEach((row: any) => {
      branchTotals.deal_count += parseInt(row.deal_count);
      branchTotals.total_commission_seller_plan += parseFloat(row.total_commission_seller_plan || 0);
      branchTotals.total_commission_buyer_plan += parseFloat(row.total_commission_buyer_plan || 0);
      branchTotals.total_commission_seller_fact += parseFloat(row.total_commission_seller_fact || 0);
      branchTotals.total_commission_buyer_fact += parseFloat(row.total_commission_buyer_fact || 0);
      branchTotals.total_commission_fact += parseFloat(row.total_commission_fact || 0);
      branchTotals.total_agent_income += parseFloat(row.total_agent_income || 0);
      branchTotals.total_mop_revenue += parseFloat(row.total_mop_revenue || 0);
      branchTotals.total_rop_payout += parseFloat(row.total_rop_payout || 0);
      branchTotals.total_mortgage_deduction += parseFloat(row.total_mortgage_deduction || 0);
      branchTotals.total_other_expenses += parseFloat(row.total_other_expenses || 0);
      branchTotals.total_company_revenue += parseFloat(row.total_company_revenue || 0);
    });

    res.json({
      groups: groupedResult.rows,
      totals: branchTotals
    });
  } catch (error: any) {
    console.error('Error fetching grouped branch deals:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Get company deals GROUPED by branch (for directors - Commercial Director level 90+)
router.get('/company-deals-grouped', authenticateToken, requireAccessLevel(90), async (req: Request, res: Response): Promise<void> => {
  try {
    const { year, month, dealStatus, minAmount, maxAmount } = req.query;

    const access_level = (req.user as any).access_level || 0;

    console.log('🏢 BACKEND: /company-deals-grouped called', {
      user_id: (req.user as any).id,
      access_level,
      filters: { year, month, dealStatus, minAmount, maxAmount }
    });

    // Get deals grouped by branch
    let sql = `
      SELECT
        d.branch_id,
        b.name as branch_name,
        COUNT(*) as deal_count,
        SUM(d.commission_seller_plan) as total_commission_seller_plan,
        SUM(d.commission_buyer_plan) as total_commission_buyer_plan,
        SUM(d.commission_seller_fact) as total_commission_seller_fact,
        SUM(d.commission_buyer_fact) as total_commission_buyer_fact,
        SUM(d.commission_total_fact) as total_commission_fact,
        SUM(d.agent_income) as total_agent_income,
        SUM(d.mop_revenue) as total_mop_revenue,
        SUM(d.rop_payout) as total_rop_payout,
        SUM(d.mortgage_deduction) as total_mortgage_deduction,
        SUM(d.other_expenses) as total_other_expenses,
        SUM(d.company_revenue) as total_company_revenue,
        COUNT(*) FILTER (WHERE d.status = 'pending') as pending_count
      FROM deal_table_rows d
      LEFT JOIN branches b ON b.id::uuid = d.branch_id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (year) {
      sql += ` AND d.year = $${paramIndex}`;
      params.push(parseInt(year as string));
      paramIndex++;
    }

    if (month) {
      sql += ` AND d.month = $${paramIndex}`;
      params.push(parseInt(month as string));
      paramIndex++;
    }

    if (dealStatus && dealStatus !== 'all') {
      sql += ` AND d.status = $${paramIndex}`;
      params.push(dealStatus);
      paramIndex++;
    }

    // Only Directors can use amount filters
    if (access_level >= 90) {
      if (minAmount) {
        sql += ` AND d.deal_amount >= $${paramIndex}`;
        params.push(parseFloat(minAmount as string));
        paramIndex++;
      }

      if (maxAmount) {
        sql += ` AND d.deal_amount <= $${paramIndex}`;
        params.push(parseFloat(maxAmount as string));
        paramIndex++;
      }
    }

    sql += ` GROUP BY d.branch_id, b.name ORDER BY b.name`;

    console.log('🏢 BACKEND: Executing company-deals-grouped query', { sql, params });
    const groupedResult = await query(sql, params);
    console.log('🏢 BACKEND: Found branches:', groupedResult.rows.length);

    // Calculate company totals
    const companyTotals = {
      deal_count: 0,
      total_commission_seller_plan: 0,
      total_commission_buyer_plan: 0,
      total_commission_seller_fact: 0,
      total_commission_buyer_fact: 0,
      total_commission_fact: 0,
      total_agent_income: 0,
      total_mop_revenue: 0,
      total_rop_payout: 0,
      total_mortgage_deduction: 0,
      total_other_expenses: 0,
      total_company_revenue: 0
    };

    groupedResult.rows.forEach((row: any) => {
      companyTotals.deal_count += parseInt(row.deal_count);
      companyTotals.total_commission_seller_plan += parseFloat(row.total_commission_seller_plan || 0);
      companyTotals.total_commission_buyer_plan += parseFloat(row.total_commission_buyer_plan || 0);
      companyTotals.total_commission_seller_fact += parseFloat(row.total_commission_seller_fact || 0);
      companyTotals.total_commission_buyer_fact += parseFloat(row.total_commission_buyer_fact || 0);
      companyTotals.total_commission_fact += parseFloat(row.total_commission_fact || 0);
      companyTotals.total_agent_income += parseFloat(row.total_agent_income || 0);
      companyTotals.total_mop_revenue += parseFloat(row.total_mop_revenue || 0);
      companyTotals.total_rop_payout += parseFloat(row.total_rop_payout || 0);
      companyTotals.total_mortgage_deduction += parseFloat(row.total_mortgage_deduction || 0);
      companyTotals.total_other_expenses += parseFloat(row.total_other_expenses || 0);
      companyTotals.total_company_revenue += parseFloat(row.total_company_revenue || 0);
    });

    res.json({
      groups: groupedResult.rows,
      totals: companyTotals
    });
  } catch (error: any) {
    console.error('Error fetching grouped company deals:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Get branch deals (for branch managers - РОП level 90+)
router.get('/branch-deals', authenticateToken, requireAccessLevel(90), async (req: Request, res: Response): Promise<void> => {
  try {
    const { year, month, page, limit, compact, dealStatus, minAmount, maxAmount } = req.query;

    // Get user's profile to find their branch
    const profileResult = await query('SELECT branch_id FROM profiles WHERE id = $1', [(req.user as any).id]);

    if (!profileResult.rows[0] || !profileResult.rows[0].branch_id) {
      res.status(404).json({ error: { message: 'Branch not found' } });
      return;
    }

    const branchId = profileResult.rows[0].branch_id;

    const filters: any = {};
    if (year) filters.year = parseInt(year as string);
    if (month) filters.month = parseInt(month as string);
    if (dealStatus) filters.dealStatus = dealStatus;
    if (minAmount) filters.minAmount = parseFloat(minAmount as string);
    if (maxAmount) filters.maxAmount = parseFloat(maxAmount as string);

    const pagination = {
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 100,
      compact: compact === '1' || compact === 'true'
    };

    console.log('🏢 BACKEND: Fetching branch deals for branch:', branchId);

    const result = await DealTableRow.getBranchDeals(branchId, filters, pagination);

    res.json(result);
  } catch (error: any) {
    console.error('Error fetching branch deals:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Get company deals (for directors)
router.get('/company-deals', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { year, month, page, limit, compact, dealStatus, minAmount, maxAmount } = req.query;

    // Check if user is director
    if ((req.user as any).role !== 'director') {
      res.status(403).json({ error: { message: 'Access denied' } });
      return;
    }

    const filters: any = {};
    if (year) filters.year = parseInt(year as string);
    if (month) filters.month = parseInt(month as string);
    if (dealStatus) filters.dealStatus = dealStatus;
    if (minAmount) filters.minAmount = parseFloat(minAmount as string);
    if (maxAmount) filters.maxAmount = parseFloat(maxAmount as string);

    const pagination = {
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 100,
      compact: compact === '1' || compact === 'true'
    };

    console.log('🏛️ BACKEND: Fetching company deals');

    const result = await DealTableRow.getCompanyDeals(filters, pagination);

    res.json(result);
  } catch (error: any) {
    console.error('Error fetching company deals:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Get totals (legacy endpoint)
router.get('/totals', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { year, month, agent_name, rop_name, document_type, team_id, branch_id } = req.query;

    const filters: any = {};
    if (year) filters.year = parseInt(stripOperator(year));
    if (month) filters.month = parseInt(stripOperator(month));
    if (agent_name) filters.agent_name = stripOperator(agent_name);
    if (rop_name) filters.rop_name = stripOperator(rop_name);
    if (document_type) filters.document_type = stripOperator(document_type);
    if (team_id) filters.team_id = stripOperator(team_id);
    if (branch_id) filters.branch_id = stripOperator(branch_id);

    const totals = await DealTableRow.getTotals(filters);
    res.json(totals);
  } catch (error: any) {
    console.error('Error fetching totals:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Get employee's personal totals
router.get('/my-deals-totals', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      year, month, agent_id, agent_name, team_id, branch_id,
      dealStatus, minAmount, maxAmount 
    } = req.query;

    const currentUserId = (req.user as any).id;
    const access_level = (req.user as any).access_level || 0;

    const filters: any = {};
    
    // For personal deals, default to current user if no specific agent requested
    if (agent_id || agent_name) {
      if (agent_id) filters.agent_id = agent_id as string;
      if (agent_name) filters.agent_name = agent_name as string;
    } else {
      filters.agent_id = currentUserId;
    }

    if (year) filters.year = parseInt(year as string);
    if (month) filters.month = parseInt(month as string);
    if (dealStatus) filters.dealStatus = dealStatus;
    if (team_id) filters.team_id = team_id as string;
    if (branch_id) filters.branch_id = branch_id as string;

    // Only Directors can use amount filters
    if (access_level >= 90) {
      if (minAmount) filters.minAmount = parseFloat(minAmount as string);
      if (maxAmount) filters.maxAmount = parseFloat(maxAmount as string);
    }

    const totals = await DealTableRow.getTotals(filters);
    res.json(totals);
  } catch (error: any) {
    console.error('Error fetching employee totals:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Get team totals (МОП and above, and employees with team)
router.get('/team-deals-totals', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      year, month, team_id, agent_id, agent_name, branch_id,
      dealStatus, minAmount, maxAmount 
    } = req.query;

    const access_level = (req.user as any).access_level || 0;
    const userId = (req.user as any).id;

    const filters: any = {};
    if (year) filters.year = parseInt(year as string);
    if (month) filters.month = parseInt(month as string);
    if (dealStatus) filters.dealStatus = dealStatus;
    if (agent_id) filters.agent_id = agent_id as string;
    if (agent_name) filters.agent_name = agent_name as string;
    if (branch_id) filters.branch_id = branch_id as string;

    // Use provided team_id or get from user's profile
    let finalTeamId = team_id as string;
    if (!finalTeamId && access_level < 90) {
      const profileResult = await query('SELECT team_id FROM profiles WHERE id = $1', [userId]);
      if (profileResult.rows[0]?.team_id) {
        finalTeamId = profileResult.rows[0].team_id;
      }
    }
    
    if (finalTeamId) filters.team_id = finalTeamId;

    // Only Directors can use amount filters
    if (access_level >= 90) {
      if (minAmount) filters.minAmount = parseFloat(minAmount as string);
      if (maxAmount) filters.maxAmount = parseFloat(maxAmount as string);
    }

    const totals = await DealTableRow.getTotals(filters);
    res.json(totals);
  } catch (error: any) {
    console.error('Error fetching team totals:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Get branch totals (РОП and Commercial Director)
router.get('/branch-deals-totals', authenticateToken, requireAccessLevel(90), async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      year, month, branch_id, team_id, agent_id, agent_name,
      dealStatus, minAmount, maxAmount 
    } = req.query;
    const access_level = (req.user as any).access_level || 0;

    const filters: any = {};
    if (year) filters.year = parseInt(year as string);
    if (month) filters.month = parseInt(month as string);
    if (dealStatus) filters.dealStatus = dealStatus as string;
    if (team_id) filters.team_id = team_id as string;
    if (agent_id) filters.agent_id = agent_id as string;
    if (agent_name) filters.agent_name = agent_name as string;

    // Use provided branch_id or get from user's profile
    let finalBranchId = branch_id as string;
    if (!finalBranchId && access_level < 90) {
      const profileResult = await query('SELECT branch_id FROM profiles WHERE id = $1', [(req.user as any).id]);
      if (profileResult.rows[0]?.branch_id) {
        finalBranchId = profileResult.rows[0].branch_id;
      }
    }
    
    if (finalBranchId) filters.branch_id = finalBranchId;

    // Only Directors can use amount filters
    if (access_level >= 90) {
      if (minAmount) filters.minAmount = parseFloat(minAmount as string);
      if (maxAmount) filters.maxAmount = parseFloat(maxAmount as string);
    }

    const totals = await DealTableRow.getTotals(filters);
    res.json(totals);
  } catch (error: any) {
    console.error('Error fetching branch totals:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Get company totals (Commercial Director)
router.get('/company-deals-totals', authenticateToken, requireAccessLevel(90), async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      year, month, branch_id, team_id, agent_id, agent_name,
      dealStatus, minAmount, maxAmount 
    } = req.query;
    const access_level = (req.user as any).access_level || 0;

    const filters: any = {};
    if (year) filters.year = parseInt(year as string);
    if (month) filters.month = parseInt(month as string);
    if (dealStatus) filters.dealStatus = dealStatus as string;
    if (branch_id) filters.branch_id = branch_id as string;
    if (team_id) filters.team_id = team_id as string;
    if (agent_id) filters.agent_id = agent_id as string;
    if (agent_name) filters.agent_name = agent_name as string;

    // Only Directors can use amount filters
    if (access_level >= 90) {
      if (minAmount) filters.minAmount = parseFloat(minAmount as string);
      if (maxAmount) filters.maxAmount = parseFloat(maxAmount as string);
    }

    const totals = await DealTableRow.getTotals(filters);
    res.json(totals);
  } catch (error: any) {
    console.error('Error fetching company totals:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Get team aggregation
router.get('/teams-summary', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { year, month, branch_id } = req.query;

    const filters: any = {};
    if (year) filters.year = parseInt(stripOperator(year));
    if (month) filters.month = parseInt(stripOperator(month));
    if (branch_id) filters.branch_id = stripOperator(branch_id);

    const summary = await DealTableRow.getTeamsSummary(filters);
    res.json(summary);
  } catch (error: any) {
    console.error('Error fetching teams summary:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Get branch aggregation (for directors)
router.get('/branches-summary', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { year, month } = req.query;

    if ((req.user as any).role !== 'director') {
      res.status(403).json({ error: { message: 'Access denied' } });
      return;
    }

    const filters: any = {};
    if (year) filters.year = parseInt(year as string);
    if (month) filters.month = parseInt(month as string);

    const summary = await DealTableRow.getBranchesSummary(filters);
    res.json(summary);
  } catch (error: any) {
    console.error('Error fetching branches summary:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Get employee stats
router.get('/employee/:name', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const { parseISO } = require('date-fns');
    const name = req.params.name as string;
    const { year, month, start, end } = req.query;

    const filters: any = {};
    if (year) filters.year = parseInt(stripOperator(year));
    if (month) filters.month = parseInt(stripOperator(month));
    
    if (start && end) {
      filters.startDate = parseISO(start as string);
      filters.endDate = parseISO(end as string);
    }

    const stats = await DealTableRow.getEmployeeStats(name, filters);
    res.json(stats);
  } catch (error: any) {
    console.error('Error fetching employee stats:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Get single row
router.get('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const row = await DealTableRow.findById(id);

    if (!row) {
      res.status(404).json({ error: { message: 'Row not found' } });
      return;
    }

    res.json(row);
  } catch (error: any) {
    console.error('Error fetching row:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Create new row
router.post('/',
  authenticateToken,
  [
    body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be 1-12'),
    body('year').isInt({ min: 2020, max: 2100 }).withMessage('Invalid year'),
    body('property_name').notEmpty().withMessage('Property name is required'),
    body('document_type').notEmpty().withMessage('Document type is required')
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
      return;
    }

    try {
      console.log('💾 BACKEND: Creating deal with data:', req.body);
      console.log('💾 BACKEND: req.body.status =', req.body.status);

      const row = await DealTableRow.create(req.body, (req.user as any).id);

      console.log('✅ BACKEND: Deal created:', {
        id: row.id,
        team_id: row.team_id,
        agent_name: row.agent_name
      });

      // Emit realtime event for cross-user updates
      emitDealEvent('created', row);

      // Also emit KPI event since KPI widgets depend on deal data
      emitKpiEvent('updated', { dealId: row.id, action: 'created' });

      // Force refresh materialized views for instant KPI updates
      try {
        await aggregationService.refreshViews();
        console.log('[DealTable] Materialized views refreshed after creation');
      } catch (refreshError) {
        console.error('[DealTable] Failed to refresh views after creation:', refreshError);
      }

      // Integrate with finances, KPI, and plans
      try {
        await DealFinanceIntegration.integrateDeal(row);
      } catch (integrationError) {
        console.error('Finance integration error (non-blocking):', integrationError);
        // Don't fail the request if integration fails
      }

      // Invalidate HTTP cache for KPI endpoints (model already invalidates kpi:*)
      // Pattern must match exact key format: 'http-cache:/api/kpi/*' (NOT 'http-cache:*/api/kpi/*')
      try {
        await cacheService.invalidate('http-cache:/api/kpi/*');
        console.log('[Deal] Invalidated HTTP cache for KPI endpoints');
      } catch (cacheError) {
        console.error('[Deal] Failed to invalidate HTTP cache:', cacheError);
      }

      res.status(201).json(row);
    } catch (error: any) {
      console.error('Error creating row:', error);
      if (error.stack) console.error('Stack trace:', error.stack);
      if (error.detail) console.error('Postgres Error Detail:', error.detail);
      res.status(500).json({ 
        error: { 
          message: error.message || 'Internal server error', 
          details: error.details || error.message,
          postgresDetail: error.detail,
          postgresHint: error.hint,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        } 
      });
    }
  }
);

// Update row
router.put('/:id',
  authenticateToken,
  [
    body('month').optional().isInt({ min: 1, max: 12 }),
    body('year').optional().isInt({ min: 2020, max: 2100 }),
    body('property_name').optional().notEmpty(),
    body('document_type').optional().notEmpty()
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
      return;
    }

    try {
      const id = req.params.id as string;

      // Check if row exists
      const existing = await DealTableRow.findById(id);
      if (!existing) {
        res.status(404).json({ error: { message: 'Row not found' } });
        return;
      }

      // Check if user has permission to edit this deal
      const userId = (req.user as any).id;
      const accessLevel = Number((req.user as any).access_level || 0);

      console.log('[DEBUG] Edit permission check:', {
        userId,
        accessLevel,
        dealId: existing.id,
        createdBy: existing.created_by,
        isOwner: existing.created_by === userId,
        teamId: existing.team_id
      });

      // Directors (90+) can edit any deal
      if (accessLevel < 90) {
        // Check ownership using created_by (UUID)
        const isOwner = existing.created_by === userId;

        // Team leads (50-89): Can edit if they are team leader OR if they created the deal
        if (accessLevel >= 50) {
          if (isOwner) {
            console.log('[DEBUG] Owner editing own deal - ALLOWED');
          } else if (existing.team_id) {
            // Check if user is team leader for team deals
            const teamCheck = await query(
              'SELECT leader_id FROM teams WHERE id = $1',
              [existing.team_id]
            );

            if (teamCheck.rows.length > 0) {
              const isTeamLeader = teamCheck.rows[0].leader_id === userId;
              console.log('[DEBUG] Team leader check:', { isTeamLeader, leaderId: teamCheck.rows[0].leader_id });
              if (!isTeamLeader) {
                console.log('[DEBUG] Not team leader - FORBIDDEN');
                res.status(403).json({
                  error: { message: 'Нет прав для редактирования этой сделки' }
                });
                return;
              }
            }
          }
          // If no team_id and not owner, allow (legacy deals without team)
        }
        // Regular employees (0-49) can only edit their own deals
        else if (!isOwner) {
          console.log('[DEBUG] Employee not owner - FORBIDDEN');
          res.status(403).json({
            error: { message: 'Нет прав для редактирования этой сделки' }
          });
          return;
        }
      }
      // Merge existing data with updates
      const updatedData = { ...existing, ...req.body };
      const row = await DealTableRow.update(id, updatedData);

      // Emit realtime event for cross-user updates
      emitDealEvent('updated', { id, ...req.body });

      // Also emit KPI event since KPI widgets depend on deal data
      emitKpiEvent('updated', { dealId: id, action: 'updated' });

      // Force refresh materialized views for instant KPI updates
      try {
        await aggregationService.refreshViews();
        console.log('[DealTable] Materialized views refreshed after update');
      } catch (refreshError) {
        console.error('[DealTable] Failed to refresh views after update:', refreshError);
      }

      // Integrate with finances, KPI, and plans
      try {
        await DealFinanceIntegration.integrateDeal(row);
      } catch (integrationError) {
        console.error('Finance integration error (non-blocking):', integrationError);
        // Don't fail the request if integration fails
      }

      // Invalidate HTTP cache for KPI endpoints (model already invalidates kpi:*)
      // Pattern must match exact key format: 'http-cache:/api/kpi/*' (NOT 'http-cache:*/api/kpi/*')
      try {
        await cacheService.invalidate('http-cache:/api/kpi/*');
        console.log('[Deal] Invalidated HTTP cache for KPI endpoints after update');
      } catch (cacheError) {
        console.error('[Deal] Failed to invalidate HTTP cache:', cacheError);
      }

      res.json(row);
    } catch (error: any) {
      console.error('Error updating row:', error);
      res.status(500).json({ error: { message: 'Internal server error' } });
    }
  }
);

// Delete row
router.delete('/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req.user as any).id;
    const accessLevel = Number((req.user as any).access_level || 0);

    const existing = await DealTableRow.findById(id);
    if (!existing) {
      res.status(404).json({ error: { message: 'Row not found' } });
      return;
    }

    // Check permission: Directors can delete all, team leads can delete team deals, employees only own deals
    if (accessLevel < 90) {
      // Check ownership using created_by (UUID)
      const isOwner = existing.created_by === userId;

      // Team leads (50-89): Can delete if they are team leader OR if they created the deal
      if (accessLevel >= 50) {
        if (isOwner) {
          // Owner can always delete their own deals
        } else if (existing.team_id) {
          // Check if user is team leader for team deals
          const teamCheck = await query(
            'SELECT leader_id FROM teams WHERE id = $1',
            [existing.team_id]
          );

          if (teamCheck.rows.length > 0) {
            const isTeamLeader = teamCheck.rows[0].leader_id === userId;
            if (!isTeamLeader) {
              res.status(403).json({
                error: { message: 'Нет прав для удаления этой сделки' }
              });
              return;
            }
          }
        }
        // If no team_id and not owner, allow (legacy deals without team)
      }
      // Regular employees (0-49) can only delete their own deals
      else if (!isOwner) {
        res.status(403).json({
          error: { message: 'Нет прав для удаления этой сделки' }
        });
        return;
      }
    }

    // Emit realtime event for cross-user updates
    emitDealEvent('deleted', { id });

    // Also emit KPI event since KPI widgets depend on deal data
    emitKpiEvent('updated', { dealId: id, action: 'deleted' });

    // Force refresh materialized views for instant KPI updates
    try {
        await aggregationService.refreshViews();
        console.log('[DealTable] Materialized views refreshed after deletion');
    } catch (refreshError) {
        console.error('[DealTable] Failed to refresh views after deletion:', refreshError);
    }

    await DealFinanceIntegration.deleteDealIntegration(id);

    await DealTableRow.delete(id);

    // Invalidate HTTP cache for KPI endpoints (model already invalidates kpi:*)
    // Pattern must match exact key format: 'http-cache:/api/kpi/*' (NOT 'http-cache:*/api/kpi/*')
    try {
      await cacheService.invalidate('http-cache:/api/kpi/*');
      console.log('[Deal] Invalidated HTTP cache for KPI endpoints after delete');
    } catch (cacheError) {
      console.error('[Deal] Failed to invalidate HTTP cache:', cacheError);
    }

    res.json({ message: 'Row deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting row:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

// Update status (Approve/Reject)
router.patch('/:id/status', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { status, reason } = req.body;
    const userId = (req.user as any).id;
    const accessLevel = Number((req.user as any).access_level || 0);

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      res.status(400).json({ error: { message: 'Invalid status' } });
      return;
    }

    const existing = await DealTableRow.findById(id);
    if (!existing) {
      res.status(404).json({ error: { message: 'Row not found' } });
      return;
    }

    // Check permission: Directors can change all, team leads can change team deals
    if (accessLevel < 90) {
      if (accessLevel < 50) {
        res.status(403).json({ error: { message: 'Нет прав для изменения статуса сделки' } });
        return;
      }

      if (existing.team_id) {
        const teamCheck = await query('SELECT leader_id FROM teams WHERE id = $1', [existing.team_id]);
        if (teamCheck.rows.length > 0) {
          const isTeamLeader = teamCheck.rows[0].leader_id === userId;
          if (!isTeamLeader) {
            res.status(403).json({ error: { message: 'Нет прав для изменения статуса сделки этой команды' } });
            return;
          }
        }
      } else {
        // If no team, and not a director, reject (employees can't approve their own deals)
        res.status(403).json({ error: { message: 'Нет прав для изменения статуса этой сделки' } });
        return;
      }
    }

    const row = await DealTableRow.updateStatus(id, status, reason);

    // Send notification to deal owner (created_by) only on final approval/rejection
    if (row.created_by && (status === 'approved' || status === 'rejected')) {
        const title = status === 'approved' ? 'Сделка одобрена' : 'Сделка отклонена';
        const message = status === 'rejected' 
            ? `Сделка "${row.property_name}" отклонена. Причина: ${reason || 'не указана'}`
            : `Сделка "${row.property_name}" одобрена.`;
        
        try {
            const notifId = uuidv4();
            const now = new Date().toISOString();
            const type = status === 'approved' ? 'success' : 'error';
            
            await query(
                `INSERT INTO notifications (id, user_id, title, message, type, is_forced, created_by, created_at, company_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [notifId, row.created_by, title, message, type, 0, userId, now, (req.user as any).company_id]
            );
            
            const notification = {
                id: notifId,
                user_id: row.created_by,
                title,
                message,
                type,
                is_forced: false,
                created_by: userId,
                created_at: now,
                is_read: 0
            };
            
            notificationService.sendToUser(row.created_by, { type: 'NOTIFICATION_RECEIVED', notification });
            await websocketService.emitEvent('NOTIFICATION_RECEIVED', { notification }, row.created_by);
        } catch (notifError) {
            console.error('Failed to send notification:', notifError);
        }
    }

    // Emit realtime event for cross-user updates
    emitDealEvent('updated', { id, status, rejection_reason: reason });
    emitKpiEvent('updated', { dealId: id, action: 'status_changed', status });

    // Force refresh materialized views for instant KPI updates
    try {
        await aggregationService.refreshViews();
        console.log('[DealTable] Materialized views refreshed after status change');
    } catch (refreshError) {
        console.error('[DealTable] Failed to refresh views after status change:', refreshError);
    }

    // Integrate with finances/KPI based on new status
    try {
      await DealFinanceIntegration.integrateDeal(row);
    } catch (integrationError) {
      console.error('Status sync integration error:', integrationError);
    }

    res.json(row);
  } catch (error: any) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
});

export default router;
