import { Trophy, TrendingUp, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { shouldUseLegacySalesPlanWidget } from '@/lib/salesPlanWidgetGate';
import { UnifiedPlanWidget } from './widgets/UnifiedPlanWidget';
import { PersonalPlanProgressWidget } from './widgets/PersonalPlanProgressWidget';

export const ManagerStatsCards = () => {
  const { accessLevel, role, profile } = useAuth();
  const legacySalesPlanWidget = shouldUseLegacySalesPlanWidget({
    accessLevel,
    appRole: role,
    positionName: profile?.position?.name,
  });
  const { data: stats, isLoading } = useQuery({
    queryKey: ['manager-stats'],
    queryFn: async () => {
      const { data, error } = await localAPI.getDashboardStats();
      if (error) throw error;
      return data || {
        rating: '-',
        rating_change: 0,
        plan_percent: 0,
        active_deals: 0,
        team_rank: '-'
      };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-4 md:grid-rows-2 h-auto md:h-[400px]">
        <div className="col-span-2 row-span-2 rounded-3xl bg-zinc-900/60 border border-white/5 animate-pulse" />
        <div className="col-span-1 row-span-1 rounded-3xl bg-zinc-900/60 border border-white/5 animate-pulse" />
        <div className="col-span-1 row-span-1 rounded-3xl bg-zinc-900/60 border border-white/5 animate-pulse" />
        <div className="col-span-2 row-span-1 rounded-3xl bg-zinc-900/60 border border-white/5 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:gap-4 md:grid-cols-4 md:grid-rows-2 h-auto">
      {/* 1. Main Plan Card */}
      {legacySalesPlanWidget ? (
        <UnifiedPlanWidget className="col-span-2 row-span-2" />
      ) : (
        <PersonalPlanProgressWidget className="col-span-2 row-span-2" />
      )}

      {/* 2. Rating */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ y: -5, scale: 1.02 }}
        transition={{ delay: 0.05 }}
        className="relative overflow-hidden rounded-xl md:rounded-[2rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 p-5 md:p-7 group hover:bg-zinc-900/60 transition-all duration-500 shadow-2xl"
      >
        <div className="absolute -top-12 -right-12 p-12 bg-amber-500/20 blur-[60px] rounded-full w-24 h-24 group-hover:opacity-40 transition-all opacity-20" />
        <div className="relative z-10 flex justify-between items-start mb-4 md:mb-6">
          <div className="p-2 md:p-3 bg-amber-500/10 rounded-lg md:rounded-xl border border-amber-500/20 group-hover:bg-amber-500 group-hover:text-white transition-all duration-500">
            <Trophy className="h-4 w-4 md:h-5 md:w-5 text-amber-500 group-hover:text-white" />
          </div>
        </div>
        <div className="relative z-10 space-y-0.5 md:space-y-1">
          <div className="text-3xl md:text-4xl font-black text-white leading-none tracking-tighter">{stats?.rating || '-'}</div>
          <p className="text-[9px] md:text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">ТЕКУЩАЯ ПОЗИЦИЯ</p>
        </div>
      </motion.div>

      {/* 3. Team Rank */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ y: -5, scale: 1.02 }}
        transition={{ delay: 0.2 }}
        className="relative overflow-hidden rounded-xl md:rounded-[2rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 p-5 md:p-7 group hover:bg-zinc-900/60 transition-all duration-500 shadow-2xl"
      >
        <div className="absolute -top-12 -right-12 p-12 bg-purple-500/20 blur-[60px] rounded-full w-24 h-24 group-hover:opacity-40 transition-all opacity-20" />
        <div className="relative z-10 flex justify-between items-start mb-4 md:mb-6">
          <div className="p-2 md:p-3 bg-purple-500/10 rounded-lg md:rounded-xl border border-purple-500/20 group-hover:bg-purple-500 group-hover:text-white transition-all duration-500">
            <Users className="h-4 w-4 md:h-5 md:w-5 text-purple-500 group-hover:text-white" />
          </div>
        </div>
        <div className="relative z-10 space-y-0.5 md:space-y-1">
          <div className="text-3xl md:text-4xl font-black text-white leading-none tracking-tighter">{stats?.team_rank || 0}</div>
          <p className="text-[9px] md:text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">МЕСТО КОМАНДЫ</p>
        </div>
      </motion.div>

      {/* 4. Active Deals (Wide) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ y: -5, scale: 1.02 }}
        transition={{ delay: 0.15 }}
        className="col-span-2 row-span-1 relative overflow-hidden rounded-xl md:rounded-[2rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 p-5 md:p-7 group hover:bg-zinc-900/60 transition-all duration-500 shadow-2xl"
      >
        <div className="absolute -top-12 -right-12 p-12 bg-blue-500/20 blur-[60px] rounded-full w-24 h-24 group-hover:opacity-40 transition-all opacity-20" />
        <div className="relative z-10 flex justify-between items-start mb-4 md:mb-6">
          <div className="p-2 md:p-3 bg-blue-500/10 rounded-lg md:rounded-xl border border-blue-500/20 group-hover:bg-blue-500 group-hover:text-white transition-all duration-500">
            <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-blue-500 group-hover:text-white" />
          </div>
        </div>
        <div className="relative z-10 space-y-0.5 md:space-y-1">
          <div className="text-3xl md:text-4xl font-black text-white leading-none tracking-tighter">{stats?.active_deals || 0}</div>
          <p className="text-[9px] md:text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">АКТИВНЫЕ СДЕЛКИ</p>
        </div>
      </motion.div>
    </div>
  );
};

