import { query } from '../db';
import KpiCalculatorFactory from './kpi/KpiCalculatorFactory';
import kpiService from './kpi.service';

interface UpdateResult {
  updated: number;
  skipped: number;
}

/**
 * Auto-update employee KPI based on team/agency performance
 * Runs daily to sync management KPI with current plan completion
 */
async function updateManagementKpi(): Promise<UpdateResult> {
  console.log('🔄 Starting management KPI auto-update...');

  try {
    // Auto-configure default_management_kpi_max for management positions if not set
    try {
      await query(`
        UPDATE positions SET default_management_kpi_max = 5, management_base_salary = 40000
        WHERE LOWER(name) LIKE '%моп%' AND (default_management_kpi_max IS NULL OR default_management_kpi_max = 0)
      `);
      await query(`
        UPDATE positions SET default_management_kpi_max = 6, management_base_salary = 80000
        WHERE (LOWER(name) LIKE '%роп%' OR LOWER(name) LIKE '%директор%') AND (default_management_kpi_max IS NULL OR default_management_kpi_max = 0)
      `);
    } catch (configError: any) {
      console.warn('⚠️ Failed to auto-configure positions:', configError.message);
    }

    // Get all management employees (МОП, РОП, Commercial Director) by POSITION
    const result = await query(`
      SELECT
        p.id as user_id,
        p.full_name,
        p.team_id,
        p.branch_id,
        pos.name as position_name,
        pos.default_management_kpi_min,
        pos.default_management_kpi_max,
        pos.management_base_salary
      FROM profiles p
      LEFT JOIN positions pos ON p.position_id = pos.id
      WHERE p.is_active = 1
        AND (
          LOWER(pos.name) LIKE '%моп%'
          OR LOWER(pos.name) LIKE '%роп%'
          OR LOWER(pos.name) LIKE '%директор%'
          OR LOWER(pos.name) LIKE '%коммерческ%'
        )
    `);

    const employees = result.rows || [];
    console.log(`Found ${employees.length} management employees to update`);

    let updated = 0;
    let skipped = 0;

    for (const employee of employees) {
      try {
        // Get calculator for this role
        const factory = new KpiCalculatorFactory(kpiService);
        // Derive KPI role from position name
        const posName = (employee.position_name || '').toLowerCase();
        let effectiveRole = 'realtor';
        if (posName.includes('моп')) effectiveRole = 'sales_manager';
        else if (posName.includes('роп')) effectiveRole = 'head_sales';
        else if (posName.includes('директор')) effectiveRole = 'director';
        else if (posName.includes('коммерческ')) effectiveRole = 'commercial';

        const calculators = factory.getCalculators(effectiveRole);
        // Get management calculator (index 1) or fall back to personal (index 0)
        const calculator = calculators[1] || calculators[0];

        if (!calculator) {
          console.warn(`⚠️ No calculator found for position ${employee.position_name}`);
          skipped++;
          continue;
        }

        // Calculate current KPI based on team/agency performance (Quarterly)
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentQuarter = Math.floor(currentMonth / 3);
        const startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
        const endDate = new Date();

        const kpiData = await calculator.calculate(
          employee.user_id,
          startDate.toISOString(),
          endDate.toISOString(),
          'quarter',
          employee.branch_id
        );

        if (!kpiData || typeof kpiData.currentPercent !== 'number') {
          console.warn(`⚠️ Invalid KPI data for ${employee.full_name}`);
          skipped++;
          continue;
        }

        const newKpi = kpiData.currentPercent;

        // Update employee's management_kpi_current
        await query(`
          UPDATE profiles
          SET management_kpi_current = $1,
              kpi_last_updated = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [newKpi, employee.user_id]);

        console.log(`✅ Updated ${employee.full_name}: ${newKpi}%`);
        updated++;
      } catch (error: any) {
        console.error(`❌ Failed to update ${employee.full_name}:`, error.message);
        skipped++;
      }
    }

    console.log(`✅ KPI auto-update complete: ${updated} updated, ${skipped} skipped`);
    return { updated, skipped };
  } catch (error) {
    console.error('❌ KPI auto-update failed:', error);
    throw error;
  }
}

export { updateManagementKpi };
