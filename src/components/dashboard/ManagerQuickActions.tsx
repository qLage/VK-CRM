import { motion } from 'framer-motion';
import {
  Users, BarChart3, DollarSign, FileCheck, Bell, Settings,
  TrendingUp, ChevronRight, Send
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { SendNotificationDialog } from '@/components/notifications/SendNotificationDialog';

export function ManagerQuickActions() {
  // Fetch pending reports count
  const { data: stats } = useQuery({
    queryKey: ['manager-quick-stats'],
    queryFn: async () => {
      const { data: allReports, error: reportsError } = await localAPI.request('/reports');
      if (reportsError) throw reportsError;
      const reportsArray = Array.isArray(allReports?.data) ? allReports.data : (Array.isArray(allReports) ? allReports : []);
      const pendingReports = reportsArray.filter((r: any) => r.status === 'pending');

      const { data: allEmployees, error: empError } = await localAPI.request('/employees');
      if (empError) throw empError;
      const employeesArray = Array.isArray(allEmployees?.data) ? allEmployees.data : (Array.isArray(allEmployees) ? allEmployees : []);
      const activeEmployees = employeesArray.filter((e: any) => e.is_active);

      return {
        pendingReports: pendingReports.length,
        employees: activeEmployees.length,
      };
    },
    staleTime: 60000,
  });

  const actions = [
    { icon: Send, label: 'Уведомление', onClick: () => { /* Handled by Dialog */ }, description: 'Отправить', highlight: true, isDialog: true },
    { icon: Users, label: 'Сотрудники', href: '/employees', description: `${stats?.employees || 0} активных`, highlight: false },
    { icon: Users, label: 'Команды', href: '/teams-manage', description: 'Управление', highlight: false },
    { icon: BarChart3, label: 'Аналитика', href: '/analytics', description: 'Статистика', highlight: false },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="space-y-2 md:space-y-3"
    >
      {/* Primary action - Pending reports */}
      <Link to="/reports">
        <motion.div
          whileTap={{ scale: 0.98 }}
          className="relative overflow-hidden rounded-xl md:rounded-2xl p-3 md:p-4 bg-gradient-to-r from-info to-info/80 shadow-lg hover:shadow-xl transition-all"
        >
          <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-2 md:p-2.5 bg-white/20 rounded-lg md:rounded-xl">
                <FileCheck className="h-4 w-4 md:h-5 md:w-5 text-white" />
              </div>
              <div>
                <p className="text-sm md:text-base font-bold text-white">Служебки на проверку</p>
                <p className="text-[10px] md:text-xs text-white/70">
                  {stats?.pendingReports || 0} ожидают одобрения
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-white/70" />
          </div>
        </motion.div>
      </Link>

      {/* Secondary actions grid */}
      <div className="grid grid-cols-2 gap-1.5 md:gap-2">
        {actions.map((action, index) => {
          const Icon = action.icon;
          const content = (
            <motion.div
              whileTap={{ scale: 0.98 }}
              className={`flex flex-col items-center gap-1.5 md:gap-2 p-2.5 md:p-3 rounded-xl md:rounded-2xl glass-card border transition-all h-full cursor-pointer ${action.highlight
                ? 'border-primary/50 bg-primary/5'
                : 'border-border/50 hover:border-primary/30'
                }`}
            >
              <div className={`p-2 md:p-2.5 rounded-lg md:rounded-xl ${action.highlight ? 'bg-primary/20' : 'bg-secondary'}`}>
                <Icon className={`h-3.5 w-3.5 md:h-4 md:w-4 ${action.highlight ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div className="text-center">
                <p className="text-[10px] md:text-xs font-semibold">{action.label}</p>
                <p className="text-[9px] md:text-[10px] text-muted-foreground">{action.description}</p>
              </div>
            </motion.div>
          );

          if (action.isDialog) {
            return (
              <SendNotificationDialog
                key={action.label}
                trigger={content}
              />
            );
          }

          return (
            <motion.div
              key={action.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.05 }}
            >
              <Link to={action.href || '#'}>
                {content}
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
