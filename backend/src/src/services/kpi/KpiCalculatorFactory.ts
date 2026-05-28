import RealtorKpiCalculator from './RealtorKpiCalculator';
import MopKpiCalculator from './MopKpiCalculator';
import RopKpiCalculator from './RopKpiCalculator';
import CommercialDirectorKpiCalculator from './CommercialDirectorKpiCalculator';
import BaseKpiCalculator from './BaseKpiCalculator';
import KpiService from '../kpi.service';

/**
 * KPI Calculator Factory
 * Returns appropriate calculator(s) based on user role
 */
class KpiCalculatorFactory {
  private kpiService: typeof KpiService;

  constructor(kpiService: typeof KpiService) {
    this.kpiService = kpiService;
  }

  /**
   * Get calculators for a given role
   * @param role - User role
   * @returns Array of calculators (1 or 2)
   */
  getCalculators(role: string): BaseKpiCalculator[] {
    const calculators: BaseKpiCalculator[] = [];

    switch (role) {
      case 'realtor':
      case 'mortgage_broker':
        // Realtors and Mortgage Brokers only have personal KPI
        calculators.push(new RealtorKpiCalculator(this.kpiService));
        break;

      case 'sales_manager':
        // МОП has both personal and team KPI
        calculators.push(new RealtorKpiCalculator(this.kpiService));
        calculators.push(new MopKpiCalculator(this.kpiService));
        break;

      case 'head_sales':
        // РОП has both personal and agency KPI
        calculators.push(new RealtorKpiCalculator(this.kpiService));
        calculators.push(new RopKpiCalculator(this.kpiService));
        break;

      case 'commercial':
        // Commercial Director has both personal and company KPI
        calculators.push(new RealtorKpiCalculator(this.kpiService));
        calculators.push(new CommercialDirectorKpiCalculator(this.kpiService));
        break;
        
      case 'director':
        // Ordinary Director (Owner/Admin) sees company KPI but might not have a base salary
        calculators.push(new RealtorKpiCalculator(this.kpiService));
        calculators.push(new CommercialDirectorKpiCalculator(this.kpiService));
        break;

      default:
        throw new Error(`No KPI calculator available for role: ${role}`);
    }

    return calculators;
  }

  /**
   * Check if role has dual KPI
   * @param role - User role
   * @returns boolean
   */
  hasDualKpi(role: string): boolean {
    // Mortgage brokers only have personal KPI, not dual KPI
    return ['sales_manager', 'head_sales', 'commercial', 'director'].includes(role);
  }
}

export default KpiCalculatorFactory;
