import { useState, useEffect, useMemo, memo, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Search, Trophy,
  Check, Briefcase, X,
  Zap, Star, Mail, Phone, ChevronRight
} from 'lucide-react';
import { EmployeeProfileDialog } from '@/components/employees/EmployeeProfileDialog';
import { EmployeeFilters, defaultFilters } from '@/components/employees/EmployeeFilters';
import type { FilterState } from '@/components/employees/EmployeeFilters';
import { AddEmployeeDialog } from '@/components/settings/AddEmployeeDialog';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn, getAvatarUrl } from '@/lib/utils';
import { INPUT_WITH_LEADING_ICON } from '@/lib/inputClassNames';
import { useEmployees, usePositions } from '@/hooks/useEmployees';
import { parseUTCDate } from '@/lib/date-utils';
import { useSharedData } from '@/hooks/useSharedData';
import { localAPI } from '@/integrations/localAPI';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// ... (Employee Interfaces)
interface Employee {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  position_id: string | null;
  position?: {
    id: string;
    name: string;
    base_salary: number;
    commission_percent: number;
    access_level?: number;
    default_personal_kpi_min?: number;
    default_personal_kpi_max?: number;
    default_management_kpi_min?: number;
    default_management_kpi_max?: number;
  } | null;
  commission_percent: number;
  personal_kpi_current?: number;
  management_kpi_current?: number;
  has_salary: boolean;
  is_active: boolean;
  branch_id?: string;
  branch?: { id: string; name: string };
  team_id?: string;
  team?: { id: string; name: string };
  avatar_url?: string;
  created_at: string;
  realtor_type?: string;
  role?: string;
  custom_total_deals?: number;
  custom_total_objects?: number;
  custom_total_revenue?: number;
  registration_date?: string;
}

// Mock data for sparklines (Visual only, strictly specific to UI decoration)
const mockActivityData = [
  { value: 40 }, { value: 30 }, { value: 45 }, { value: 80 }, { value: 55 }, { value: 90 }, { value: 70 }
];

function Employees() {
  const navigate = useNavigate();
  const { accessLevel } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const { employees: rawEmployees, loading: employeesLoading } = useEmployees();
  // Ensure employees is always an array - defensive against API returning unexpected shapes
  const employees = useMemo(() => Array.isArray(rawEmployees) ? rawEmployees : [], [rawEmployees]);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);

  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const { positions } = usePositions();

  const positionsArray = Array.isArray(positions) ? positions : [];
  const sortedPositionsForFilter = useMemo(() => {
    const positionOrder = [
      'pos-director',
      'pos-admin',
      'pos-comm',
      'pos-rop',
      'pos-mop',
      'pos-mortgage',
      'pos-realtor'
    ];
    return [...positionsArray].sort((a, b) => {
      const indexA = positionOrder.indexOf(a.id);
      const indexB = positionOrder.indexOf(b.id);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [positions]);

  // Централизованные API запросы через useSharedData
  const { branches, teams, isLoading: sharedDataLoading } = useSharedData();

  const loading = employeesLoading || sharedDataLoading;

  const [visibleCount, setVisibleCount] = useState(20);

  // Filter & Sort Logic
  const filteredEmployees = useMemo(() => {

    const getFallbackWeight = (emp: any) => {
      const posName = String(emp?.position?.name || emp?.position_name || '').toLowerCase();
      if (posName.includes('директор')) return 100;
      if (posName.includes('коммерческ')) return 80;
      if (posName.includes('роп')) return 70;
      if (posName.includes('моп')) return 60;
      if (posName.includes('ипот')) return 55;
      return 0;
    }; // fallback only when sort_order missing



    const employeesArray = Array.isArray(employees) ? employees : [];
    return employeesArray
      .filter(emp => {
        const searchLower = String(searchQuery || '').toLowerCase();
        const matchesSearch = !searchQuery ||
          (emp.full_name ? String(emp.full_name).toLowerCase().includes(searchLower) : false) ||
          (emp.email ? String(emp.email).toLowerCase().includes(searchLower) : false) ||
          (emp.phone ? String(emp.phone).includes(searchQuery) : false);

        const matchesPosition = filters.positionId === 'all' ||
          (filters.positionId === 'none' ? !emp.position_id : emp.position_id === filters.positionId);

        const matchesBranch = filters.branchId === 'all' || (emp.branch_id === filters.branchId);
        const matchesTeam = !filters.teamId || filters.teamId === 'all' || (emp.team_id === filters.teamId);
        const matchesStatus = filters.status === 'all' || (filters.status === 'active' ? emp.is_active : !emp.is_active);

        return matchesSearch && matchesPosition && matchesBranch && matchesTeam && matchesStatus;
      })
      .sort((a, b) => {
        // Primary sort by position sort_order (lower is higher hierarchy)
        const orderA = a.position?.sort_order ?? 999;
        const orderB = b.position?.sort_order ?? 999;

        if (orderA !== orderB) return orderA - orderB;

        // Secondary sort: if both have no sort_order, apply a position-name heuristic.
        if (orderA === 999 && orderB === 999) {
          const weightA = getFallbackWeight(a);
          const weightB = getFallbackWeight(b);
          if (weightA !== weightB) return weightB - weightA;
        }

        return (a.full_name || '').localeCompare(b.full_name || '');
      });
  }, [employees, searchQuery, filters]);

  const displayedEmployees = useMemo(() => {
    return filteredEmployees.slice(0, visibleCount);
  }, [filteredEmployees, visibleCount]);

  // Infinite Scroll Logic
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && visibleCount < filteredEmployees.length) {
        setVisibleCount(prev => prev + 20);
      }
    }, { threshold: 0.1 });

    const target = document.getElementById('scroll-trigger');
    if (target) observer.observe(target);

    return () => {
      if (target) observer.unobserve(target);
    };
  }, [filteredEmployees.length, visibleCount]);

  useEffect(() => {
    setVisibleCount(20); // Reset when filters change
  }, [searchQuery, filters]);

  // KPIs
  const employeesArray = Array.isArray(employees) ? employees : [];
  const activeCount = employeesArray.filter(e => e.is_active).length;
  const totalCommission = employeesArray.reduce((acc, curr) => acc + (curr.commission_percent || 0), 0) / (employeesArray.length || 1);

  const handleView = (id: string) => {
    // Руководители (>= 50) могут переходить в профиль, сотрудники - нет
    if (accessLevel >= 50) {
      navigate(`/employees/${id}`, { state: { from: '/employees' } });
    }
  };


  return (
    <MainLayout>
      <div className="space-y-6 md:space-y-8 lg:space-y-12 animate-fade-in max-w-[1600px] mx-auto pb-16 md:pb-20 lg:pb-28 pt-4 md:pt-6 lg:pt-8 px-4 sm:px-8">

        {/* === PREMIUM HEADER === */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6 lg:gap-8 mb-4">
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <div className="mb-2 md:mb-3">
              <img src="/logo-panel.svg" alt="Logo" className="h-5 md:h-6 lg:h-7 w-auto object-contain opacity-40" />
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-5xl xl:text-6xl font-black text-white uppercase tracking-tighter leading-none">
              СОТРУДНИКИ
            </h1>
            <p className="text-xs md:text-sm font-black text-white/20 uppercase tracking-[0.3em] md:tracking-[0.4em] flex items-center gap-2 md:gap-3">
              <span className="w-8 md:w-12 h-px bg-white/10" />
              Управление штатом и мониторинг KPI
            </p>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <AddEmployeeDialog />
            <EmployeeProfileDialog
              open={isViewOpen}
              onOpenChange={setIsViewOpen}
              employee={viewingEmployee}
              canEdit={false}
            />
          </div>
        </div>

        {/* === BENTO STATS GRID === */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-5 lg:gap-6">
          {/* Active Count Card */}
          <div className="relative overflow-hidden rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] bg-zinc-900/40 border border-white/5 p-5 md:p-6 lg:p-8 backdrop-blur-3xl group shadow-2xl">
            <div className="absolute top-0 right-0 w-24 md:w-28 lg:w-32 h-24 md:h-28 lg:h-32 bg-primary/10 blur-[60px] rounded-full pointer-events-none group-hover:bg-primary/15 transition-all duration-1000" />
            <div className="relative z-10 space-y-3 md:space-y-4">
              <div className="p-2.5 md:p-3 bg-primary/10 rounded-xl md:rounded-2xl border border-primary/10 w-fit shadow-lg shadow-primary/5">
                <Users className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-3xl md:text-4xl font-black text-white tabular-nums tracking-tighter">{activeCount}</h2>
                <div className="flex flex-col mt-1">
                  <p className="text-[9px] md:text-[10px] font-black text-white/20 uppercase tracking-[0.15em] md:tracking-[0.2em]">Активных сотрудников</p>
                  <p className="text-[7px] md:text-[8px] font-bold text-primary/60 uppercase tracking-widest mt-1">
                    +{employeesArray.filter(e => parseUTCDate(e.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length} за неделю
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Average Commission Card */}
          <div className="relative overflow-hidden rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] bg-zinc-900/40 border border-white/5 p-5 md:p-6 lg:p-8 backdrop-blur-3xl group shadow-2xl">
            <div className="absolute top-0 right-0 w-24 md:w-28 lg:w-32 h-24 md:h-28 lg:h-32 bg-white/5 blur-[60px] rounded-full pointer-events-none group-hover:bg-white/10 transition-all duration-1000" />
            <div className="relative z-10 space-y-4 md:space-y-5 lg:space-y-6">
              <div className="p-2.5 md:p-3 bg-white/5 rounded-xl md:rounded-2xl border border-white/5 w-fit shadow-lg shadow-white/5">
                <Zap className="h-5 w-5 md:h-6 md:w-6 text-white/60" />
              </div>
              <div className="space-y-3 md:space-y-4">
                <div>
                  <h2 className="text-3xl md:text-4xl font-black text-white tabular-nums tracking-tighter">{Math.round(totalCommission)}%</h2>
                  <p className="text-[9px] md:text-[10px] font-black text-white/20 uppercase tracking-[0.15em] md:tracking-[0.2em] mt-1">Средняя комиссия</p>
                </div>
                <Progress value={totalCommission} max={60} className="h-1.5 bg-white/5" indicatorClassName="bg-white/40 shadow-[0_0_10px_rgba(255,255,255,0.1)]" />
              </div>
            </div>
          </div>

          {/* Top Performer Card (Wide) */}
          {(() => {
            const employeesArray = Array.isArray(employees) ? employees : [];
            const topPerformer = [...employeesArray].sort((a, b) => {
              const kpiA = a.personal_kpi_current || a.commission_percent || 0;
              const kpiB = b.personal_kpi_current || b.commission_percent || 0;
              return kpiB - kpiA;
            })[0];

            return (
              <div className="md:col-span-2 relative overflow-hidden rounded-xl md:rounded-[1.5rem] lg:rounded-[2.5rem] bg-zinc-900/40 border border-white/5 p-5 md:p-6 lg:p-8 backdrop-blur-3xl group shadow-2xl flex items-center gap-4 md:gap-6 lg:gap-8">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent opacity-50" />
                <div className="absolute -right-8 md:-right-10 lg:-right-12 -top-8 md:-top-10 lg:-top-12 w-48 md:w-56 lg:w-64 h-48 md:h-56 lg:h-64 bg-amber-500/10 blur-[80px] rounded-full pointer-events-none group-hover:bg-amber-500/15 transition-all duration-1000" />

                {topPerformer ? (
                  <>
                    <div className="relative shrink-0">
                      <div className="absolute inset-0 bg-amber-500/20 rounded-xl md:rounded-[1.5rem] lg:rounded-2xl blur-[20px] animate-pulse" />
                      <Avatar className="h-20 w-20 md:h-22 md:w-22 lg:h-24 lg:w-24 rounded-xl md:rounded-[1.5rem] lg:rounded-2xl border-2 border-amber-500/20 shadow-2xl relative z-10">
                        <AvatarImage src={getAvatarUrl(topPerformer.avatar_url)} className="object-cover" />
                        <AvatarFallback className="bg-amber-600/20 text-amber-500 font-black text-3xl md:text-4xl">{topPerformer.full_name?.charAt(0) || 'T'}</AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-1.5 md:-bottom-2 -right-1.5 md:-right-2 p-1 md:p-1.5 bg-amber-500 rounded-md md:rounded-lg shadow-lg z-20">
                        <Trophy className="h-3.5 w-3.5 md:h-4 md:w-4 text-zinc-900" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 md:gap-2 mb-1.5 md:mb-2">
                        <span className="text-[8px] md:text-[9px] font-black uppercase text-amber-500 tracking-[0.25em] md:tracking-[0.3em]">Лидер штата</span>
                        <div className="h-px flex-1 bg-amber-500/20" />
                      </div>
                      <h3 className="text-xl md:text-2xl font-black text-white truncate uppercase tracking-tight">{topPerformer.full_name ?? 'Сотрудник'}</h3>
                      <p className="text-[10px] md:text-xs font-bold text-white/30 uppercase tracking-widest mt-0.5 md:mt-1">{topPerformer.position?.name ?? 'Сотрудник'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[9px] md:text-[10px] font-black text-amber-500/40 uppercase tracking-[0.15em] md:tracking-[0.2em] mb-0.5 md:mb-1">KPI</p>
                      <div className="text-4xl md:text-5xl font-black text-white tabular-nums tracking-tighter leading-none">
                        {Math.round(topPerformer.personal_kpi_current || topPerformer.commission_percent || 0)}
                        <span className="text-lg md:text-xl text-white/20 ml-0.5 md:ml-1">%</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-white/20 text-[10px] md:text-xs font-black uppercase tracking-widest">Нет данных для рейтинга</div>
                )}
              </div>
            );
          })()}
        </div>

        {/* === FILTER BAR === */}
        <div className="sticky top-4 z-40">
          <div className="p-1.5 md:p-2 rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] bg-zinc-950/80 border border-white/10 backdrop-blur-3xl shadow-2xl flex flex-col md:flex-row gap-2 md:gap-3">
            <div className="relative flex-1 group/search">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-3.5 w-3.5 md:h-4 md:w-4 -translate-y-1/2 text-white/20 group-hover/search:text-primary transition-colors duration-300" aria-hidden />
              <Input
                placeholder="Поиск по базе сотрудников..."
                className={cn(INPUT_WITH_LEADING_ICON, 'h-12 md:h-14')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Поиск сотрудников по имени, email или телефону"
              />
            </div>
            <EmployeeFilters
              filters={filters}
              onFiltersChange={setFilters}
              positions={sortedPositionsForFilter}
              branches={branches}
              teams={teams}
            />
          </div>
        </div>

        {/* === GRID === */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5 lg:gap-6 xl:gap-8" role="status" aria-label="Загрузка сотрудников">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="h-64 bg-zinc-900/40 rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] border border-white/5 animate-pulse" />
            ))}
            <span className="sr-only">Загрузка списка сотрудников...</span>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="py-24 md:py-32 lg:py-40 flex flex-col items-center justify-center text-center space-y-4 md:space-y-5 lg:space-y-6">
            <div className="p-6 md:p-7 lg:p-8 rounded-2xl md:rounded-[2.5rem] lg:rounded-[3rem] bg-white/[0.02] border border-dashed border-white/5">
              <Users className="h-10 w-10 md:h-11 md:w-11 lg:h-12 lg:w-12 text-white/5" />
            </div>
            <div className="space-y-1.5 md:space-y-2">
              <p className="text-xl md:text-2xl font-black text-white/20 uppercase tracking-tighter">Сотрудники не найдены</p>
              <p className="text-[9px] md:text-[10px] font-bold text-white/10 uppercase tracking-[0.15em] md:tracking-[0.2em]">Попробуйте сбросить фильтры или изменить запрос</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 md:gap-6 lg:gap-7 xl:gap-8">
              <AnimatePresence mode="popLayout">
                {(Array.isArray(displayedEmployees) ? displayedEmployees : []).map((emp, i) => (
                  <EmployeeCard
                    key={emp.id}
                    employee={emp}
                    index={i}
                    accessLevel={accessLevel}
                    onView={() => handleView(emp.id)}
                  />
                ))}
              </AnimatePresence>
            </div>

            {/* Scroll Trigger */}
            <div id="scroll-trigger" className="h-32 md:h-36 lg:h-40 w-full flex items-center justify-center">
              {visibleCount < filteredEmployees.length && (
                <div className="flex items-center gap-3 md:gap-4 text-white/20 animate-pulse bg-white/5 px-6 md:px-7 lg:px-8 py-2.5 md:py-3 rounded-xl md:rounded-2xl border border-white/5">
                  <div className="h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-primary/40 shadow-[0_0_10px_rgba(var(--primary),0.4)]" />
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.25em] md:tracking-[0.3em]">Загрузка базы данных</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}

// --- Internal Components ---

type EmployeeCardProps = {
  employee: Employee;
  index: number;
  onView: () => void;
  accessLevel: number;
};

const EmployeeCard = forwardRef<HTMLDivElement, EmployeeCardProps>(
  function EmployeeCard({ employee, index, onView, accessLevel }, ref) {
    // Руководители (>= 50) могут кликать на профили, сотрудники - нет
    const canClick = accessLevel >= 50;
    return (
      <motion.div
        ref={ref}
        layout
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ delay: (index % 12) * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        onClick={() => { if (canClick) onView(); }}
        className={cn(
          "group relative rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] xl:rounded-[2.5rem] bg-zinc-900/40 backdrop-blur-3xl border transition-all duration-700 overflow-hidden h-full flex flex-col",
          canClick ? "border-white/5 hover:border-white/20 hover:shadow-2xl hover:bg-zinc-900/60 cursor-pointer" : "border-white/5 cursor-default"
        )}
      >
        {/* Background Decor - Radial Glow instead of crooked blocks */}
        <div className="absolute top-0 right-0 w-36 md:w-40 lg:w-48 h-36 md:h-40 lg:h-48 bg-primary/10 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none group-hover:bg-primary/20 transition-all duration-1000" />

        <div className="p-5 md:p-6 lg:p-7 xl:p-8 flex-1">
          <div className="flex items-start justify-between mb-5 md:mb-6 lg:mb-7 xl:mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-xl md:rounded-[1.5rem] blur-[20px] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              <Avatar className="h-16 w-16 md:h-18 md:w-18 lg:h-20 lg:w-20 rounded-xl md:rounded-[1.5rem] border-2 border-white/5 relative z-10 transition-transform duration-700 group-hover:scale-105 group-hover:-rotate-3 shadow-xl">
                <AvatarImage src={getAvatarUrl(employee.avatar_url)} className="object-cover" />
                <AvatarFallback className="bg-zinc-800 text-white/20 font-black text-xl md:text-2xl uppercase">{employee.full_name?.substring(0, 2) || 'NA'}</AvatarFallback>
              </Avatar>
              <div className={cn(
                "absolute -bottom-1 md:-bottom-1.5 -right-1 md:-right-1.5 h-4 w-4 md:h-5 md:w-5 rounded-lg border-2 border-zinc-900 z-20 shadow-lg transition-transform duration-500 group-hover:scale-110",
                employee.is_active ? "bg-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]" : "bg-zinc-500"
              )} />
            </div>

            <div className="flex flex-col items-end gap-1.5 md:gap-2">
              <span className={cn(
                "px-2.5 md:px-3 py-0.5 md:py-1 rounded-md md:rounded-lg text-[7px] md:text-[8px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] border backdrop-blur-xl transition-all duration-500",
                employee.is_active ? "bg-primary/10 border-primary/20 text-white" : "bg-zinc-500/10 border-white/5 text-zinc-500"
              )}>
                {employee.is_active ? 'Активен' : 'Оффлайн'}
              </span>
              {employee.realtor_type && (
                <div className={cn(
                  "px-2.5 md:px-3 py-0.5 md:py-1 rounded-md md:rounded-lg text-[7px] md:text-[8px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] border",
                  employee.realtor_type === 'secondary' ? 'bg-primary/5 border-primary/10 text-primary' :
                    employee.realtor_type === 'newbuildings' ? 'bg-purple-500/5 border-purple-500/10 text-purple-400' :
                      'bg-white/5 border-white/10 text-white/60'
                )}>
                  {employee.realtor_type === 'secondary' ? 'Вторичка' :
                    employee.realtor_type === 'newbuildings' ? 'Новостройки' : 'Универсал'}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 md:space-y-5 lg:space-y-6 mb-5 md:mb-6 lg:mb-7 xl:mb-8">
            <div className="space-y-0.5 md:space-y-1 min-h-[3.5rem] md:min-h-[4rem] lg:min-h-[4.5rem] flex flex-col justify-end">
              <h3 className={cn(
                "font-black text-white text-lg md:text-xl tracking-tight leading-tight uppercase transition-colors duration-500 line-clamp-2",
                canClick ? "group-hover:text-primary" : ""
              )}>{employee?.full_name ?? 'Сотрудник'}</h3>
              <p className="text-[9px] md:text-[10px] font-bold text-white/20 uppercase tracking-[0.15em] md:tracking-[0.2em] truncate">{employee?.position?.name ?? 'Должность не указана'}</p>
            </div>

            <div className="p-4 md:p-5 rounded-xl md:rounded-[1.5rem] bg-white/[0.03] border border-white/5 space-y-2.5 md:space-y-3 min-h-[2.5rem] md:min-h-[3rem] lg:min-h-[3.5rem] flex flex-col justify-center">
              <div className="flex items-center gap-2.5 md:gap-3">
                <div className="p-1 md:p-1.5 rounded-md md:rounded-lg bg-zinc-500/10 border border-white/10">
                  <Users className="h-2.5 w-2.5 md:h-3 md:w-3 text-zinc-500" />
                </div>
                <span className="text-[8px] md:text-[9px] font-bold text-white/40 uppercase tracking-widest truncate">{employee?.team?.name ?? 'Без команды'}</span>
              </div>
            </div>
          </div>

          <div className="mt-auto space-y-2.5 md:space-y-3 px-1">
            {(() => {
              const posName = (employee?.position?.name || '').toLowerCase();
              const empAccessLevel = employee?.position?.access_level ?? 0;
              const isDirectorOrAdmin = empAccessLevel >= 90 || posName.includes('директор') || posName.includes('админ');
              const isComm = posName.includes('коммерческий');

              if (isDirectorOrAdmin && !isComm) return false;
              return true;
            })() && (
              <div>
                <div className="flex justify-between items-center text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] mb-1.5">
                  <span className="text-white/20 group-hover:text-white/40 transition-colors">Ставка</span>
                  <span className="text-primary transition-all duration-500 group-hover:text-primary/80 tabular-nums">
                    {Math.round(employee.personal_kpi_current ?? employee.commission_percent ?? 0)}%
                  </span>
                </div>
                <Progress
                  value={(() => {
                    const min = employee.position?.default_personal_kpi_min || 40;
                    const max = employee.position?.default_personal_kpi_max || 60;
                    const current = employee.personal_kpi_current || min;
                    return Math.min(100, Math.max(0, ((current - min) / (max - min)) * 100));
                  })()}
                  className="h-1.5 md:h-2 bg-white/5 rounded-full overflow-hidden"
                  indicatorClassName="bg-primary/60 group-hover:bg-primary transition-all duration-700 shadow-[0_0_15px_rgba(var(--primary),0.4)]"
                />
              </div>
            )}

            {(() => {
              const posName = (employee?.position?.name || '').toLowerCase();
              const empAccessLevel = (employee?.position as any)?.access_level ?? 0;
              const isDirectorOrAdmin = empAccessLevel >= 90 || posName.includes('директор') || posName.includes('админ');
              const isComm = posName.includes('коммерческий');

              // Hide for Directors and Admins, unless it's Commercial Director
              if (isDirectorOrAdmin && !isComm) return false;

              return (employee?.position?.default_management_kpi_max ?? 0) > 0 ||
                posName.includes('моп') ||
                posName.includes('роп');
            })() && (
                <div>
                  <div className="flex justify-between items-center text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] mb-1.5">
                    <span className="text-purple-400/40 group-hover:text-purple-400/60 transition-colors">Упр. Ставка</span>
                    <span className="text-purple-400 transition-all duration-500 group-hover:text-purple-300 tabular-nums">
                      {Math.round(employee.management_kpi_current ?? 0)}%
                    </span>
                  </div>
                  <Progress
                    value={(() => {
                      const min = employee.position?.default_management_kpi_min || 3;
                      const max = employee.position?.default_management_kpi_max || 5;
                      const current = employee.management_kpi_current || min;
                      return Math.min(100, Math.max(0, ((current - min) / (max - min)) * 100));
                    })()}
                    className="h-1.5 md:h-2 bg-purple-500/5 rounded-full overflow-hidden"
                    indicatorClassName="bg-purple-500/60 group-hover:bg-purple-400 transition-all duration-700 shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                  />
                </div>
              )}
          </div>
        </div>


      </motion.div>
    );
  }
);

export default memo(Employees);
