
import { useState, type ComponentType } from 'react';
import { motion } from 'framer-motion';
import {
  Mail,
  Phone,
  FileText,
  Trophy,
  Star,
  TrendingUp,
  ChevronRight,
  Wallet,
  Clock,
  Settings,
  LogOut,
  Building2,
  Target,
  Activity,
  Monitor,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getPositionName, getRatingAccessLevel, isRatingParticipant, shouldHidePersonalRevenue, shouldHideRatingPlace } from '@/lib/positions';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AvatarUpload } from '@/components/profile/AvatarUpload';
import { ProfileSettingsDialog } from '@/components/profile/ProfileSettingsDialog';
import { ProfileExtraInfoDialog } from '@/components/profile/ProfileExtraInfoDialog';
import { NotificationToggle } from '@/components/profile/NotificationToggle';
import { localAPI } from '@/integrations/localAPI';
import { startOfMonth, startOfQuarter, isWithinInterval, endOfDay, formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';

export default function Profile() {
  const { profile, signOut, refreshProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExtraInfoOpen, setIsExtraInfoOpen] = useState(false);

  const myPosition = getPositionName(profile);
  const isDirectorOrAdmin = ['директор', 'админ', 'administrator', 'admin'].some((t) => myPosition.toLowerCase().includes(t));
  const hideRevenue = shouldHidePersonalRevenue(myPosition);
  const hideRating = shouldHideRatingPlace(myPosition);
  const showScore = isRatingParticipant(myPosition);

  const handleAvatarChange = async () => { await refreshProfile(); };
  const handleSignOut = async () => { await signOut(); navigate('/auth'); };

  // --- STATS FETCHING ---
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['profile-stats', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;

      const myPositionName = getPositionName(profile);
      const hasAdminRatingAccess = getRatingAccessLevel(myPositionName) === 'admin';

      const hideMyRatingPlace = shouldHideRatingPlace(myPositionName);
      const isMyParticipant = isRatingParticipant(myPositionName);

      // Get plan completion and rating from leaderboard (overall % based on all 3 metrics)
      const now = new Date();
      const periodStart = startOfQuarter(now).toISOString();
      const { data: leaderboardData } = await localAPI.request(`/kpi/leaderboard?start=${periodStart}&end=${endOfDay(now).toISOString()}`);
      const myLeaderboardEntry = (leaderboardData || []).find((p: { userId?: number | string }) => p.userId === profile?.id);
      const planPercent = isDirectorOrAdmin ? 0 : Math.round(myLeaderboardEntry?.planCompletion || 0);
      const revenue = myLeaderboardEntry?.revenue || 0;
      const overallRating = myLeaderboardEntry?.rating || 0; // 0-5 rating

      // Calculate rank among rating participants only (sorted by rating)
      const participants = (leaderboardData || []).filter((p: { position?: { name?: unknown } | null; positionName?: unknown; position_name?: unknown }) =>
        isRatingParticipant(getPositionName(p))
      );
      const sortedLeaderboard = [...participants].sort((a: { rating?: number }, b: { rating?: number }) => (b.rating || 0) - (a.rating || 0));
      const rank = sortedLeaderboard.findIndex((p: { userId?: number | string }) => p.userId === profile?.id) + 1;

      const ratingPlace = (hideMyRatingPlace || !isMyParticipant) ? '—' : (rank || '—');

      // Get reports for deals count
      const { data: allReportsData } = await localAPI.request('/reports');
      const reportsArray = Array.isArray(allReportsData?.data) ? allReportsData.data : (Array.isArray(allReportsData) ? allReportsData : []);
      
      // Total deals (period-based based on reports)
      let totalDeals = reportsArray.filter((r: { user_id?: number | string; report_type?: string; status?: string; created_at?: string; data?: any }) => {
        const isOwner = hasAdminRatingAccess ? true : r.user_id === profile.id;
        const isApproved = r.status === 'approved';
        const isDeal = ['deal', 'sale'].includes(r.report_type || '');
        if (!isOwner || !isApproved || !isDeal) return false;
        
        const itemDate = new Date(r.created_at || r.data?.date);
        return isWithinInterval(itemDate, { start: new Date(periodStart), end: endOfDay(now) });
      }).length;

      // Add custom manual overrides from profile for deals
      totalDeals += (Number(profile.custom_total_deals) || 0);

      const activeDeals = reportsArray.filter((r: { user_id?: number | string; status?: string }) =>
        (hasAdminRatingAccess ? true : r.user_id === profile.id) && r.status === 'pending'
      ).length;

      const { data: dashboardStats } = await localAPI.getDashboardStats();

      // Get Dual KPI data if user is management
      let dualKpi = null;
      const isManagementPos = !isDirectorOrAdmin && ['моп', 'роп', 'коммерческ'].some(p => myPositionName.toLowerCase().includes(p));
      if (isManagementPos) {
        try {
          const { data: dualKpiData } = await localAPI.request('/kpi/my-dual-stats');
          dualKpi = dualKpiData;
        } catch (e) {
          console.error('Error fetching dual KPI for profile:', e);
        }
      }

      return {
        rating: ratingPlace,
        active_deals: activeDeals,
        plan_percent: planPercent,
        total_deals: totalDeals,
        overallRating: overallRating,
        dualKpi: dualKpi, // Add this for management view
        trends: {
          revenue: revenue,
          growth: dashboardStats?.trends?.growth || 0
        }
      };
    },
    enabled: !!profile?.id,
    staleTime: 60000, // Cache for 60 seconds
  });

  // Show score for rating participants only (positions-only logic)

  // Hide/show blocks based on position only (no role-based visibility)
  // NOTE: safety defaults in helpers: unknown position => do not hide
  // (computed above: hideRevenue/hideRating/showScore)

  if (authLoading || !profile) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
            <p className="text-white/60 text-sm font-bold">Загрузка профиля...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  const initials = profile.full_name
    ?.split(' ')
    .filter(n => n.length > 0)
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'VB';
  const isPositive = (stats?.trends?.growth || 0) >= 0;

  return (
    <MainLayout>
      <div className="space-y-6 md:space-y-8 lg:space-y-12 animate-fade-in max-w-[1400px] mx-auto pb-20 md:pb-28 pt-4 md:pt-6 lg:pt-8 px-3 sm:px-4 md:px-6 lg:px-8">

        {/* === PREMIUM HEADER & USER INFO === */}
        <div className="relative group">
          {/* Background Glow */}
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/20 rounded-full blur-[120px] pointer-events-none group-hover:bg-primary/30 transition-all duration-1000" />

          <div className="relative z-10 p-5 md:p-8 lg:p-12 rounded-xl md:rounded-2xl lg:rounded-[2.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />

            <div className="mb-4 md:mb-6">
              <img src="/logo-panel.svg" alt="Logo" className="h-5 md:h-6 w-auto object-contain opacity-30" />
            </div>

            <div className="relative z-10 flex flex-col gap-6 md:gap-8 lg:flex-row lg:items-center lg:gap-12">
              {/* Avatar Section */}
              <div className="relative shrink-0 flex justify-center lg:block">
                <div className="pointer-events-none absolute inset-0 rounded-full bg-primary/20 blur-[40px] animate-pulse" />
                <AvatarUpload
                  userId={profile.id}
                  currentAvatarUrl={profile.avatar_url}
                  initials={initials}
                  onAvatarChange={handleAvatarChange}
                  size="xl"
                  className="shadow-2xl rounded-full border-4 border-white/5 relative z-10 mx-auto lg:mx-0"
                />
              </div>

              {/* User Content + actions */}
              <div className="relative flex min-w-0 flex-1 flex-col text-center lg:min-h-56 lg:text-left">
                <div className="flex flex-col justify-center lg:flex-1 lg:pb-14">
                  <div className="space-y-3 md:space-y-4">
                    <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                      <div className="inline-flex h-9 max-w-full items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-3.5 backdrop-blur-md">
                        <span className="truncate text-[9px] font-black uppercase tracking-[0.12em] text-primary md:text-[10px]">
                          {profile.position?.name || 'Сотрудник'}
                        </span>
                      </div>
                      {profile.realtor_type && (
                        <div
                          className={cn(
                            'inline-flex h-9 max-w-full items-center justify-center rounded-full border px-3.5 text-[9px] font-black uppercase tracking-[0.1em] backdrop-blur-md md:text-[10px]',
                            profile.realtor_type === 'secondary'
                              ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400'
                              : profile.realtor_type === 'newbuildings'
                                ? 'border-purple-500/20 bg-purple-500/10 text-purple-400'
                                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
                          )}
                        >
                          <span className="truncate">
                            {profile.realtor_type === 'secondary'
                              ? 'Специалист: Вторичка'
                              : profile.realtor_type === 'newbuildings'
                                ? 'Специалист: Новостройки'
                                : 'Универсальный боец'}
                          </span>
                        </div>
                      )}
                      {profile.branch?.name && (
                        <div className="inline-flex h-9 max-w-full items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 backdrop-blur-md">
                          <Building2 className="h-3 w-3 shrink-0 text-white/45" aria-hidden />
                          <span className="truncate text-[9px] font-black uppercase tracking-[0.12em] text-white/45 md:text-[10px]">
                            {profile.branch.name}
                          </span>
                        </div>
                      )}
                    </div>
                    <h1 className="break-normal hyphens-none text-2xl font-black uppercase leading-[1.08] tracking-tight text-white md:text-3xl md:leading-[1.06] lg:text-5xl lg:leading-[1.05] xl:text-6xl">
                      {profile.full_name || 'Пользователь'}
                    </h1>
                  </div>
                </div>

                <div
                  className="mt-5 flex flex-wrap items-center justify-center gap-2 border-t border-white/5 pt-4 lg:absolute lg:bottom-0 lg:right-0 lg:mt-0 lg:border-t-0 lg:pt-0"
                  role="toolbar"
                  aria-label="Действия профиля"
                >
                  <NotificationToggle />
                  <Button
                    variant="outline"
                    className="h-9 rounded-xl border-white/5 bg-white/5 px-4 font-black uppercase tracking-widest text-white hover:bg-white/10 md:h-10 md:px-5 md:rounded-2xl md:text-[10px] text-[9px] transition-all duration-300"
                    onClick={() => setIsExtraInfoOpen(true)}
                    aria-label="Доп. сведения: просмотр"
                  >
                    <FileText className="mr-1.5 h-3.5 w-3.5 text-primary md:mr-2 md:h-4 md:w-4" aria-hidden /> Доп. сведения
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 rounded-xl border-white/5 bg-white/5 px-4 font-black uppercase tracking-widest text-white hover:bg-white/10 md:h-10 md:px-5 md:rounded-2xl md:text-[10px] text-[9px] transition-all duration-300"
                    onClick={() => setIsSettingsOpen(true)}
                  >
                    <Settings className="mr-1.5 h-3.5 w-3.5 text-primary md:mr-2 md:h-4 md:w-4" /> Настройки
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-9 w-9 shrink-0 rounded-xl p-0 text-white/20 hover:bg-rose-500/10 hover:text-rose-400 md:h-10 md:w-10 md:rounded-2xl transition-all duration-300"
                    onClick={handleSignOut}
                  >
                    <LogOut className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* === BENTO STATS GRID === */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 md:gap-4 lg:gap-6">

          {/* Main Financial Card (Large) */}
          {!hideRevenue && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="lg:col-span-4 p-5 md:p-6 lg:p-10 rounded-xl md:rounded-2xl lg:rounded-[2.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 relative overflow-hidden group shadow-2xl"
          >
            <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none group-hover:bg-emerald-500/15 transition-all duration-1000" />
            <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-5 md:gap-8 lg:gap-10">
              <div className="space-y-3 md:space-y-4 lg:space-y-6">
                <div className="flex items-center gap-2 md:gap-2.5 lg:gap-3">
                  <div className="p-2 md:p-2.5 lg:p-3 bg-emerald-500/10 rounded-xl md:rounded-2xl border border-emerald-500/20">
                    <Wallet className="h-4 w-4 md:h-5 md:w-5 lg:h-6 lg:w-6 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-[8px] md:text-[9px] lg:text-[10px] font-black text-white/30 uppercase tracking-[0.2em] md:tracking-[0.25em] lg:tracking-[0.3em]">Личная выручка</p>
                    <p className="text-[10px] md:text-[11px] lg:text-xs font-bold text-emerald-500/60 uppercase tracking-widest mt-0.5">Текущий месяц</p>
                  </div>
                </div>
                {statsLoading ? (
                  <div className="h-12 md:h-14 lg:h-16 w-48 md:w-56 lg:w-64 bg-white/5 rounded-2xl animate-pulse" />
                ) : (
                  <h2 className="text-3xl md:text-4xl lg:text-7xl font-black tracking-tighter text-white tabular-nums leading-none">
                    {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(stats?.trends?.revenue || 0)}
                  </h2>
                )}
              </div>

              {!statsLoading && (
                <div className={cn(
                  "p-4 md:p-5 lg:p-6 rounded-2xl md:rounded-3xl border backdrop-blur-2xl transition-all duration-700 shadow-xl",
                  isPositive ? "bg-emerald-500/5 border-emerald-500/10" : "bg-rose-500/5 border-rose-500/10"
                )}>
                  <div className="flex flex-col items-center gap-1.5 md:gap-2">
                    <div className={cn("text-xl md:text-2xl font-black tabular-nums flex items-center gap-1 md:gap-1.5", isPositive ? "text-emerald-400" : "text-rose-400")}>
                      <TrendingUp className={cn("h-4 w-4 md:h-5 md:w-5", !isPositive && "rotate-180")} />
                      {Math.abs(stats?.trends?.growth || 0)}%
                    </div>
                    <span className="text-[7px] md:text-[8px] font-black uppercase text-white/20 tracking-[0.3em] md:tracking-[0.4em]">Динамика</span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
          )}

          {/* Rating Card */}
          {!hideRating && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2 p-5 md:p-6 lg:p-8 rounded-xl md:rounded-2xl lg:rounded-[2.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 relative overflow-hidden group cursor-pointer hover:bg-zinc-900/60 transition-all duration-500 shadow-2xl"
            onClick={() => navigate('/rating')}
          >
            <div className="absolute -right-6 -top-6 text-amber-500/[0.03] rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
              <Trophy className="w-32 h-32 md:w-40 md:h-40 lg:w-48 lg:h-48" />
            </div>

            <div className="relative z-10 h-full flex flex-col justify-between items-start">
              <div className="p-2 md:p-2.5 lg:p-3 bg-amber-500/10 rounded-xl md:rounded-2xl border border-amber-500/20 mb-4 md:mb-6 lg:mb-8">
                <Trophy className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-amber-500" />
              </div>

              <div className="space-y-2 md:space-y-3 lg:space-y-4">
                <div className="flex items-baseline gap-2 md:gap-2.5 lg:gap-3">
                  <span className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter tabular-nums leading-none">
                    #{statsLoading ? '—' : (stats?.rating || '-')}
                  </span>
                  {showScore && stats?.overallRating !== undefined && stats?.overallRating !== null && (
                    <div className="px-1.5 py-0.5 md:px-2 md:py-1 rounded-lg bg-amber-500 text-zinc-900 text-[9px] md:text-[10px] font-black uppercase tracking-tighter">
                      {stats.overallRating.toFixed(1)} <Star className="h-2 w-2 md:h-2.5 md:w-2.5 inline-block -mt-0.5 fill-current" />
                    </div>
                  )}
                </div>
                <div className="space-y-0.5 md:space-y-1">
                  <p className="text-[8px] md:text-[9px] lg:text-[10px] font-black text-white/20 uppercase tracking-[0.3em] md:tracking-[0.35em] lg:tracking-[0.4em]">Место в рейтинге</p>
                  <p className="text-[8px] md:text-[9px] font-bold text-amber-500/40 uppercase tracking-widest">Перейти к деталям <ChevronRight className="h-1.5 w-1.5 md:h-2 md:w-2 inline-block ml-1" /></p>
                </div>
              </div>
            </div>
          </motion.div>
          )}

          {/* Plan Progress Cards - Personal & Management if applicable */}
          {!isDirectorOrAdmin && (
          <div className={cn("lg:col-span-2 space-y-3 md:space-y-4", stats?.dualKpi?.hasDualKpi ? "lg:col-span-2" : "lg:col-span-2")}>
            {/* Personal Plan Card */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="p-5 md:p-6 lg:p-8 rounded-xl md:rounded-2xl lg:rounded-[2.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 relative overflow-hidden group shadow-2xl h-full"
            >
              <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/5">
                <motion.div
                  className="h-full bg-gradient-to-r from-primary to-indigo-500 shadow-[0_0_15px_rgba(var(--primary),0.5)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${stats?.plan_percent || 0}%` }}
                  transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
                />
              </div>

              <div className="relative z-10 space-y-4 md:space-y-6 lg:space-y-8">
                <div className="p-2 md:p-2.5 lg:p-3 bg-primary/10 rounded-xl md:rounded-2xl border border-primary/20 inline-flex">
                  <Target className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-primary" />
                </div>

                <div className="space-y-2 md:space-y-3 lg:space-y-4">
                  <div className="flex items-baseline gap-1.5 md:gap-2">
                    <span className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter tabular-nums leading-none">
                      {statsLoading ? '0' : (stats?.plan_percent || 0)}%
                    </span>
                  </div>
                  <p className="text-[8px] md:text-[9px] lg:text-[10px] font-black text-white/20 uppercase tracking-[0.3em] md:tracking-[0.35em] lg:tracking-[0.4em]">Личный план</p>
                </div>
              </div>
            </motion.div>
          </div>
          )}

          {/* Management Plan Card (Only for MOP/ROP/Directors) */}
          {!isDirectorOrAdmin && stats?.dualKpi?.hasDualKpi && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="lg:col-span-2 p-5 md:p-6 lg:p-8 rounded-xl md:rounded-2xl lg:rounded-[2.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 relative overflow-hidden group shadow-2xl"
            >
              <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/5">
                <motion.div
                  className="h-full bg-gradient-to-r from-indigo-500 to-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${stats?.dualKpi?.kpis[1]?.planCompletion || 0}%` }}
                  transition={{ duration: 1.5, ease: "easeOut", delay: 0.6 }}
                />
              </div>

              <div className="relative z-10 space-y-4 md:space-y-6 lg:space-y-8">
                <div className="p-2 md:p-2.5 lg:p-3 bg-indigo-500/10 rounded-xl md:rounded-2xl border border-indigo-500/20 inline-flex">
                  <Target className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-indigo-400" />
                </div>

                <div className="space-y-2 md:space-y-3 lg:space-y-4">
                  <div className="flex items-baseline gap-1.5 md:gap-2">
                    <span className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter tabular-nums leading-none">
                      {statsLoading ? '0' : (stats?.dualKpi?.kpis[1]?.planCompletion || 0)}%
                    </span>
                    {stats?.dualKpi?.kpis[1]?.metrics?.nextThreshold && (
                      <span className="text-[10px] md:text-xs font-bold text-indigo-400/60 uppercase tracking-tighter">
                        +{Math.max(0, stats.dualKpi.kpis[1].metrics.nextThreshold - stats.dualKpi.kpis[1].planCompletion)}% до уровня {stats.dualKpi.kpis[1].metrics.nextThreshold}%
                      </span>
                    )}
                  </div>
                  <p className="text-[8px] md:text-[9px] lg:text-[10px] font-black text-white/20 uppercase tracking-[0.3em] md:tracking-[0.35em] lg:tracking-[0.4em]">Управленческий план</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Activity Cards (Mini) */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-2 p-5 md:p-6 lg:p-8 rounded-xl md:rounded-2xl lg:rounded-[2.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 hover:bg-zinc-900/60 transition-all duration-500 group shadow-2xl cursor-pointer"
            onClick={() => navigate('/service-requests')}
          >
            <div className="flex items-center justify-between mb-4 md:mb-6 lg:mb-8">
              <div className="p-2 md:p-2.5 lg:p-3 bg-emerald-500/10 rounded-xl md:rounded-2xl border border-emerald-500/20">
                <Activity className="h-4 w-4 md:h-5 md:w-5 lg:h-6 lg:w-6 text-emerald-500" />
              </div>
              <div className="text-right">
                <span className="text-2xl md:text-3xl lg:text-4xl font-black text-white tabular-nums leading-none">
                  {statsLoading ? '—' : (stats?.total_deals || 0)}
                </span>
              </div>
            </div>
            <p className="text-[8px] md:text-[9px] lg:text-[10px] font-black text-white/20 uppercase tracking-[0.3em] md:tracking-[0.35em] lg:tracking-[0.4em]">Завершенные сделки</p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="lg:col-span-2 p-5 md:p-6 lg:p-8 rounded-xl md:rounded-2xl lg:rounded-[2.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 hover:bg-zinc-900/60 transition-all duration-500 group shadow-2xl cursor-pointer"
            onClick={() => navigate('/service-requests')}
          >
            <div className="flex items-center justify-between mb-4 md:mb-6 lg:mb-8">
              <div className="p-2 md:p-2.5 lg:p-3 bg-rose-500/10 rounded-xl md:rounded-2xl border border-rose-500/20">
                <Clock className="h-4 w-4 md:h-5 md:w-5 lg:h-6 lg:w-6 text-rose-500" />
              </div>
              <div className="text-right">
                <span className="text-2xl md:text-3xl lg:text-4xl font-black text-white tabular-nums leading-none transition-all duration-300 group-hover:text-rose-400">
                  {statsLoading ? '—' : (stats?.active_deals || 0)}
                </span>
              </div>
            </div>
            <p className="text-[8px] md:text-[9px] lg:text-[10px] font-black text-white/20 uppercase tracking-[0.3em] md:tracking-[0.35em] lg:tracking-[0.4em]">Заявки в ожидании</p>
          </motion.div>

        </div>

        {/* === SESSIONS SECTION === */}
        <SessionsSection />

        <ProfileSettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
        <ProfileExtraInfoDialog
          open={isExtraInfoOpen}
          onOpenChange={setIsExtraInfoOpen}
          employeeId={String(profile.id)}
          canEdit={false}
          defaultMode="view"
          initial={{
            passport_series_number: profile.passport_series_number,
            extra_phone: profile.extra_phone,
            emergency_contacts: profile.emergency_contacts,
            passport_address: profile.passport_address,
            residential_address: profile.residential_address,
          }}
          onSaved={async () => {
            await refreshProfile();
          }}
        />
      </div>
    </MainLayout>
  );
}

interface Session {
  id: string;
  device_name: string;
  browser: string;
  os: string;
  ip_address: string;
  is_current: boolean;
  last_active: string;
  created_at: string;
}

function SessionsSection() {
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ['sessions'],
    queryFn: async () => {
      const { data } = await localAPI.request('/sessions');
      return data || [];
    },
  });

  const terminateSession = useMutation({
    mutationFn: async (sessionId: string) => {
      await localAPI.request(`/sessions/${sessionId}`, { method: 'DELETE' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });

  const terminateAllOther = useMutation({
    mutationFn: async () => {
      await localAPI.request('/sessions', { method: 'DELETE' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });

  const currentSession = sessions.find(s => s.is_current);
  const otherSessions = sessions.filter(s => !s.is_current);

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5 }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40">Сессии</h2>
        {otherSessions.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-[10px] font-black uppercase tracking-widest text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
            onClick={() => terminateAllOther.mutate()}
            disabled={terminateAllOther.isPending}
          >
            Завершить все другие
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="p-6 rounded-xl bg-zinc-900/60 border border-white/5 animate-pulse">
            <div className="h-4 w-48 bg-white/5 rounded" />
          </div>
        ) : (
          <>
            {currentSession && (
              <div className="p-4 md:p-5 rounded-xl bg-zinc-900/60 backdrop-blur-xl border border-white/5 relative overflow-hidden">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 shrink-0">
                      <Monitor className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{currentSession.device_name}</span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black uppercase tracking-widest text-emerald-400">
                          Текущее устройство
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-white/30">
                        <span>{currentSession.browser} · {currentSession.os}</span>
                        <span>{currentSession.ip_address}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {otherSessions.map(session => (
              <div
                key={session.id}
                className="p-4 md:p-5 rounded-xl bg-zinc-900/60 backdrop-blur-xl border border-white/5 relative overflow-hidden group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-white/5 rounded-xl border border-white/10 shrink-0">
                      <Smartphone className="h-4 w-4 text-white/40" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-sm font-bold text-white">{session.device_name}</span>
                      <div className="flex items-center gap-3 text-[11px] text-white/30">
                        <span>{session.browser} · {session.os}</span>
                        <span>{session.ip_address}</span>
                        <span>
                          {formatDistanceToNow(new Date(session.last_active), { addSuffix: true, locale: ru })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={() => terminateSession.mutate(session.id)}
                    disabled={terminateSession.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Завершить</span>
                  </Button>
                </div>
              </div>
            ))}

            {sessions.length === 0 && (
              <div className="p-6 rounded-xl bg-zinc-900/60 border border-white/5 text-center">
                <p className="text-white/30 text-sm">Нет активных сессий</p>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

type MenuLinkProps = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  onClick?: () => void;
  color?: string;
  delay?: number;
};

function MenuLink({ icon: Icon, title, subtitle, onClick, color, delay }: MenuLinkProps) {
  return (
    <motion.button
      initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay }}
      onClick={onClick}
      className="w-full bg-zinc-900/40 hover:bg-zinc-900/60 border border-white/5 rounded-2xl p-4 flex items-center gap-4 transition-all group active:scale-[0.98]"
    >
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 group-hover:bg-white/10 transition-colors", color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 text-left">
        <h4 className="font-bold text-white text-sm">{title}</h4>
        <p className="text-white/40 text-xs">{subtitle}</p>
      </div>
      <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-white/50" />
    </motion.button>
  )
}
