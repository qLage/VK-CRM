import express, { Request, Response, Router } from 'express';
import { authenticateToken, requireRole, requireAccessLevel } from '../middleware/auth';
import { body, validationResult } from 'express-validator';
import GoogleSheetsImporter from '../services/googleSheetsImporter';
import { query } from '../db';

const router: Router = express.Router();

/**
 * POST /api/import/google-sheets
 * Import deals from Google Sheets data
 *
 * Request body:
 * {
 *   "sheets": {
 *     "Sales Group 1": [array of deal objects or CSV string],
 *     "Rich Realtor": [array of deal objects or CSV string]
 *   },
 *   "teamMapping": {
 *     "Sales Group 1": "team-id-1",
 *     "Rich Realtor": "team-id-2"
 *   }
 * }
 */
router.post(
  '/google-sheets',
  authenticateToken,
  requireAccessLevel(90),
  [
    body('sheets').isObject().withMessage('sheets must be an object'),
    body('teamMapping').optional().isObject().withMessage('teamMapping must be an object')
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: { message: 'Validation failed', details: errors.array() }
      });
      return;
    }

    try {
      const { sheets, teamMapping = {} } = req.body;
      const createdBy = (req.user as any).id;

      // Validate sheets data
      if (!sheets || Object.keys(sheets).length === 0) {
        res.status(400).json({
          error: { message: 'No sheets data provided' }
        });
        return;
      }

      console.log('\n🚀 Starting Google Sheets import...');
      console.log(`📊 Sheets to import: ${Object.keys(sheets).join(', ')}`);
      console.log(`👤 Initiated by: ${(req.user as any).email || (req.user as any).id}`);

      const importer = new GoogleSheetsImporter();
      const result = await importer.importFromSheets(sheets, teamMapping, createdBy);

      res.json({
        success: true,
        message: 'Import completed successfully',
        data: result
      });

    } catch (error: any) {
      console.error('❌ Import error:', error);
      res.status(500).json({
        error: {
          message: 'Import failed',
          details: error.message
        }
      });
    }
  }
);

/**
 * POST /api/import/google-sheets/preview
 * Preview what would be imported without actually importing
 */
router.post(
  '/google-sheets/preview',
  authenticateToken,
  requireAccessLevel(90),
  [
    body('sheets').isObject().withMessage('sheets must be an object')
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: { message: 'Validation failed', details: errors.array() }
      });
      return;
    }

    try {
      const { sheets } = req.body;

      const importer = new GoogleSheetsImporter();
      const allDeals: any[] = [];

      // Parse all sheets
      for (const [sheetName, rawData] of Object.entries(sheets)) {
        const deals = importer.parseSheetData(rawData as string | any[], sheetName);
        allDeals.push(...deals.map((d: any) => ({ ...d, sheet: sheetName })));
      }

      // Get employee mapping to show which agents will be matched
      const result = await query(`
        SELECT id, full_name, email, team_id
        FROM profiles
        WHERE full_name IS NOT NULL
      `);

      const employeeMap = new Map();
      result.rows.forEach((emp: any) => {
        const normalizedName = importer.normalizeName(emp.full_name);
        employeeMap.set(normalizedName, emp);
      });

      // Check which deals will be matched
      const preview = allDeals.map((deal: any) => {
        const normalizedAgentName = importer.normalizeName(deal.agent_name);
        const employee = employeeMap.get(normalizedAgentName);

        return {
          ...deal,
          employee_matched: !!employee,
          employee_id: employee?.id || null,
          employee_name: employee?.full_name || null,
          duplicate_key: importer.getDuplicateKey(deal)
        };
      });

      const matched = preview.filter((d: any) => d.employee_matched).length;
      const unmatched = preview.filter((d: any) => !d.employee_matched).length;

      res.json({
        success: true,
        summary: {
          total: allDeals.length,
          matched,
          unmatched,
          sheets: Object.keys(sheets).length
        },
        preview: preview.slice(0, 100) // Limit preview to first 100 deals
      });

    } catch (error: any) {
      console.error('❌ Preview error:', error);
      res.status(500).json({
        error: {
          message: 'Preview failed',
          details: error.message
        }
      });
    }
  }
);

/**
 * GET /api/import/google-sheets/status
 * Get current import status and statistics
 */
router.get(
  '/google-sheets/status',
  authenticateToken,
  requireRole(['admin', 'director']),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      // Get deal counts
      const dealsResult = await query(`
        SELECT
          COUNT(*) as total_deals,
          COUNT(*) FILTER (WHERE status = 'closed') as closed_deals,
          COUNT(DISTINCT period_year) as years_covered,
          MIN(deal_date) as earliest_deal,
          MAX(deal_date) as latest_deal
        FROM deals
      `);

      // Get employee stats
      const employeesResult = await query(`
        SELECT
          COUNT(DISTINCT dp.employee_id) as employees_with_deals,
          COUNT(*) as total_participations
        FROM deal_participants dp
      `);

      // Get team stats
      const teamsResult = await query(`
        SELECT
          t.name,
          COUNT(DISTINCT dp.deal_id) as deal_count
        FROM teams t
        LEFT JOIN profiles p ON p.team_id = t.id
        LEFT JOIN deal_participants dp ON dp.employee_id = p.id
        GROUP BY t.id, t.name
        ORDER BY deal_count DESC
      `);

      res.json({
        success: true,
        data: {
          deals: dealsResult.rows[0],
          employees: employeesResult.rows[0],
          teams: teamsResult.rows
        }
      });

    } catch (error: any) {
      console.error('❌ Status error:', error);
      res.status(500).json({
        error: {
          message: 'Failed to get status',
          details: error.message
        }
      });
    }
  }
);

export default router;
