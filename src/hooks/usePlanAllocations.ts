import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';

interface EmployeeAllocation {
  user_id: string;
  full_name: string;
  branch_id: string | null;
  branch_name: string;
  team_id: string | null;
  team_name: string;
  role: string;
  position_name: string;
  target_revenue: number;
  target_deals: number;
  target_deposits: number;
  target_objects: number;
  target_newbuildings: number;
  target_mortgage: number;
}

interface BranchAllocation {
  branch_id: string | null;
  branch_name: string;
  employee_count: number;
  target_revenue: number;
  target_deals: number;
  target_deposits: number;
  target_objects: number;
  target_newbuildings: number;
  target_mortgage: number;
}

interface TeamAllocation {
  team_id: string | null;
  team_name: string;
  branch_id: string | null;
  branch_name: string;
  employee_count: number;
  target_revenue: number;
  target_deals: number;
  target_deposits: number;
  target_objects: number;
  target_newbuildings: number;
  target_mortgage: number;
}

interface PlanAllocationsResponse {
  employees: EmployeeAllocation[];
  branches: BranchAllocation[];
  teams: TeamAllocation[];
  total_employees: number;
}

export function usePlanAllocations(year: number, quarter: number, branchId?: string) {
  return useQuery<PlanAllocationsResponse>({
    queryKey: ['plan-allocations', year, quarter, branchId],
    queryFn: async () => {
      let url = `/plans/employee-allocations?year=${year}&quarter=${quarter}`;
      if (branchId && branchId !== 'all') {
        url += `&branch_id=${branchId}`;
      }
      const { data, error } = await localAPI.request(url);
      if (error) throw error;
      return data;
    },
    staleTime: 300000, // 5 minutes
    gcTime: 600000, // 10 minutes
    enabled: !!year && !!quarter,
  });
}
