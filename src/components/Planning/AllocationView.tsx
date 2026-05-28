import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronRight, Building2, Users, User, TrendingUp, Target, Home, Pencil } from 'lucide-react';
import { usePlanAllocations } from '@/hooks/usePlanAllocations';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAvatarUrl } from '@/lib/utils';
import { EditEmployeePlanDialog } from './EditEmployeePlanDialog';
import { HierarchyBreadcrumb } from '@/components/Deals/HierarchyBreadcrumb';

interface AllocationViewProps {
  year: number;
  quarter: number;
  branchId?: string;
}

type NavigationLevel = 'company' | 'branch' | 'team' | 'employee';

interface BreadcrumbItem {
  label: string;
  level: NavigationLevel;
  id?: string;
}

export function AllocationView({ year, quarter, branchId }: AllocationViewProps) {
  const { data, isLoading, error } = usePlanAllocations(year, quarter, branchId);

  // Initialize navigation path based on branchId prop
  const getInitialNavigationPath = () => {
    // When specific branch is selected, start at team level (show employees directly)
    // When "all branches" selected, start at company level (show branches list)
    if (branchId && branchId !== 'all') {
      return [{ label: 'Филиал', level: 'branch', id: branchId }];
    }
    return [{ label: 'Компания', level: 'company' }];
  };

  const [navigationPath, setNavigationPath] = useState<BreadcrumbItem[]>(getInitialNavigationPath());
  const [editingEmployee, setEditingEmployee] = useState<any>(null);

  // Reset navigation when branchId changes
  useEffect(() => {
    setNavigationPath(getInitialNavigationPath());
  }, [branchId]);

  const currentLevel = navigationPath[navigationPath.length - 1]?.level || 'company';
  const currentId = navigationPath[navigationPath.length - 1]?.id;

  const handleDrillDown = (id: string, name: string, nextLevel: NavigationLevel) => {
    setNavigationPath([...navigationPath, { label: name, level: nextLevel, id }]);
  };

  const handleNavigate = (index: number) => {
    setNavigationPath(navigationPath.slice(0, index + 1));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-white/40 text-sm font-black uppercase tracking-widest">Загрузка...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-rose-500 text-sm font-black uppercase tracking-widest">
          Ошибка загрузки данных
        </div>
      </div>
    );
  }

  if (!data || data.total_employees === 0) {
    console.log('[AllocationView] No data:', { data, isLoading, error });
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Users className="h-16 w-16 text-white/10" />
        <div className="text-white/20 text-sm font-black uppercase tracking-widest">
          Нет распределенных планов
        </div>
        <p className="text-white/10 text-xs">
          Сохраните план, чтобы увидеть распределение по сотрудникам
        </p>
      </div>
    );
  }

  console.log('[AllocationView] Data received:', {
    employees: data.employees?.length || 0,
    branches: data.branches?.length || 0,
    teams: data.teams?.length || 0,
    total: data.total_employees,
    sampleEmployee: data.employees?.[0],
    sampleTeam: data.teams?.[0],
    sampleBranch: data.branches?.[0],
  });

  // Render based on current level
  const renderContent = () => {
    if (currentLevel === 'company') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.branches.map((branch) => (
            <motion.div
              key={branch.branch_id || 'no-branch'}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="group cursor-pointer"
              onClick={() => handleDrillDown(branch.branch_id || 'no-branch', branch.branch_name, 'branch')}
            >
              <Card className="bg-zinc-900/40 backdrop-blur-3xl border border-white/5 overflow-hidden shadow-2xl hover:border-primary/20 transition-all duration-300 group-hover:translate-y-[-2px]">
                <CardContent className="p-5 md:p-6 lg:p-8">
                  <div className="flex items-start justify-between mb-4 pb-4 border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-xl border border-primary/10">
                        <Building2 className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                      </div>
                      <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-wider">
                        {branch.branch_name}
                      </h3>
                    </div>
                    <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-primary transition-colors" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-white/40 uppercase tracking-wider">Сотрудников</span>
                      <span className="text-sm font-black text-white">{branch.employee_count}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-white/40 uppercase tracking-wider">Выручка</span>
                      <span className="text-sm font-black text-primary">
                        {Math.round(branch.target_revenue / 1000)}K ₽
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-white/40 uppercase tracking-wider">Сделки</span>
                      <span className="text-sm font-black text-white">{branch.target_deals}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      );
    }

    if (currentLevel === 'branch') {
      const teamsInBranch = data.teams.filter(t =>
        (t.branch_id || 'no-branch') === currentId
      );

      if (teamsInBranch.length === 0) {
        // No teams, show employees directly
        const employeesInBranch = data.employees.filter(e =>
          (e.branch_id || 'no-branch') === currentId
        );

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {employeesInBranch.map((emp) => (
              <EmployeeCard key={emp.user_id} employee={emp} year={year} quarter={quarter} onEdit={setEditingEmployee} />
            ))}
          </div>
        );
      }

      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teamsInBranch.map((team) => (
            <motion.div
              key={team.team_id || 'no-team'}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="group cursor-pointer"
              onClick={() => handleDrillDown(team.team_id || 'no-team', team.team_name, 'team')}
            >
              <Card className="bg-zinc-900/40 backdrop-blur-3xl border border-white/5 overflow-hidden shadow-2xl hover:border-primary/20 transition-all duration-300 group-hover:translate-y-[-2px]">
                <CardContent className="p-5 md:p-6 lg:p-8">
                  <div className="flex items-start justify-between mb-4 pb-4 border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-xl border border-primary/10">
                        <Users className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                      </div>
                      <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-wider">
                        {team.team_name}
                      </h3>
                    </div>
                    <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-primary transition-colors" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-white/40 uppercase tracking-wider">Сотрудников</span>
                      <span className="text-sm font-black text-white">{team.employee_count}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-white/40 uppercase tracking-wider">Выручка</span>
                      <span className="text-sm font-black text-primary">
                        {Math.round(team.target_revenue / 1000)}K ₽
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-white/40 uppercase tracking-wider">Сделки</span>
                      <span className="text-sm font-black text-white">{team.target_deals}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      );
    }

    if (currentLevel === 'team') {
      const employeesInTeam = data.employees.filter(e =>
        (e.team_id || 'no-team') === currentId
      );

      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {employeesInTeam.map((emp) => (
            <EmployeeCard key={emp.user_id} employee={emp} year={year} quarter={quarter} onEdit={setEditingEmployee} />
          ))}
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <div className="space-y-6">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <HierarchyBreadcrumb path={navigationPath} onNavigate={handleNavigate} />
        </div>

        {/* Content */}
        {renderContent()}
      </div>

      {/* Edit Dialog */}
      {editingEmployee && (
        <EditEmployeePlanDialog
          open={!!editingEmployee}
          onOpenChange={(open) => !open && setEditingEmployee(null)}
          employee={editingEmployee}
          year={year}
          quarter={quarter}
        />
      )}
    </>
  );
}

interface EmployeeCardProps {
  employee: any;
  year: number;
  quarter: number;
  onEdit: (employee: any) => void;
}

function EmployeeCard({ employee, year, quarter, onEdit }: EmployeeCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative"
    >
      <Card className="bg-zinc-900/40 backdrop-blur-3xl border border-white/5 overflow-hidden shadow-2xl hover:border-primary/20 transition-all duration-300 group-hover:translate-y-[-2px] h-full flex flex-col">
        <CardContent className="p-5 md:p-6 flex-1 flex flex-col">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/5">
            <Avatar className="h-10 w-10 border border-white/10">
              <AvatarImage src={getAvatarUrl(employee.avatar_url)} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-black">
                {employee.full_name?.substring(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-black text-white uppercase tracking-wider truncate">
                {employee.full_name}
              </h4>
              <p className="text-[9px] text-white/40 uppercase tracking-widest truncate mt-0.5">
                {employee.position_name || employee.role}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(employee);
              }}
              className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary transition-colors"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-white/40 uppercase tracking-wider">Выручка</span>
              <span className="text-sm font-black text-primary">
                {Math.round(employee.target_revenue / 1000)}K ₽
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-white/40 uppercase tracking-wider">Сделки</span>
              <span className="text-sm font-black text-white">{employee.target_deals}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-white/40 uppercase tracking-wider">Задатки</span>
              <span className="text-sm font-black text-rose-500">{employee.target_deposits}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-white/40 uppercase tracking-wider">Объекты</span>
              <span className="text-sm font-black text-white">{employee.target_objects}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
