import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Users, Building2, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useFinances } from '@/hooks/useFinances';
import { PaymentBreakdownDialog } from './PaymentBreakdownDialog';
import { HierarchyBreadcrumb } from '@/components/Deals/HierarchyBreadcrumb';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { getAvatarUrl } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface BreadcrumbItem {
  label: string;
  level: 'company' | 'branch' | 'team' | 'employee';
  id?: string;
}

/** Align with backend `positionMatchesCommercialExecutive`: keep коммерческий директор visible when total is 0. */
function isCommercialExecutiveSalaryRow(s: { role?: string | null; position_name?: string | null }) {
  return s.role === 'commercial' || /коммерч/i.test(String(s.position_name || '').trim());
}

function getSalaryRoleLabel(role: string) {
  const labels: Record<string, string> = {
    realtor: 'Агент',
    sales_manager: 'МОП',
    head_sales: 'РОП',
    commercial: 'Коммерческий директор',
    director: 'Директор',
    admin: 'Администратор',
    mortgage_broker: 'Ипотечный брокер',
  };
  return labels[role] || role;
}

export function SalarySchedule() {
  const { addTransaction, isAdding } = useFinances();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const now = new Date();
  const [salaryYear, setSalaryYear] = useState(now.getFullYear());
  const [salaryMonth, setSalaryMonth] = useState(now.getMonth() + 1);
  const [navigationPath, setNavigationPath] = useState<BreadcrumbItem[]>([
    { label: 'Все филиалы', level: 'company' }
  ]);

  const { data: branches = [], isLoading: branchesLoading, error: branchesError } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data } = await localAPI.request('/branches');
      console.log('[SalarySchedule] Branches API response:', data);
      const branchesData = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      if (branchesData.length > 0) {
        console.log('[SalarySchedule] First branch:', branchesData[0], 'ID:', branchesData[0]?.id, 'ID type:', typeof branchesData[0]?.id);
      }
      return branchesData;
    },
    staleTime: 60000,
    refetchOnMount: true,
    retry: 1,
  });

  const { data: teams = [], isLoading: teamsLoading, error: teamsError } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data } = await localAPI.request('/teams');
      console.log('[SalarySchedule] Teams API response:', data);
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data)) return data;
      return [];
    },
    staleTime: 60000,
    refetchOnMount: true,
    retry: 1,
  });

  const { data: employees = [], isLoading: employeesLoading, error: employeesError } = useQuery({
    queryKey: ['salaried-employees-list', salaryYear, salaryMonth],
    queryFn: async () => {
      const { data: salaries, error } = await localAPI.request(
        `/finances/salaries?year=${salaryYear}&month=${salaryMonth}`
      );
      if (error) throw error;

      console.log('[SalarySchedule] Salaries API response:', salaries);
      const salariesArray = Array.isArray(salaries?.data) ? salaries.data : (Array.isArray(salaries) ? salaries : []);
      if (salariesArray.length > 0) {
        console.log('[SalarySchedule] First employee:', salariesArray[0]?.full_name, 'branch_id:', salariesArray[0]?.branch_id, 'Type:', typeof salariesArray[0]?.branch_id);
      }
      return salariesArray
        .filter((s: any) => Number(s.total_salary) > 0 || isCommercialExecutiveSalaryRow(s))
        .map((s: any) => {
          const mortgageAgent = Math.round(Number(s.mortgage_agent_income) || 0);
          const mortgageBroker = Math.round(Number(s.mortgage_broker_income) || 0);
          const mortgage_income = mortgageAgent + mortgageBroker;
          return {
            id: s.user_id,
            full_name: s.full_name,
            role: s.role,
            position_name: s.position_name || getSalaryRoleLabel(s.role),
            branch_id: s.branch_id,
            team_id: s.team_id,
            personal_income: (s.personal_income || 0) + mortgageAgent + mortgageBroker,
            mortgage_income,
            mortgage_agent_income: mortgageAgent,
            mortgage_broker_income: mortgageBroker,
            team_revenue: s.team_revenue || 0,
            department_revenue: s.department_revenue || 0,
            total_salary: s.total_salary || 0,
            commission: s.commission || 0,
            base_salary: s.base_salary || 0,
            uses_official_payroll: s.payroll_scheme === 'official' || s.uses_official_payroll === true,
          };
        });
    },
    staleTime: 60000,
    refetchOnMount: true,
    retry: 1,
  });

  // Query transactions to calculate paid amounts
  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await localAPI.request("/finances/transactions");
      if (error) throw error;
      return Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    },
    staleTime: 60000,
    refetchOnMount: true,
  });

  // Calculate paid amounts for each employee
  const employeePaidAmounts = useMemo(() => {
    const periodTag = `[payroll:${salaryYear}-${String(salaryMonth).padStart(2, '0')}`;
    const currentMonth = format(new Date(salaryYear, salaryMonth - 1, 1), 'LLLL', { locale: ru });
    const paidMap = new Map<string, number>();

    transactions.forEach((tx: any) => {
      if (tx.type !== 'expense' || !tx.user_id) return;
      const payoutCategories = ['salary', 'salary_advance_net', 'salary_remainder_net'];
      if (!payoutCategories.includes(tx.category)) return;

      const desc = tx.description || '';
      const matchesPayrollTagged = desc.includes(periodTag);
      const legacyMonthMatches = tx.category === 'salary' && desc.includes(currentMonth);
      if (!matchesPayrollTagged && !legacyMonthMatches) return;

      const currentPaid = paidMap.get(tx.user_id) || 0;
      paidMap.set(tx.user_id, currentPaid + (Number(tx.amount) || 0));
    });

    return paidMap;
  }, [transactions, salaryYear, salaryMonth]);

  useEffect(() => {
    console.log('[SalarySchedule] Data state:', {
      branches: branches.length,
      teams: teams.length,
      employees: employees.length,
      branchesLoading,
      teamsLoading,
      employeesLoading,
    });
  }, [branches, teams, employees, branchesLoading, teamsLoading, employeesLoading]);

  const handleDrillDown = (id: string, name: string, fromLevel: 'company' | 'branch' | 'team') => {
    const nextLevel = fromLevel === 'company' ? 'branch' : fromLevel === 'branch' ? 'team' : 'employee';
    setNavigationPath([...navigationPath, { label: name, level: nextLevel, id }]);
  };

  const handleNavigate = (index: number) => {
    setNavigationPath(navigationPath.slice(0, index + 1));
  };

  const currentLevel = navigationPath[navigationPath.length - 1]?.level || 'company';
  const currentId = navigationPath[navigationPath.length - 1]?.id;

  const employeesArray = Array.isArray(employees) ? employees : [];
  const branchesArray = Array.isArray(branches) ? branches : [];
  const teamsArray = Array.isArray(teams) ? teams : [];

  const groupedData = useMemo(() => {
    console.log('[SalarySchedule] Computing groupedData:', { currentLevel, currentId });

    if (currentLevel === 'company') {
      const branchGroups = branchesArray.map((branch: any) => {
        console.log('[SalarySchedule] Processing branch:', {
          id: branch.id,
          idType: typeof branch.id,
          name: branch.name
        });

        const branchEmployees = employeesArray.filter((e: any) => {
          const matches = e.branch_id && String(e.branch_id) === String(branch.id);
          console.log('[SalarySchedule] Employee comparison:', {
            employeeName: e.full_name,
            employeeBranchId: e.branch_id,
            employeeBranchIdType: typeof e.branch_id,
            branchId: branch.id,
            branchIdType: typeof branch.id,
            matches
          });
          return matches;
        });
        const totalSalary = branchEmployees.reduce((sum, e) => sum + e.total_salary, 0);
        return {
          id: branch.id,
          name: branch.name,
          count: branchEmployees.length,
          totalSalary,
          type: 'branch'
        };
      }).filter(b => b.count > 0);

      const noBranchEmployees = employeesArray.filter((e: any) => {
        const hasNoBranch = !e.branch_id;
        console.log('[SalarySchedule] No-branch check:', {
          employeeName: e.full_name,
          branchId: e.branch_id,
          branchIdType: typeof e.branch_id,
          hasNoBranch
        });
        return hasNoBranch;
      });
      if (noBranchEmployees.length > 0) {
        branchGroups.push({
          id: 'no-branch',
          name: 'Без филиала',
          count: noBranchEmployees.length,
          totalSalary: noBranchEmployees.reduce((sum, e) => sum + e.total_salary, 0),
          type: 'branch'
        });
      }

      console.log('[SalarySchedule] Branch groups:', branchGroups.length);
      return branchGroups;
    } else if (currentLevel === 'branch') {
      if (currentId === 'no-branch') {
        const result = employeesArray.filter((e: any) => !e.branch_id);
        console.log('[SalarySchedule] No-branch employees:', result.length);
        return result;
      }

      const branchEmployees = employeesArray.filter((e: any) => e.branch_id && String(e.branch_id) === String(currentId));
      const branchTeams = teamsArray.filter((t: any) => t.branch_id && String(t.branch_id) === String(currentId));
      console.log('[SalarySchedule] Branch employees:', branchEmployees.length, 'teams:', branchTeams.length);

      if (branchTeams.length === 0) {
        return branchEmployees;
      }

      const teamGroups = branchTeams.map((team: any) => {
        const teamEmployees = branchEmployees.filter((e: any) => e.team_id && String(e.team_id) === String(team.id));
        const totalSalary = teamEmployees.reduce((sum, e) => sum + e.total_salary, 0);
        return {
          id: team.id,
          name: team.name,
          count: teamEmployees.length,
          totalSalary,
          type: 'team'
        };
      }).filter(t => t.count > 0);

      const noTeamEmployees = branchEmployees.filter((e: any) => !e.team_id);
      if (noTeamEmployees.length > 0) {
        teamGroups.push({
          id: 'no-team',
          name: 'Без команды',
          count: noTeamEmployees.length,
          totalSalary: noTeamEmployees.reduce((sum, e) => sum + e.total_salary, 0),
          type: 'team'
        });
      }

      console.log('[SalarySchedule] Team groups:', teamGroups.length);
      return teamGroups.length > 0 ? teamGroups : branchEmployees;
    } else if (currentLevel === 'team') {
      if (currentId === 'no-team') {
        const branchItem = navigationPath.find(item => item.level === 'branch');
        if (branchItem?.id) {
          const result = employeesArray.filter((e: any) => e.branch_id && String(e.branch_id) === String(branchItem.id) && !e.team_id);
          console.log('[SalarySchedule] No-team employees:', result.length);
          return result;
        }
        return [];
      }

      const result = employeesArray.filter((e: any) => e.team_id && String(e.team_id) === String(currentId));
      console.log('[SalarySchedule] Team employees:', result.length);
      return result;
    }

    return [];
  }, [currentLevel, currentId, employeesArray, branchesArray, teamsArray, navigationPath]);

  const isGroupView = groupedData.length > 0 && groupedData[0]?.type !== undefined;

  console.log('[SalarySchedule] Render:', { isGroupView, groupedDataLength: groupedData.length });

  if (branchesError || teamsError || employeesError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <AlertCircle className="h-12 w-12 mb-4 text-red-500" />
        <p className="text-lg font-semibold mb-2">Ошибка загрузки данных</p>
        <div className="text-sm space-y-1">
          {branchesError && <p>• Филиалы: {(branchesError as Error).message}</p>}
          {teamsError && <p>• Команды: {(teamsError as Error).message}</p>}
          {employeesError && <p>• Сотрудники: {(employeesError as Error).message}</p>}
        </div>
        <Button
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['branches'] });
            queryClient.invalidateQueries({ queryKey: ['teams'] });
            queryClient.invalidateQueries({ queryKey: ['salaried-employees-list'] });
          }}
          className="mt-4"
        >
          Повторить попытку
        </Button>
      </div>
    );
  }

  if (branchesLoading || teamsLoading || employeesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (employeesArray.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Users className="h-12 w-12 mb-4 opacity-20" />
        <p>Нет сотрудников с окладом</p>
      </div>
    );
  }

  const currentMonthName = format(new Date(salaryYear, salaryMonth - 1, 1), 'LLLL', { locale: ru });

  return (
    <div className="space-y-4 md:space-y-8 animate-fade-in">
      <div className="mb-3 md:mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-lg md:text-2xl font-bold text-white">Зарплаты за {currentMonthName}</h2>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">Автоматический расчет на основе сделок</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(salaryMonth)} onValueChange={(v) => setSalaryMonth(Number(v))}>
            <SelectTrigger className="w-[130px] bg-zinc-900 border-white/10 text-white">
              <SelectValue placeholder="Месяц" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-white/10">
              {Array.from({ length: 12 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)} className="text-white focus:bg-white/10">
                  {format(new Date(2024, i, 1), 'LLLL', { locale: ru })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(salaryYear)} onValueChange={(v) => setSalaryYear(Number(v))}>
            <SelectTrigger className="w-[100px] bg-zinc-900 border-white/10 text-white">
              <SelectValue placeholder="Год" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-white/10">
              {[2024, 2025, 2026, 2027].map((y) => (
                <SelectItem key={y} value={String(y)} className="text-white focus:bg-white/10">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {navigationPath.length > 1 && (
        <HierarchyBreadcrumb path={navigationPath} onNavigate={handleNavigate} />
      )}

      {isGroupView ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-5">
          {groupedData.map((group: any) => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="cursor-pointer"
              onClick={() => handleDrillDown(group.id, group.name, currentLevel as 'company' | 'branch')}
            >
              <Card className="glass-card border-white/10 hover:border-primary/20 transition-all group h-full relative">
                <CardContent className="p-4 md:p-7 lg:p-8 relative z-10 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4 md:mb-8">
                    <div className="flex items-center gap-3 md:gap-4 min-w-0">
                      <div className="p-2 md:p-3 bg-primary/10 rounded-xl border border-primary/20 flex-shrink-0">
                        {group.type === 'branch' ? (
                          <Building2 className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                        ) : (
                          <Users className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-base md:text-xl text-white truncate group-hover:text-primary transition-colors">{group.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {group.count} {group.count === 1 ? 'сотрудник' : 'сотрудников'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1" />

                  <div className="border-t border-white/5 pt-3 md:pt-5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-semibold">Общая сумма выплат</p>
                    <p className="text-lg md:text-2xl lg:text-3xl font-mono font-bold text-white">
                      {Number(group.totalSalary).toLocaleString('ru-RU')} <span className="text-white/40 font-normal">₽</span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <Card className="glass-card border-white/10 overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr className="border-b border-white/10 bg-black/20">
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-white/35">Сотрудник</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-white/35">Должность</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-white/35">Оклад</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-white/35">Личный доход</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-white/35">Команда</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-white/35">Филиал</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-white/35">Осталось</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-white/35">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedData.map((emp: any) => {
                    const paidAmount = employeePaidAmounts.get(emp.id) || 0;
                    const remainingAmount = Math.max(0, (emp.total_salary || 0) - paidAmount);
                    const isFullyPaid = remainingAmount <= 0;

                    return (
                      <tr key={emp.id} className="border-b border-white/[0.05] hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="h-9 w-9 border border-white/10">
                              <AvatarImage src={getAvatarUrl(emp.avatar_url)} />
                              <AvatarFallback className="bg-zinc-800 text-[10px] font-bold">
                                {emp.full_name?.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-semibold text-white truncate">{emp.full_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{emp.position_name}</td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-white/80">{Number(emp.base_salary || 0).toLocaleString('ru-RU')} ₽</td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-emerald-400">{Number(paidAmount || 0).toLocaleString('ru-RU')} ₽</td>

                        <td className="px-4 py-3 text-right font-mono text-sm text-blue-400">{Number(emp.team_revenue || 0).toLocaleString('ru-RU')} ₽</td>
                        <td className="px-4 py-3 text-right font-mono text-sm text-purple-400">{Number(emp.department_revenue || 0).toLocaleString('ru-RU')} ₽</td>
                        <td className="px-4 py-3 text-right">
                          {isFullyPaid ? (
                            <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Выплачено
                            </Badge>
                          ) : (
                            <span className="font-mono font-semibold text-white">{Number(remainingAmount).toLocaleString('ru-RU')} ₽</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <PaymentBreakdownDialog
                            payrollYear={salaryYear}
                            payrollMonth={salaryMonth}
                            employee={{
                              id: emp.id,
                              full_name: emp.full_name,
                              base_salary: emp.base_salary,
                              personal_income: paidAmount,
                              mortgage_income: emp.mortgage_income,
                              mortgage_agent_income: emp.mortgage_agent_income,
                              mortgage_broker_income: emp.mortgage_broker_income,
                              team_revenue: emp.team_revenue,
                              department_revenue: emp.department_revenue,
                              commission: emp.commission,
                              total_salary: emp.total_salary,
                              uses_official_payroll: emp.uses_official_payroll,
                            }}
                            onPaymentComplete={addTransaction}
                            isProcessing={isAdding}
                            trigger={
                              <Button
                                size="sm"
                                className="gradient-accent text-primary-foreground shadow-lg shadow-primary/20 h-9 px-4 font-bold border-none"
                                disabled={isFullyPaid}
                              >
                                <Wallet className="h-4 w-4 mr-2" />
                                {isFullyPaid ? 'Готово' : 'Выплатить'}
                              </Button>
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
