import { motion } from 'framer-motion';
import { Activity, FileText, Home, Users, Phone, Mail, Calendar, CheckCircle2, TrendingUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';
import { useEmployeeActivityFeed } from '@/hooks/useEmployeeActivityFeed';

interface Employee {
  id: string;
  full_name: string;
}

interface ActivityFeedProps {
  employee: Employee;
}

type ActivityType = 'deal' | 'object' | 'meeting' | 'call' | 'email' | 'task' | 'achievement';

interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: Date;
  metadata?: {
    amount?: number;
    client?: string;
    status?: string;
  };
}

const getActivityIcon = (type: ActivityType) => {
  switch (type) {
    case 'deal':
      return FileText;
    case 'object':
      return Home;
    case 'meeting':
      return Users;
    case 'call':
      return Phone;
    case 'email':
      return Mail;
    case 'task':
      return CheckCircle2;
    case 'achievement':
      return TrendingUp;
    default:
      return Activity;
  }
};

const getActivityColor = (type: ActivityType) => {
  switch (type) {
    case 'deal':
      return { bg: 'bg-primary/10', border: 'border-primary/20', text: 'text-primary', icon: 'text-primary' };
    case 'object':
      return { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400', icon: 'text-purple-400' };
    case 'meeting':
      return { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', icon: 'text-blue-400' };
    case 'call':
      return { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-400', icon: 'text-green-400' };
    case 'email':
      return { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', icon: 'text-amber-400' };
    case 'task':
      return { bg: 'bg-white/5', border: 'border-white/10', text: 'text-white/60', icon: 'text-white/60' };
    case 'achievement':
      return { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', icon: 'text-amber-400' };
    default:
      return { bg: 'bg-white/5', border: 'border-white/10', text: 'text-white/60', icon: 'text-white/60' };
  }
};

const formatTimestamp = (date: Date) => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Только что';
  if (diffMins < 60) return `${diffMins} мин назад`;
  if (diffHours < 24) return `${diffHours} ч назад`;
  if (diffDays < 7) return `${diffDays} дн назад`;

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};

export function ActivityFeed({ employee }: ActivityFeedProps) {
  const { activities: apiActivities, isLoading, error } = useEmployeeActivityFeed(employee.id);

  // Map API data to component format
  const activities = useMemo(() => {
    if (isLoading) return [];

    if (!apiActivities || apiActivities.length === 0) {
      return [];
    }

    return apiActivities.map(item => ({
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      timestamp: new Date(item.timestamp),
      metadata: item.metadata || undefined,
    }));
  }, [apiActivities, isLoading]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="rounded-xl md:rounded-[2rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 p-4 sm:p-6 md:p-8 shadow-2xl w-full h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 md:p-2.5 rounded-lg md:rounded-xl bg-white/5 border border-white/10">
            <Activity className="h-4 w-4 md:h-5 md:w-5 text-white/60" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl md:text-2xl font-black text-white uppercase tracking-tight">
              Лента активности
            </h2>
            <p className="text-[9px] md:text-[10px] font-bold text-white/40 uppercase tracking-wider mt-0.5">
              Последние действия
            </p>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 text-white/40 animate-spin" aria-hidden="true" />
          <span className="sr-only">Загрузка активности...</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && activities.length === 0 && (
        <div className="text-center py-12">
          <Activity className="h-12 w-12 text-white/20 mx-auto mb-4" aria-hidden="true" />
          <p className="text-sm text-white/40">Нет данных об активности</p>
        </div>
      )}

      {/* Activity Timeline */}
      {!isLoading && activities.length > 0 && (
        <div className="space-y-3 md:space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-[600px]">
          {activities.slice(0, 15).map((activity, index) => {
            const Icon = getActivityIcon(activity.type);
            const colors = getActivityColor(activity.type);

            return (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.03 }}
                className="relative group"
              >
                {/* Timeline connector */}
                {index < activities.length - 1 && (
                  <div className="absolute left-[19px] top-[40px] w-[2px] h-[calc(100%+12px)] bg-white/5" />
                )}

                <div className="flex gap-3 md:gap-4">
                  {/* Icon */}
                  <div className={cn(
                    'relative z-10 shrink-0 p-2 md:p-2.5 rounded-lg md:rounded-xl border transition-all duration-300 group-hover:scale-110',
                    colors.bg,
                    colors.border
                  )}>
                    <Icon className={cn('h-3.5 w-3.5 md:h-4 md:w-4', colors.icon)} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 p-3 md:p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-sm md:text-base font-black text-white">
                        {activity.title}
                      </h3>
                      <span className="text-[9px] md:text-[10px] font-bold text-white/30 uppercase tracking-wider shrink-0">
                        {formatTimestamp(activity.timestamp)}
                      </span>
                    </div>

                    <p className="text-xs md:text-sm font-medium text-white/50 mb-2">
                      {activity.description}
                    </p>

                    {/* Metadata */}
                    {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {activity.metadata.client && (
                          <span className="px-2 py-1 rounded-md bg-white/5 border border-white/5 text-[9px] md:text-[10px] font-bold text-white/40">
                            {activity.metadata.client}
                          </span>
                        )}
                        {activity.metadata.amount && (
                          <span className="px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-[9px] md:text-[10px] font-bold text-primary">
                            {(activity.metadata.amount / 1000000).toFixed(0)}M ₽
                          </span>
                        )}
                        {activity.metadata.status && (
                          <span className="px-2 py-1 rounded-md bg-green-500/10 border border-green-500/20 text-[9px] md:text-[10px] font-bold text-green-400">
                            {activity.metadata.status}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
