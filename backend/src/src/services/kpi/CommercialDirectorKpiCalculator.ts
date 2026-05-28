import RopKpiCalculator from './RopKpiCalculator';

/**
 * Commercial Director KPI Calculator
 * Extends ROP calculator - same agency-level KPI calculation
 */
class CommercialDirectorKpiCalculator extends RopKpiCalculator {
  getDisplayName(): string {
    return 'KPI компании';
  }
}

export default CommercialDirectorKpiCalculator;
