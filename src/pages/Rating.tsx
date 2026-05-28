import { useState, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Target, TrendingUp, Building2, Clock, Landmark, Crown, Calendar, Users, ChevronRight } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn, getAvatarUrl } from '@/lib/utils';
import { getPositionName, getRatingAccessLevel, isRatingParticipant } from '@/lib/positions';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useSharedData } from '@/hooks/useSharedData';
import { startOfMonth, startOfQuarter, startOfYear, endOfMonth, endOfQuarter, endOfYear, endOfDay } from 'date-fns';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { useNavigate } from 'react-router-dom';

interface CategoryDef {
  id: string;
  name: string;
  icon: React.ElementType;
  reportTypes: string[];
  metric: 'count' | 'revenue' | 'attendance';
  planKey: string;
}

const CATEGORIES: CategoryDef[] = [
  { id: 'overall', name: 'Общий', icon: Trophy, reportTypes: [], metric: 'count', planKey: '' },
  { id: 'deposits', name: 'Задатки', icon: Target, reportTypes: ['deposit'], metric: 'count', planKey: 'target_deposits' },
  { id: 'objects', name: 'Набор базы', icon: Landmark, reportTypes: ['object'], metric: 'count', planKey: 'target_objects' },
  { id: 'revenue', name: 'Валовая выручка', icon: TrendingUp, reportTypes: ['deal', 'deposit', 'sale', 'purchase', 'booking'], metric: 'revenue', planKey: 'target_revenue' },
];

type TimeFilter = 'all' | 'year' | 'quarter' | 'month';
type ViewMode = 'employees' | 'teams';

interface UserScore {
  userId: string;
  name: string;
  avatar: string;
  value: number;
  planPercent: number;   // 0-100 for non-overall
  overallScore: number;  // 0-5 for overall
  isCurrentUser: boolean;
  role?: string;
  positionName?: string;
  teamId?: string;
  teamName?: string;
}

interface TeamScore {
  teamId: string;
  name: string;
  memberCount: number;
  avgScore: number; // 0-5
  planCompletion: number; // 0-100
  totalRevenue: number;
  totalValue: number;
}

function Rating() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState('overall');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('month');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('employees');

  const { user, accessLevel } = useAuth();

  const myPosition = useMemo(() => getPositionName(user as any), [user]);
  const access = useMemo(() => getRatingAccessLevel(myPosition), [myPosition]);

  // Safe fallbacks: if we cannot determine required IDs for a role, do not hard-lock filters.
  const effectiveAccess = useMemo(() => {
    if (access === 'rop' && !(user as any)?.branch_id) return 'none';
    if (access === 'team' && !(user as any)?.team_id) return 'none';
    return access || 'none';
  }, [access, user]);

  // Missing-scope safety: prevent unscoped /kpi/leaderboard fetch.
  const missingScope = useMemo(() => {
    if (access === 'rop' && !(user as any)?.branch_id) return true;
    if (access === 'team' && !(user as any)?.team_id) return true;
    return false;
  }, [access, user]);

  const missingScopeMessage = useMemo(() => {
    if (access === 'rop' && !(user as any)?.branch_id) return 'Филиал не назначен';
    if (access === 'team' && !(user as any)?.team_id) return 'Команда не назначена';
    return 'Недостаточно данных для отображения рейтинга';
  }, [access, user]);

  const isAdminAccess = effectiveAccess === 'admin';
  const isRopAccess = effectiveAccess === 'rop';
  const isTeamAccess = effectiveAccess === 'team';

  // Централизованные API запросы через useSharedData
  const { branches, teams } = useSharedData();

  // Director check: only directors (access_level >= 90) can select branch
  const isDirector = (user as any)?.access_level >= 90;

  // Фильтрация команд по роли и выбранному филиалу
  const allTeams = useMemo(() => {
    const teamsArray = Array.isArray(teams) ? teams : [];
    let filtered = [...teamsArray];

    if (isAdminAccess) {
      if (selectedBranchId && selectedBranchId !== 'all') {
        filtered = filtered.filter((t: any) => t.branch_id === selectedBranchId);
      }
    } else if (isRopAccess && (user as any)?.branch_id) {
      filtered = filtered.filter((t: any) => t.branch_id === (user as any)?.branch_id);
    } else if (isTeamAccess && (user as any)?.team_id) {
      filtered = filtered.filter((t: any) => t.id === (user as any)?.team_id);
    } else {
      // For non-directors: filter by user's branch only
      if ((user as any)?.branch_id) {
        filtered = filtered.filter((t: any) => t.branch_id === (user as any)?.branch_id);
      }
    }

    return filtered;
  }, [teams, selectedBranchId, isAdminAccess, isRopAccess, isTeamAccess, user]);

  // Determine effective filters (positions-only gating; safe fallbacks)
  const effectiveBranchId = useMemo(() => {
    console.log('[Rating] effectiveAccess:', effectiveAccess, 'selectedBranchId:', selectedBranchId, 'user.branch_id:', (user as any)?.branch_id);
    if (effectiveAccess === 'admin') return selectedBranchId === 'all' ? undefined : selectedBranchId;
    if (effectiveAccess === 'rop') return selectedBranchId === 'all' ? (user as any)?.branch_id || undefined : selectedBranchId;
    // For non-directors: always use their own branch (no branch selection allowed)
    if (!isDirector && (user as any)?.branch_id) return (user as any)?.branch_id;
    // For non-admin/rop users, allow branch selection
    return selectedBranchId === 'all' ? undefined : selectedBranchId;
  }, [effectiveAccess, selectedBranchId, user, isDirector]);

  const effectiveTeamId = useMemo(() => {
    if (effectiveAccess === 'admin') return selectedTeamId === 'all' ? undefined : selectedTeamId;
    if (effectiveAccess === 'rop') return selectedTeamId === 'all' ? undefined : selectedTeamId;
    if (effectiveAccess === 'team') return (user as any)?.team_id || undefined;
    return undefined;
  }, [effectiveAccess, selectedTeamId, user]);

  const showTeamSelect = effectiveAccess === 'admin' || effectiveAccess === 'rop';

  // Normalize selected values for UI when we hard-lock by position
  // NOTE: Do NOT lock branchSelectValue - this prevents the selector from showing the user's actual selection
  const branchSelectValue = selectedBranchId;
  const teamSelectValue = effectiveAccess === 'team' && (user as any)?.team_id ? String((user as any)?.team_id) : selectedTeamId;

  // Calculate Dates
  const { start, end } = useMemo(() => {
    const now = new Date();
    let s = startOfMonth(now);
    let e = endOfMonth(now);
    if (timeFilter === 'year') {
      s = startOfYear(now);
      e = endOfYear(now);
    }
    if (timeFilter === 'quarter') {
      s = startOfQuarter(now);
      e = endOfQuarter(now);
    }
    if (timeFilter === 'all') return { start: 'all', end: endOfQuarter(now).toISOString() };
    return { start: s.toISOString(), end: e.toISOString() };
  }, [timeFilter]);

  // Fetch all user plans for targets
  const { data: allUserPlans } = useQuery({
    queryKey: ['rating-all-user-plans', timeFilter],
    queryFn: async () => {
      try {
        let url = '/plans/users-plans';
        const now = new Date();
        if (timeFilter === 'month') {
          url += `?month=${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        } else if (timeFilter === 'quarter') {
          const q = Math.ceil((now.getMonth() + 1) / 3);
          url += `?year=${now.getFullYear()}&quarter=${q}`;
        } else if (timeFilter === 'year') {
          url += `?year=${now.getFullYear()}`;
        }

        const { data } = await localAPI.request(url);
        return data as Record<string, any>;
      } catch (e) {
        return {};
      }
    },
    // Plans are relatively static and this endpoint can be heavy.
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  });

  // NOTE: This query is unused in the component render/logic and creates extra network requests.
  // const { data: currentPlan } = useQuery({
  //   queryKey: ['rating-my-plan-targets', user?.id, timeFilter],
  //   queryFn: async () => {
  //     try {
  //       const { data } = await localAPI.request('/plans/my-plan');
  //       return data;
  //     } catch (e) {
  //       return null;
  //     }
  //   },
  // });

  // (If you later need it for UI, re-enable with a staleTime as well.)

  const getDefaultTarget = (planKey: string) => {
    const defaults: Record<string, number> = {
      target_revenue: 5000000,
      target_deals: 15,
      target_deposits: 7,
      target_objects: 20,
      target_newbuildings: 3,
      target_attendance: 22
    };
    const factor = timeFilter === 'quarter' ? 3 : timeFilter === 'year' ? 12 : 1;
    return (defaults[planKey] || 1) * factor;
  };

  // Fetch leaderboard
  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ['rating-leaderboard', effectiveBranchId, effectiveTeamId, start, end],
    enabled: !missingScope,
    queryFn: async () => {
      let url = `/kpi/leaderboard?start=${start}&end=${end}`;
      if (effectiveBranchId) url += `&branch=${effectiveBranchId}`;
      if (effectiveTeamId) url += `&team=${effectiveTeamId}`;
      console.log('[Rating] Fetching leaderboard:', url);
      const { data, error } = await localAPI.request(url);
      if (error) throw error;
      console.log('[Rating] Leaderboard data:', data?.length, 'users');
      return data || [];
    },
    // Reduce staleTime to ensure refetch when branch changes
    staleTime: 5_000,
    gcTime: 2 * 60_000,
  });

  // Transform to UserScore
  const scores: UserScore[] = useMemo(() => {
    const leaderboardArray = Array.isArray(leaderboard) ? leaderboard : [];
    return leaderboardArray.map((p: any) => {
      const positionName = getPositionName(p);
      // Determine which value to display based on active category
      let value = 0;
      let planPercent = p.planCompletion || 0;

      if (activeCategory === 'deposits') {
        value = p.deposits || 0;
        // If we have detailed plan data, we could calculate specific plan % here
        // But the user seems to want "сколько выполнено плана" generally
      } else if (activeCategory === 'objects') {
        value = p.takes || 0;
      } else if (activeCategory === 'revenue') {
        value = p.revenue || 0;
      } else {
        // For 'overall', show total of all metrics or use a summary value
        value = (p.deposits || 0) + (p.takes || 0);
      }

      // If backend doesn't provide planCompletion for non-month, and we have allUserPlans
      if (!planPercent && allUserPlans && allUserPlans[p.userId]) {
        const userPlan = allUserPlans[p.userId];
        const revPlan = userPlan.target_revenue || 1;
        const depPlan = userPlan.target_deposits || 1;
        const objPlan = userPlan.target_objects || 1;

        const revPerc = (p.revenue || 0) / revPlan;
        const depPerc = (p.deposits || 0) / depPlan;
        const objPerc = (p.takes || 0) / objPlan;

        // Simple average for overall plan completion
        planPercent = ((revPerc + depPerc + objPerc) / 3) * 100;
      }

      return {
        userId: p.userId || `unknown-${Math.random()}`,
        name: p.name || 'Неизвестно',
        avatar: p.avatar || '??',
        value: Number(value || 0),
        planPercent: Number(planPercent || 0),
        overallScore: Number(p.rating || 0),
        isCurrentUser: p.userId === user?.id,
        role: p.role || '',
        positionName,
        teamId: p.teamId,
        teamName: p.teamName,
      };
    }).sort((a: UserScore, b: UserScore) => {
      // Priority sorting based on active category
      if (activeCategory === 'overall') {
        return (b.overallScore || 0) - (a.overallScore || 0);
      }
      // If categories match but values are equal, sort by overall rating
      if (b.value !== a.value) {
        return (b.value || 0) - (a.value || 0);
      }
      return (b.overallScore || 0) - (a.overallScore || 0);
    });
  }, [leaderboard, activeCategory, user?.id, allUserPlans]);

  // Filter out excluded positions from employee rating (positions-only)
  const filteredScores = useMemo(() => {
    const scoresArray = Array.isArray(scores) ? scores : [];
    return scoresArray.filter((s: any) => isRatingParticipant(s.positionName));
  }, [scores, isRatingParticipant]);

  const displayScores = viewMode === 'employees' ? filteredScores : scores; // keep current-user rank stable when toggling

  const currentUserScore = displayScores.find((s: any) => s.isCurrentUser);
  const currentUserRank = displayScores.findIndex((s: any) => s.isCurrentUser) + 1;

  // Team scores (aggregate from leaderboard)
  const teamScores: TeamScore[] = useMemo(() => {
    if (viewMode !== 'teams') return [];

    const normalizeId = (id: any) => id ? String(id).toLowerCase().trim() : null;
    const teamMap: Record<string, any[]> = {};

    // Initialize map with all available teams
    const allTeamsArray = Array.isArray(allTeams) ? allTeams : [];
    allTeamsArray.forEach((t: any) => {
      const tid = normalizeId(t.id);
      if (tid) teamMap[tid] = [];
    });

    // Populate with leaderboard data (exclude non-participants)
    const leaderboardArray = Array.isArray(leaderboard) ? leaderboard : [];
    leaderboardArray
      .filter((p: any) => isRatingParticipant(getPositionName(p)))
      .forEach((p: any) => {
        const tid = normalizeId(p.teamId);
        if (tid && teamMap[tid]) {
          teamMap[tid].push(p);
        } else if (tid && tid !== 'null') {
          // If team not in allTeams but user has it (should be rare)
          teamMap[tid] = [p];
        }
      });

    return Object.entries(teamMap).map(([tid, members]) => {
      // For teams: use overall rating and plan completion from backend
      // Only the displayed value changes based on active category

      let totalValue = 0;
      let avgRating = 0;
      let avgPlanCompletion = 0;

      if (members.length > 0) {
        // Calculate average overall rating (0-5) from backend
        avgRating = members.reduce((sum, m) => sum + (m.rating || 0), 0) / members.length;

        // Calculate average overall plan completion (%) from backend
        avgPlanCompletion = members.reduce((sum, m) => sum + (m.planCompletion || 0), 0) / members.length;

        // Calculate total value based on active category
        if (activeCategory === 'deposits') {
          totalValue = members.reduce((s, m) => s + (m.deposits || 0), 0);
        } else if (activeCategory === 'objects') {
          totalValue = members.reduce((s, m) => s + (m.takes || 0), 0);
        } else if (activeCategory === 'revenue') {
          totalValue = members.reduce((s, m) => s + (m.revenue || 0), 0);
        } else {
          // For 'overall', show sum of deposits + objects
          totalValue = members.reduce((s, m) => s + (m.deposits || 0) + (m.takes || 0), 0);
        }
      }

      const teamData = allTeamsArray.find((t: any) => normalizeId(t.id) === tid);
      const teamName = teamData?.name || members[0]?.teamName || `Команда ${tid}`;

      return {
        teamId: tid,
        name: teamName,
        memberCount: members.length,
        avgScore: avgRating, // Overall rating 0-5
        planCompletion: avgPlanCompletion, // Overall plan completion %
        totalRevenue: members.reduce((s, m) => s + (m.revenue || 0), 0),
        totalValue
      };
    }).sort((a, b) => {
      if (activeCategory === 'overall') {
        return b.avgScore - a.avgScore;
      }
      return b.totalValue - a.totalValue;
    });
  }, [leaderboard, viewMode, allTeams, activeCategory, getPositionName]);


  const formatValue = (entry: UserScore) => {
    if (activeCategory === 'overall') return Number(entry.overallScore || 0).toFixed(2);
    if (activeCategory === 'revenue') {
      return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(entry.value);
    }
    return entry.value.toString();
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-4 md:space-y-5">
          <Skeleton className="h-6 md:h-8 w-24 md:w-32" />
          <div className="flex gap-1.5 md:gap-2 overflow-x-auto">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 md:h-10 w-20 md:w-28 rounded-lg md:rounded-xl flex-shrink-0" />)}
          </div>
          <Skeleton className="h-48 md:h-64 w-full rounded-xl md:rounded-2xl" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-4 md:space-y-6 animate-fade-in pb-16 md:pb-20">
        {/* Header */}
        <div className="relative pt-6 md:pt-10">
          <div className="absolute -left-20 -top-20 w-64 h-64 bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
          <div className="relative z-10 footer-gradient p-5 md:p-8 lg:p-10 rounded-2xl md:rounded-[2.5rem] lg:rounded-[3rem] border border-white/5 overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 md:gap-8">
              <div className="space-y-2.5 md:space-y-4">
                <div className="mb-2 md:mb-3">
                  <img src="/logo-panel.svg" alt="Logo" className="h-5 md:h-6 lg:h-7 w-auto object-contain opacity-40" />
                </div>
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="h-px w-6 md:w-8 bg-primary/50" />
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-primary/60">Лидерборд компании</span>
                </div>
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tighter leading-none">
                  РЕЙТИНГ <span className="text-white/20">/ СИСТЕМА БАЛЛОВ</span>
                </h1>
                <p className="text-white/40 font-medium max-w-md flex items-center gap-1.5 md:gap-2 uppercase text-[9px] md:text-[10px] tracking-wider md:tracking-widest leading-relaxed md:leading-loose">
                  <Trophy className="h-3.5 w-3.5 md:h-4 md:w-4 text-amber-500 fill-amber-500/20 animate-bounce" />
                  Рейтинг формируется на основе выполнения KPI и дисциплинарных показателей
                </p>
              </div>

              {currentUserRank > 0 && viewMode === 'employees' && (
                <div className="flex items-center gap-3 md:gap-4 px-5 md:px-8 py-3 md:py-5 rounded-xl md:rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-2xl transition-all duration-500 hover:border-primary/30 group/rank">
                  <div className="p-2 md:p-3 bg-primary/10 rounded-lg md:rounded-xl border border-primary/20">
                    <Trophy className="h-4 w-4 md:h-6 md:w-6 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] md:text-[10px] font-black text-white/40 uppercase tracking-wider md:tracking-widest">Ваша позиция</span>
                    <span className="text-xl md:text-2xl font-black text-white tracking-tighter">#{currentUserRank}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-white/20 group-hover/rank:translate-x-1 transition-transform" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── UNIFIED FILTERS SECTION ── */}
        <div className="p-3 sm:p-5 md:p-6 lg:p-8 rounded-xl sm:rounded-[1.5rem] md:rounded-[2rem] lg:rounded-[2.5rem] bg-zinc-900/60 backdrop-blur-2xl border border-white/5 shadow-2xl relative overflow-hidden mb-6">
          <div className="absolute top-0 right-0 w-48 h-48 md:w-64 md:h-64 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10 flex flex-col gap-4 md:gap-5 lg:gap-6">

            {/* Row 1: View Toggle & Main Category Tabs */}
            <div className="flex flex-col xl:flex-row gap-3 md:gap-4 lg:gap-5">
              {/* View mode toggle (Employees / Teams) */}
              <div className="flex bg-black/40 p-1 rounded-xl md:rounded-[1.25rem] border border-white/5 h-11 md:h-12 lg:h-14 overflow-hidden shadow-inner shrink-0">
                <button
                  onClick={() => setViewMode('employees')}
                  className={cn(
                    'flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 px-4 md:px-6 rounded-lg md:rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all duration-500 outline-none h-full',
                    viewMode === 'employees'
                      ? 'bg-white/10 text-white shadow-xl ring-1 ring-white/10'
                      : 'text-zinc-500 hover:text-white/60'
                  )}
                >
                  <Users className="h-3 w-3 md:h-3.5 md:w-3.5" /> Сотрудники
                </button>
                <button
                  onClick={() => setViewMode('teams')}
                  className={cn(
                    'flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 px-4 md:px-6 rounded-lg md:rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all duration-500 outline-none h-full',
                    viewMode === 'teams'
                      ? 'bg-white/10 text-white shadow-xl ring-1 ring-white/10'
                      : 'text-zinc-500 hover:text-white/60'
                  )}
                >
                  <Trophy className="h-3 w-3 md:h-3.5 md:w-3.5" /> Команды
                </button>
              </div>

              {/* Category tabs */}
              <div className="flex flex-1 bg-black/40 p-1 rounded-xl md:rounded-[1.25rem] border border-white/5 h-11 md:h-12 lg:h-14 overflow-x-auto no-scrollbar shadow-inner">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-1.5 md:gap-2 px-3 sm:px-4 lg:px-6 rounded-lg md:rounded-xl font-black text-[10px] md:text-xs uppercase tracking-widest transition-all duration-500 whitespace-nowrap outline-none h-full',
                        isActive
                          ? 'bg-white/10 text-white shadow-xl ring-1 ring-white/10'
                          : 'text-zinc-500 hover:text-white/60'
                      )}
                    >
                      <Icon className={cn("h-3 w-3 md:h-3.5 md:w-3.5 transition-transform duration-500", isActive && "scale-110")} />
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row 2: Selects (Time, Branch, Team) */}
            <div className="flex flex-col sm:flex-row gap-3 md:gap-4 lg:gap-5">
              {/* Time Filter */}
              <Select value={timeFilter} onValueChange={(v: TimeFilter) => setTimeFilter(v)}>
                <SelectTrigger className="flex-1 sm:max-w-[200px] h-11 md:h-12 lg:h-14 bg-black/40 border-white/5 rounded-xl md:rounded-[1.25rem] text-[10px] md:text-sm font-black uppercase tracking-wider focus:ring-1 focus:ring-primary/40 transition-all shadow-inner px-4 lg:px-6">
                  <div className="flex items-center gap-1.5 md:gap-2">
                    <Calendar className="h-3 w-3 md:h-3.5 md:w-3.5 text-primary/60" />
                    <SelectValue placeholder="Период" />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10 rounded-xl p-1 shadow-2xl">
                  <SelectItem value="month" className="rounded-lg h-9 md:h-10 px-3 md:px-4 font-bold text-xs uppercase cursor-pointer">Месяц</SelectItem>
                  <SelectItem value="quarter" className="rounded-lg h-9 md:h-10 px-3 md:px-4 font-bold text-xs uppercase cursor-pointer">Квартал</SelectItem>
                </SelectContent>
              </Select>

              {/* Branch Filter - Directors only */}
              {isDirector && (Array.isArray(branches) && branches.length > 0) && (
                <Select value={branchSelectValue} onValueChange={v => { setSelectedBranchId(v); setSelectedTeamId('all'); }}>
                  <SelectTrigger className="flex-1 sm:max-w-[240px] h-11 md:h-12 lg:h-14 bg-black/40 border-white/5 rounded-xl md:rounded-[1.25rem] text-[10px] md:text-sm font-black uppercase tracking-wider focus:ring-1 focus:ring-primary/40 transition-all shadow-inner px-4 lg:px-6">
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <Building2 className="h-3 w-3 md:h-3.5 md:w-3.5 text-primary/60" />
                      <SelectValue placeholder="Филиал" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-white/10 rounded-xl p-1 shadow-2xl">
                    <SelectItem value="all" className="rounded-lg h-9 md:h-10 px-3 md:px-4 font-bold text-xs uppercase cursor-pointer">Все филиалы</SelectItem>
                    {(Array.isArray(branches) ? branches : []).map((b: any) => (
                      <SelectItem key={b.id} value={String(b.id)} className="rounded-lg h-9 md:h-10 px-3 md:px-4 font-bold text-xs uppercase cursor-pointer">{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Team Filter */}
              {showTeamSelect && (
                <Select value={teamSelectValue} onValueChange={setSelectedTeamId}>
                  <SelectTrigger className="flex-1 sm:max-w-[240px] h-11 md:h-12 lg:h-14 bg-black/40 border-white/5 rounded-xl md:rounded-[1.25rem] text-[10px] md:text-sm font-black uppercase tracking-wider focus:ring-1 focus:ring-primary/40 transition-all shadow-inner px-4 lg:px-6">
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <Target className="h-3 w-3 md:h-3.5 md:w-3.5 text-primary/60" />
                      <SelectValue placeholder="Команда" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-white/10 rounded-xl p-1 shadow-2xl">
                    <SelectItem value="all" className="rounded-lg h-9 md:h-10 px-3 md:px-4 font-bold text-xs uppercase cursor-pointer">Все команды</SelectItem>
                    {(Array.isArray(allTeams) ? allTeams : []).map((t: any) => (
                      <SelectItem key={t.id} value={String(t.id)} className="rounded-lg h-9 md:h-10 px-3 md:px-4 font-bold text-xs uppercase cursor-pointer">{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>

        {/* TEAMS TABLE/GRID OVERHAUL */}
        {missingScope ? (
          <div className="rounded-xl md:rounded-[2.5rem] border border-white/5 bg-zinc-900/40 backdrop-blur-2xl overflow-hidden shadow-2xl p-6 md:p-10 text-center">
            <div className="text-[10px] md:text-xs font-black uppercase tracking-wider md:tracking-widest text-white/20">{missingScopeMessage}</div>
          </div>
        ) : viewMode === 'teams' && (
          <div className="space-y-6">
            {/* Team Podium - Simplified version for teams */}
            {teamScores.length >= 3 && (
              <div className="grid grid-cols-3 gap-2 md:gap-3 lg:gap-6 mb-6 md:mb-8">
                {/* 2nd Place */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mt-6 md:mt-8 relative group"
                >
                  <div className="absolute inset-0 bg-slate-400/5 blur-2xl rounded-full" />
                  <div className="relative rounded-xl md:rounded-[2rem] border border-white/5 bg-zinc-900/40 backdrop-blur-2xl p-2.5 md:p-4 text-center shadow-xl group-hover:scale-105 transition-transform duration-500">
                    <div className="w-8 h-8 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-slate-300 transform -rotate-12 mx-auto mb-2 md:mb-3 flex items-center justify-center shadow-lg shadow-slate-300/20 border border-white/20">
                      <span className="text-base md:text-xl font-black text-slate-800">2</span>
                    </div>
                    <h3 className="text-[10px] md:text-xs font-black text-white uppercase tracking-wider truncate mb-0.5 md:mb-1">{teamScores[1].name}</h3>
                    <div className="text-sm md:text-lg font-black text-primary tabular-nums">{Number(teamScores[1].avgScore || 0).toFixed(2)}</div>
                    <div className="text-[8px] md:text-[10px] font-bold text-white/20 uppercase tracking-widest mt-0.5 md:mt-1">{teamScores[1].memberCount} чел.</div>
                  </div>
                </motion.div>

                {/* 1st Place */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative group z-10"
                >
                  <div className="absolute inset-0 bg-amber-400/10 blur-3xl rounded-full" />
                  <div className="relative rounded-xl md:rounded-[2.5rem] border border-white/10 bg-zinc-900/60 backdrop-blur-3xl p-3 md:p-6 text-center shadow-2xl group-hover:scale-105 transition-transform duration-500 ring-2 ring-amber-400/20">
                    <div className="absolute -top-3 md:-top-4 left-1/2 -translate-x-1/2">
                      <Crown className="h-5 w-5 md:h-8 md:w-8 text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)] animate-bounce" />
                    </div>
                    <div className="w-10 h-10 md:w-16 md:h-16 rounded-2xl md:rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 mx-auto mb-2 md:mb-4 flex items-center justify-center shadow-xl shadow-amber-500/30 border border-white/20">
                      <span className="text-lg md:text-2xl font-black text-amber-950">1</span>
                    </div>
                    <h3 className="text-xs md:text-sm font-black text-white uppercase tracking-wider truncate mb-0.5 md:mb-1">{teamScores[0].name}</h3>
                    <div className="text-lg md:text-2xl font-black text-primary tabular-nums">{Number(teamScores[0].avgScore || 0).toFixed(2)}</div>
                    <div className="text-[8px] md:text-[10px] font-bold text-white/20 uppercase tracking-widest mt-0.5 md:mt-1">{teamScores[0].memberCount} чел.</div>
                  </div>
                </motion.div>

                {/* 3rd Place */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mt-8 md:mt-12 relative group"
                >
                  <div className="absolute inset-0 bg-orange-700/5 blur-2xl rounded-full" />
                  <div className="relative rounded-xl md:rounded-[2rem] border border-white/5 bg-zinc-900/40 backdrop-blur-2xl p-2.5 md:p-4 text-center shadow-xl group-hover:scale-105 transition-transform duration-500">
                    <div className="w-7 h-7 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-orange-500 rotate-12 mx-auto mb-2 md:mb-3 flex items-center justify-center shadow-lg shadow-orange-500/20 border border-white/20">
                      <span className="text-sm md:text-lg font-black text-orange-950">3</span>
                    </div>
                    <h3 className="text-[9px] md:text-[10px] font-black text-white uppercase tracking-wider truncate mb-0.5 md:mb-1">{teamScores[2].name}</h3>
                    <div className="text-sm md:text-lg font-black text-primary tabular-nums">{Number(teamScores[2].avgScore || 0).toFixed(2)}</div>
                    <div className="text-[8px] md:text-[10px] font-bold text-white/20 uppercase tracking-widest mt-0.5 md:mt-1">{teamScores[2].memberCount} чел.</div>
                  </div>
                </motion.div>
              </div>
            )}

            <div className="rounded-xl md:rounded-[2.5rem] border border-white/5 bg-zinc-900/40 backdrop-blur-2xl overflow-hidden shadow-2xl">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-white/5">
                    <TableHead className="w-[50px] md:w-[80px] text-center text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-white/20 py-2 md:py-3">#</TableHead>
                    <TableHead className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-white/20 py-2 md:py-3">Команда</TableHead>
                    <TableHead className="text-center text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-white/20 py-2 md:py-3">Участники</TableHead>
                    <TableHead className="text-center text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-white/20 py-2 md:py-3">План</TableHead>
                    <TableHead className="text-center text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-white/20 py-2 md:py-3">Рейтинг</TableHead>
                    <TableHead className="text-right hidden sm:table-cell text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-white/20 py-2 md:py-3">Результат</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamScores.length > 0 ? teamScores.map((team, index) => {
                    const isTop3 = index < 3;
                    const medalColor = index === 0 ? 'text-amber-400' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-orange-500' : 'text-white/20';
                    const glowColor = index === 0 ? 'shadow-amber-500/10' : index === 1 ? 'shadow-slate-400/10' : index === 2 ? 'shadow-orange-700/10' : '';

                    return (
                      <TableRow
                        key={team.teamId}
                        className={cn(
                          "border-white/5 transition-all duration-500 group",
                          isTop3 ? "bg-white/[0.01]" : "hover:bg-white/[0.02]"
                        )}
                      >
                        <TableCell className="text-center font-black py-2 md:py-3">
                          <div className="relative inline-flex items-center justify-center">
                            {index === 0 ? (
                              <div className="relative">
                                <Crown className="h-4 w-4 md:h-6 md:w-6 text-amber-400 animate-pulse" />
                                <div className="absolute inset-0 blur-lg bg-amber-400/20" />
                              </div>
                            ) : (
                              <span className={cn("text-base md:text-xl tracking-tighter", medalColor)}>{index + 1}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 md:py-3">
                          <div className="flex items-center gap-2 md:gap-4">
                            <div className={cn(
                              "h-8 w-8 md:h-11 md:w-11 rounded-xl md:rounded-[1.25rem] bg-zinc-800 border transition-all duration-500 flex items-center justify-center text-[9px] md:text-[10px] font-black group-hover:scale-110",
                              isTop3 ? "border-primary/40 text-primary shadow-lg shadow-primary/10" : "border-white/5 text-white/40"
                            )}>
                              {team.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-black text-xs md:text-sm tracking-tight text-white/80 group-hover:text-white transition-colors truncate">{team.name}</span>
                              {isTop3 && <span className="text-[7px] md:text-[8px] font-black text-primary uppercase tracking-[0.15em] md:tracking-[0.2em] mt-0.5 truncate">Лидер отрасли</span>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center py-2 md:py-3">
                          <div className="inline-flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-0.5 md:py-1 rounded-md md:rounded-lg bg-black/20 border border-white/5">
                            <Users className="h-2.5 w-2.5 md:h-3 md:w-3 text-white/20" />
                            <span className="text-[10px] md:text-xs font-bold text-white/60 tabular-nums">{team.memberCount}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center py-2 md:py-3">
                          <div className="flex items-center justify-center gap-2 md:gap-4">
                            <div className="hidden sm:block w-24 md:w-32 space-y-1">
                              <div className="flex justify-between text-[8px] md:text-[9px] font-black uppercase tracking-widest text-white/20">
                                <span>{Math.round(team.planCompletion || 0)}%</span>
                              </div>
                              <div className="h-1 md:h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/[0.02]">
                                <motion.div
                                  className="h-full bg-primary shadow-lg shadow-primary/20"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.min(team.planCompletion || 0, 100)}%` }}
                                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                />
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center py-2 md:py-3">
                          <span className="text-[9px] md:text-[10px] font-black text-white px-1.5 md:px-2 py-0.5 md:py-1 rounded-md md:rounded-lg bg-black/40 border border-white/5 shadow-inner tabular-nums">
                            {Number(team.avgScore || 0).toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right hidden sm:table-cell font-black text-xs md:text-sm text-white/40 group-hover:text-white/60 tabular-nums py-2 md:py-3">
                          {activeCategory === 'revenue'
                            ? new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(team.totalRevenue)
                            : team.totalValue}
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 md:h-32 text-center text-[10px] md:text-xs font-black uppercase tracking-wider md:tracking-widest text-white/10">Нет данных</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* EMPLOYEES TABLE */}
        {!missingScope && viewMode === 'employees' && (
          <div className="rounded-xl md:rounded-[2.5rem] border border-white/5 bg-zinc-900/40 backdrop-blur-2xl overflow-hidden shadow-2xl">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-white/5">
                  <TableHead className="w-[50px] md:w-[80px] text-center text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-white/20 py-2 md:py-3">#</TableHead>
                  <TableHead className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-white/20 py-2 md:py-3">Сотрудник</TableHead>
                  {activeCategory !== 'overall' && (
                    <TableHead className="text-right text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-white/20 py-2 md:py-3">
                      Результат
                    </TableHead>
                  )}
                  <TableHead className="text-center text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-white/20 py-2 md:py-3">План</TableHead>
                  <TableHead className="text-center w-[100px] md:w-[120px] text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-white/20 py-2 md:py-3">Рейтинг</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayScores.length > 0 ? (
                  displayScores.map((entry, index) => {
                    const isTop3 = index < 3;
                    const medalColor = index === 0 ? 'text-amber-400' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-orange-500' : 'text-white/20';
                    const glowColor = index === 0 ? 'shadow-amber-500/10' : index === 1 ? 'shadow-slate-400/10' : index === 2 ? 'shadow-orange-700/10' : '';

                    // Руководители (>= 50) могут кликать на профили, сотрудники - нет
                    const canClick = accessLevel >= 50;
                    return (
                      <TableRow
                        key={entry.userId}
                        onClick={() => { if (canClick) navigate(`/employees/${entry.userId}`, { state: { from: '/rating' } }); }}
                        className={cn(
                          "border-white/5 transition-all duration-500 group",
                          canClick ? "cursor-pointer" : "cursor-default",
                          entry.isCurrentUser ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-white/[0.02]"
                        )}
                      >
                        <TableCell className="text-center font-black py-2 md:py-3">
                          <div className="relative inline-flex items-center justify-center">
                            {index === 0 ? (
                              <div className="relative">
                                <Crown className="h-4 w-4 md:h-6 md:w-6 text-amber-400 animate-pulse" />
                                <div className="absolute inset-0 blur-lg bg-amber-400/20" />
                              </div>
                            ) : (
                              <span className={cn("text-base md:text-xl tracking-tighter", medalColor)}>{index + 1}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 md:py-3">
                          <div className="flex items-center gap-2 md:gap-4">
                            <div className="relative shrink-0">
                              <Avatar className={cn(
                                "h-8 w-8 md:h-11 md:w-11 border-2 transition-all duration-500 group-hover:scale-110",
                                entry.isCurrentUser ? "border-primary" : "border-white/5",
                                isTop3 && `shadow-lg ${glowColor} border-white/10`
                              )}>
                                {entry.avatar ? (
                                  <AvatarImage src={getAvatarUrl(entry.avatar)} className="object-cover" />
                                ) : (
                                  <AvatarFallback className={cn(
                                    "text-[10px] md:text-xs font-black",
                                    entry.isCurrentUser ? "bg-primary text-white" : "bg-zinc-800 text-white/40"
                                  )}>
                                    {entry.name.substring(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                )}
                              </Avatar>
                              {isTop3 && (
                                <div className={cn(
                                  "absolute -top-0.5 -right-0.5 md:-top-1 md:-right-1 w-3 h-3 md:w-4 md:h-4 rounded-full border-2 border-zinc-900 flex items-center justify-center bg-gradient-to-br",
                                  index === 0 ? "from-amber-400 to-amber-600" : index === 1 ? "from-slate-300 to-slate-500" : "from-orange-500 to-orange-700"
                                )}>
                                  <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-white/40" />
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className={cn(
                                "font-black text-xs md:text-sm tracking-tight transition-colors duration-500 truncate",
                                entry.isCurrentUser ? "text-primary" : "text-white/80 group-hover:text-white"
                              )}>
                                {entry.name} {entry.isCurrentUser && "(Вы)"}
                              </span>
                              <span className="text-[8px] md:text-[10px] font-bold text-white/20 uppercase tracking-wider md:tracking-widest truncate">
                                {entry.positionName || 'Сотрудник'}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        {activeCategory !== 'overall' && (
                          <TableCell className="text-right py-2 md:py-3">
                            <span className="font-black text-xs md:text-sm text-primary tabular-nums">
                              {formatValue(entry)}
                            </span>
                          </TableCell>
                        )}
                        <TableCell className="py-2 md:py-3">
                          <div className="flex items-center justify-center gap-2 md:gap-4">
                            <div className="flex-1 space-y-1 md:space-y-1.5 max-w-[120px] md:max-w-[200px] min-w-0">
                               <div className="flex justify-end text-[8px] md:text-[10px] font-black uppercase tracking-wider md:tracking-widest text-white/20 mb-0.5 md:mb-1">
                                 <span className="shrink-0">{Math.round(entry.planPercent)}%</span>
                               </div>
                              <div className="h-1 md:h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/[0.02]">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.min(entry.planPercent, 100)}%` }}
                                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                  className={cn(
                                    "h-full rounded-full transition-all duration-1000",
                                    entry.planPercent >= 100 ? "bg-emerald-500 shadow-lg shadow-emerald-500/20" : "bg-primary shadow-lg shadow-primary/20"
                                  )}
                                />
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center py-2 md:py-3 cursor-default">
                          <span className="text-[10px] md:text-xs font-black text-white px-1.5 md:px-2 py-0.5 md:py-1 rounded-md md:rounded-lg bg-black/40 border border-white/5 tabular-nums">
                            {Number(entry.overallScore || 0).toFixed(2)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 md:h-32 text-center text-[10px] md:text-xs font-black uppercase tracking-wider md:tracking-widest text-white/10">
                      Нет данных для отображения
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

export default memo(Rating);
