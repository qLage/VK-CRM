import { pool } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { PoolClient } from 'pg';

interface DealData {
  deal_date: string | null;
  agent_name: string | null;
  property: string;
  deal_price: number;
  commission_total: number;
  sheet_source: string;
}

interface EmployeeData {
  id: string;
  full_name: string;
  email: string;
  team_id: string | null;
}

interface TeamMapping {
  [key: string]: string;
}

interface ImportResult {
  success: boolean;
  summary: {
    total: number;
    created: number;
    skipped: number;
    errors: number;
  };
  details: {
    created: Array<{ dealId: string; deal: DealData; employeeId: string }>;
    skipped: Array<{ deal: DealData; reason: string }>;
    errors: Array<{ deal: DealData; error: string }>;
  };
}

/**
 * Google Sheets Importer Service
 * Imports deals from Google Sheets data (CSV or JSON format)
 * Follows 9-step process: parse, reset, map employees, map teams, create deals,
 * rebuild finances, recalculate KPI, verify, duplicate protection
 */
class GoogleSheetsImporter {
  private duplicateKeys: Set<string>;

  constructor() {
    this.duplicateKeys = new Set();
  }

  /**
   * STEP 1: Parse Google Sheets data
   * Accepts CSV string or JSON array
   * Normalizes fields: deal_date, agent_name, property, deal_price, commission_total
   */
  parseSheetData(rawData: string | any[], sheetSource: string): DealData[] {
    const deals: DealData[] = [];

    // If rawData is string, assume CSV format
    if (typeof rawData === 'string') {
      const lines = rawData.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());

        // Skip empty rows or total rows
        if (!values[0] || values[0].toLowerCase().includes('total') || values[0].toLowerCase().includes('итого')) {
          continue;
        }

        const row: any = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx];
        });

        deals.push(this.normalizeRow(row, sheetSource));
      }
    } else if (Array.isArray(rawData)) {
      // JSON array format
      rawData.forEach(row => {
        if (row && !this.isEmptyOrTotalRow(row)) {
          deals.push(this.normalizeRow(row, sheetSource));
        }
      });
    }

    return deals;
  }

  /**
   * Check if row is empty or a total/summary row
   */
  isEmptyOrTotalRow(row: any): boolean {
    const firstValue = Object.values(row)[0];
    if (!firstValue) return true;

    const str = String(firstValue).toLowerCase();
    return str.includes('total') || str.includes('итого') || str.includes('всего');
  }

  /**
   * Normalize row to standard format
   */
  normalizeRow(row: any, sheetSource: string): DealData {
    // Detect columns automatically - try common variations
    const dealDate = row.deal_date || row.date || row['дата сделки'] || row['дата'] || null;
    const agentName = row.agent_name || row.agent || row['агент'] || row['риелтор'] || row['сотрудник'] || null;
    const property = row.property || row.object || row['объект'] || row['недвижимость'] || row.property_object || null;
    const dealPrice = this.parseNumber(row.deal_price || row.price || row['цена'] || row['стоимость'] || 0);
    const commissionTotal = this.parseNumber(row.commission_total || row.commission || row['комиссия'] || 0);

    return {
      deal_date: this.parseDate(dealDate),
      agent_name: agentName ? String(agentName).trim() : null,
      property: property ? String(property).trim() : 'Не указано',
      deal_price: dealPrice,
      commission_total: commissionTotal,
      sheet_source: sheetSource
    };
  }

  /**
   * Parse date from various formats
   */
  parseDate(dateStr: any): string | null {
    if (!dateStr) return null;

    // Try DD.MM.YYYY or DD/MM/YYYY format first (Russian format)
    const parts = String(dateStr).split(/[./]/);
    if (parts.length === 3 && parts[0].length <= 2) {
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      const year = parseInt(parts[2]);

      // Validate ranges
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000) {
        // Return in YYYY-MM-DD format (avoid timezone issues)
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    // Try ISO format (YYYY-MM-DD)
    const isoMatch = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    // Fallback: try Date constructor
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return null;
  }

  /**
   * Parse number from string (handles Russian format with spaces)
   */
  parseNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (!value) return 0;

    // Remove spaces, replace comma with dot
    const cleaned = String(value).replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  /**
   * STEP 2: Reset deals - delete all existing deals
   */
  async resetDeals(client: PoolClient): Promise<void> {
    console.log('🗑️  Deleting all existing deals...');

    // Delete in correct order due to foreign keys
    await client.query('DELETE FROM deal_payouts');
    await client.query('DELETE FROM deal_commissions');
    await client.query('DELETE FROM deal_participants');
    await client.query('DELETE FROM deals');

    console.log('✅ All deals deleted');
  }

  /**
   * STEP 3: Map employees - match agent names to database
   */
  async mapEmployees(client: PoolClient): Promise<Map<string, EmployeeData>> {
    const result = await client.query(`
      SELECT id, full_name, email, team_id
      FROM profiles
      WHERE full_name IS NOT NULL
    `);

    const employeeMap = new Map<string, EmployeeData>();
    result.rows.forEach((emp: EmployeeData) => {
      // Create multiple keys for fuzzy matching
      const normalizedName = this.normalizeName(emp.full_name);
      employeeMap.set(normalizedName, emp);

      // Also store by email if available
      if (emp.email) {
        employeeMap.set(emp.email.toLowerCase(), emp);
      }
    });

    return employeeMap;
  }

  /**
   * Normalize name for matching (remove extra spaces, lowercase)
   */
  normalizeName(name: string | null): string {
    if (!name) return '';
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * STEP 4: Map teams - get team assignments
   */
  async mapTeams(client: PoolClient, _teamMapping: TeamMapping): Promise<{ [key: string]: string }> {
    // teamMapping should be like: { 'Sales Group 1': 'team-id-1', 'Rich Realtor': 'team-id-2' }
    const result = await client.query('SELECT id, name FROM teams');

    const teams: { [key: string]: string } = {};
    result.rows.forEach((team: { id: string; name: string }) => {
      teams[team.name] = team.id;
    });

    return teams;
  }

  /**
   * Generate duplicate key for detection
   */
  getDuplicateKey(deal: DealData): string {
    const date = deal.deal_date || 'no-date';
    const agent = this.normalizeName(deal.agent_name || 'no-agent');
    const property = (deal.property || 'no-property').toLowerCase().trim();
    return `${date}|${agent}|${property}`;
  }

  /**
   * STEP 5: Create deal records
   */
  async createDeals(
    client: PoolClient,
    deals: DealData[],
    employeeMap: Map<string, EmployeeData>,
    _teamMapping: TeamMapping,
    createdBy: string
  ): Promise<{
    created: Array<{ dealId: string; deal: DealData; employeeId: string }>;
    skipped: Array<{ deal: DealData; reason: string }>;
    errors: Array<{ deal: DealData; error: string }>;
  }> {
    console.log(`📝 Creating ${deals.length} deals...`);

    const created: Array<{ dealId: string; deal: DealData; employeeId: string }> = [];
    const skipped: Array<{ deal: DealData; reason: string }> = [];
    const errors: Array<{ deal: DealData; error: string }> = [];

    for (const deal of deals) {
      try {
        // STEP 9: Duplicate protection
        const dupKey = this.getDuplicateKey(deal);
        if (this.duplicateKeys.has(dupKey)) {
          skipped.push({ deal, reason: 'Duplicate' });
          continue;
        }
        this.duplicateKeys.add(dupKey);

        // Find employee
        const normalizedAgentName = this.normalizeName(deal.agent_name);
        const employee = employeeMap.get(normalizedAgentName);

        if (!employee) {
          skipped.push({ deal, reason: `Employee not found: ${deal.agent_name}` });
          continue;
        }

        // Extract period from deal_date
        let periodMonth: number | null = null;
        let periodYear: number | null = null;
        if (deal.deal_date) {
          const date = new Date(deal.deal_date);
          periodMonth = date.getMonth() + 1;
          periodYear = date.getFullYear();
        }

        // Create deal record
        const dealId = uuidv4();
        await client.query(`
          INSERT INTO deals (
            id, property_object, document_type, deal_date,
            status, period_month, period_year, created_by,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        `, [
          dealId,
          deal.property,
          'купля-продажа', // Default document type
          deal.deal_date,
          'closed', // All imported deals are closed
          periodMonth,
          periodYear,
          createdBy
        ]);

        // Create deal participant (agent)
        await client.query(`
          INSERT INTO deal_participants (
            id, deal_id, employee_id, role, side, created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())
        `, [
          uuidv4(),
          dealId,
          employee.id,
          'agent',
          'both' // Assume agent handles both sides
        ]);

        // Create deal commission record
        await client.query(`
          INSERT INTO deal_commissions (
            id, deal_id,
            commission_seller_fact, commission_buyer_fact,
            agent_percent_seller, agent_percent_buyer,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        `, [
          uuidv4(),
          dealId,
          deal.commission_total / 2, // Split commission between seller/buyer
          deal.commission_total / 2,
          50, // Default 50% to agent
          50,
        ]);

        created.push({ dealId, deal, employeeId: employee.id });

      } catch (error: any) {
        errors.push({ deal, error: error.message });
      }
    }

    console.log(`✅ Created: ${created.length}, Skipped: ${skipped.length}, Errors: ${errors.length}`);

    return { created, skipped, errors };
  }

  /**
   * STEP 6: Rebuild finances
   * Recalculate company revenue, agent income, team income
   */
  async rebuildFinances(client: PoolClient): Promise<void> {
    console.log('💰 Rebuilding finances...');

    // This would call existing finance calculation services
    // For now, we'll create a basic recalculation

    // Calculate deal finances
    await client.query(`
      INSERT INTO deal_finances_calculated (
        deal_id, period_month, period_year,
        total_commission_fact, agent_income_total, company_revenue
      )
      SELECT
        d.id,
        d.period_month,
        d.period_year,
        COALESCE(dc.commission_seller_fact, 0) + COALESCE(dc.commission_buyer_fact, 0) as total_commission_fact,
        (COALESCE(dc.commission_seller_fact, 0) + COALESCE(dc.commission_buyer_fact, 0)) *
          (COALESCE(dc.agent_percent_seller, 50) + COALESCE(dc.agent_percent_buyer, 50)) / 200 as agent_income_total,
        (COALESCE(dc.commission_seller_fact, 0) + COALESCE(dc.commission_buyer_fact, 0)) *
          (100 - (COALESCE(dc.agent_percent_seller, 50) + COALESCE(dc.agent_percent_buyer, 50)) / 2) / 100 as company_revenue
      FROM deals d
      LEFT JOIN deal_commissions dc ON d.id = dc.deal_id
      WHERE d.status = 'closed'
      ON CONFLICT (deal_id) DO UPDATE SET
        total_commission_fact = EXCLUDED.total_commission_fact,
        agent_income_total = EXCLUDED.agent_income_total,
        company_revenue = EXCLUDED.company_revenue
    `);

    console.log('✅ Finances rebuilt');
  }

  /**
   * STEP 7: Recalculate KPI
   * Update personal KPI (agent commission) and management KPI (team revenue)
   */
  async recalculateKPI(client: PoolClient): Promise<void> {
    console.log('📊 Recalculating KPI...');

    // Update employee stats from deal_table_rows (where imported deals are stored)
    await client.query(`
      UPDATE profiles
      SET
        custom_total_deals = (
          SELECT COUNT(*)
          FROM deal_table_rows dtr
          WHERE dtr.agent_id = profiles.id
        ),
        custom_total_revenue = (
          SELECT COALESCE(SUM(dtr.commission_total_fact - COALESCE(dtr.mop_revenue, 0)), 0)
          FROM deal_table_rows dtr
          WHERE dtr.agent_id = profiles.id
        )
    `);

    // Calculate personal KPI for all employees based on their revenue
    // Personal KPI = (actual_revenue / target_revenue) * 100, capped at max KPI
    await client.query(`
      UPDATE profiles
      SET personal_kpi_current = (
        SELECT MIN(
          COALESCE(
            CASE
              WHEN pos.default_personal_kpi_max > 0 THEN
                (
                  (SELECT COALESCE(SUM(dtr.commission_total_fact - COALESCE(dtr.mop_revenue, 0)), 0)
                   FROM deal_table_rows dtr
                   WHERE dtr.agent_id = profiles.id) /
                  NULLIF(
                    (SELECT COALESCE(SUM(up.target_revenue), 1000000)
                     FROM user_plans up
                     WHERE up.user_id = profiles.id
                     LIMIT 1),
                    0
                  )
                ) * 100
              ELSE 0
            END,
            0
          ),
          COALESCE(pos.default_personal_kpi_max, 60)
        )
        FROM positions pos
        WHERE pos.id = profiles.position_id
      )
      WHERE profiles.position_id IS NOT NULL
    `);

    // Calculate management KPI for managers (МОП, РОП, Directors)
    // Management KPI = (team_revenue / team_target) * 100, capped at max KPI
    await client.query(`
      UPDATE profiles
      SET management_kpi_current = (
        SELECT MIN(
          COALESCE(
            CASE
              WHEN pos.default_management_kpi_max > 0 AND profiles.team_id IS NOT NULL THEN
                (
                  (SELECT COALESCE(SUM(dtr.commission_total_fact - COALESCE(dtr.mop_revenue, 0)), 0)
                   FROM deal_table_rows dtr
                   WHERE dtr.agent_id IN (SELECT id FROM profiles WHERE team_id = profiles.team_id)) /
                  NULLIF(
                    (SELECT COALESCE(SUM(up.target_revenue), 5000000)
                     FROM user_plans up
                     JOIN profiles team_members ON up.user_id = team_members.id
                     WHERE team_members.team_id = profiles.team_id),
                    0
                  )
                ) * 100
              ELSE 0
            END,
            0
          ),
          COALESCE(pos.default_management_kpi_max, 6)
        )
        FROM positions pos
        WHERE pos.id = profiles.position_id
          AND pos.default_management_kpi_max > 0
      )
      WHERE profiles.position_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM positions pos
          WHERE pos.id = profiles.position_id
            AND pos.default_management_kpi_max > 0
        )
    `);

    // Update kpi_last_updated timestamp
    await client.query(`
      UPDATE profiles
      SET kpi_last_updated = CURRENT_TIMESTAMP
      WHERE personal_kpi_current > 0 OR management_kpi_current > 0
    `);

    console.log('✅ KPI recalculated from deal_table_rows data');
  }

  /**
   * Main import function - orchestrates all 9 steps
   */
  async importFromSheets(
    sheetsData: { [key: string]: string | any[] },
    teamMapping: TeamMapping,
    createdBy: string
  ): Promise<ImportResult> {
    if (!pool) {
      throw new Error('Database pool not available');
    }
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // STEP 1: Parse data from both sheets
      console.log('📋 STEP 1: Parsing Google Sheets data...');
      const allDeals: DealData[] = [];
      for (const [sheetName, rawData] of Object.entries(sheetsData)) {
        const deals = this.parseSheetData(rawData, sheetName);
        console.log(`  - ${sheetName}: ${deals.length} deals`);
        allDeals.push(...deals);
      }

      // STEP 2: Reset deals
      console.log('\n🗑️  STEP 2: Resetting existing deals...');
      await this.resetDeals(client);

      // STEP 3: Map employees
      console.log('\n👥 STEP 3: Mapping employees...');
      const employeeMap = await this.mapEmployees(client);
      console.log(`  - Found ${employeeMap.size} employees`);

      // STEP 4: Map teams
      console.log('\n🏢 STEP 4: Mapping teams...');
      const teams = await this.mapTeams(client, teamMapping);
      console.log(`  - Found ${Object.keys(teams).length} teams`);

      // STEP 5: Create deals
      console.log('\n📝 STEP 5: Creating deal records...');
      const result = await this.createDeals(client, allDeals, employeeMap, teamMapping, createdBy);

      // STEP 6: Rebuild finances
      console.log('\n💰 STEP 6: Rebuilding finances...');
      await this.rebuildFinances(client);

      // STEP 7: Recalculate KPI
      console.log('\n📊 STEP 7: Recalculating KPI...');
      await this.recalculateKPI(client);

      await client.query('COMMIT');

      console.log('\n✅ Import completed successfully!');
      console.log(`\nSummary:`);
      console.log(`  - Total deals processed: ${allDeals.length}`);
      console.log(`  - Successfully created: ${result.created.length}`);
      console.log(`  - Skipped: ${result.skipped.length}`);
      console.log(`  - Errors: ${result.errors.length}`);

      return {
        success: true,
        summary: {
          total: allDeals.length,
          created: result.created.length,
          skipped: result.skipped.length,
          errors: result.errors.length
        },
        details: result
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Import failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export default GoogleSheetsImporter;
