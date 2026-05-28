import { TrendingUp } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { AttendanceCard } from '@/components/dashboard/AttendanceCard';
import { ManagerStatsCards } from '@/components/dashboard/ManagerStatsCards';
import { WeekCalendar } from '@/components/dashboard/WeekCalendar';
import { CalendarWidget } from '@/components/dashboard/widgets/CalendarWidget';
import { UnifiedPlanWidget } from '@/components/dashboard/widgets/UnifiedPlanWidget';
import { PersonalPlanProgressWidget } from '@/components/dashboard/widgets/PersonalPlanProgressWidget';
import { shouldUseLegacySalesPlanWidget } from '@/lib/salesPlanWidgetGate';
import { ManagerQuickActions } from '@/components/dashboard/ManagerQuickActions';
import { NotificationsCard } from '@/components/dashboard/NotificationsCard';
import { DailyReportButton } from '@/components/dashboard/DailyReportButton';
import { useAuth } from '@/hooks/useAuth';
import { useUIConfig } from '@/hooks/useUIConfig';
import { DirectorStatsCards } from '@/components/dashboard/DirectorStatsCards';
import { ServiceRequestButton } from '@/components/dashboard/ServiceRequestButton';
import { DailyPlanButton } from '@/components/dashboard/DailyPlanButton';
import { DualKPIStats } from '@/components/dashboard/DualKPIStats';
import { KPIStats } from '@/components/dashboard/KPIStats';
import { SendNotificationButton } from '@/components/dashboard/SendNotificationButton';

const Index = () => {
  const { profile, accessLevel, uiRole, participatesInRating, role } = useAuth();
  const { getDashboardWidgets } = useUIConfig();
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Доброе утро' : currentHour < 18 ? 'Добрый день' : 'Добрый вечер';

  const firstName = profile?.full_name?.split(' ')[0] || 'Пользователь';
  const lastName = profile?.full_name?.split(' ')[1] || '';

  const isManagement = accessLevel >= 50;
  const posName = profile?.position?.name?.toLowerCase() || '';
  const isManagementPosition = posName.includes('моп') || posName.includes('роп') || posName.includes('директор');
  const hasDualKPI = isManagement || isManagementPosition;

  const isDirectorOrAdmin = accessLevel >= 90 || posName.includes('директор') || posName.includes('админ');
  const isComm = posName.includes('коммерческий');
  const showKPISection = participatesInRating && (!isDirectorOrAdmin || isComm);

  const widgets = getDashboardWidgets(uiRole);
  const roleLabel = profile?.position?.name || '';
  const legacySalesPlanWidget = shouldUseLegacySalesPlanWidget({
    accessLevel,
    appRole: role,
    positionName: profile?.position?.name,
  });

  const renderWidget = (widgetKey: string) => {
    switch (widgetKey) {
      case 'director_stats':
        return <DirectorStatsCards key="director_stats" />;
      case 'manager_stats':
        return <ManagerStatsCards key="manager_stats" />;
      case 'attendance':
        return <AttendanceCard key="attendance" />;
      case 'manager_actions':
        return <ManagerQuickActions key="manager_actions" />;
      case 'daily_report':
        return <DailyReportButton key="daily_report" />;
      case 'calendar':
        return <WeekCalendar key="calendar" />;
      case 'notifications':
        return <NotificationsCard key="notifications" />;
      case 'service_request':
        return <ServiceRequestButton key="service_request" />;
      case 'quarterly_plan':
        return legacySalesPlanWidget ? (
          <UnifiedPlanWidget key="quarterly_plan" />
        ) : (
          <PersonalPlanProgressWidget key="quarterly_plan" />
        );
      default:
        return null;
    }
  };

  return (
    <MainLayout>
      <div className="space-y-4 md:space-y-6 pb-10 px-3 sm:px-4 md:px-6 lg:px-8">
        {/* === PREMIUM HEADER & GREETING === */}
        <header className="relative p-4 sm:p-6 md:p-8 lg:p-10 xl:p-14 rounded-xl sm:rounded-[2rem] md:rounded-[2.5rem] lg:rounded-[3.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 overflow-hidden group mb-4 md:mb-8 lg:mb-12 shadow-2xl">
          <div className="absolute top-0 right-0 w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] bg-primary/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/10 transition-all duration-1000 pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 md:gap-8 lg:gap-12">
            <div className="space-y-2 sm:space-y-3 md:space-y-4 lg:space-y-6">
              <div className="mb-3 sm:mb-4 md:mb-6">
                <img src="/logo-panel.svg" alt="Логотип Ваша Крыша" className="h-5 sm:h-6 md:h-7 lg:h-8 w-auto object-contain opacity-40" />
              </div>
              <div className="flex items-center gap-2 md:gap-3 lg:gap-4">
                <div className="h-px w-6 md:w-8 lg:w-12 bg-primary/40" />
                <p className="text-[8px] sm:text-[9px] lg:text-[10px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] lg:tracking-[0.4em] text-primary/60">{greeting}</p>
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black text-white tracking-tighter leading-none uppercase">
                {firstName} <span className="text-white/10">{lastName}</span>
              </h1>
              <p className="text-[10px] sm:text-xs md:text-sm font-bold text-white/20 uppercase tracking-widest max-w-md hidden sm:block">
                Давайте сделаем этот день <span className="text-primary/60">продуктивным</span>. Успешных сделок!
              </p>
            </div>

            {roleLabel && (
              <div className="flex items-center gap-3 md:gap-4 lg:gap-6 bg-white/[0.03] p-2.5 sm:p-3 md:p-4 pr-4 sm:pr-6 md:pr-10 rounded-xl sm:rounded-[1.5rem] lg:rounded-[2rem] border border-white/5 backdrop-blur-3xl shadow-2xl transition-all duration-500 group-hover:bg-white/[0.05]" role="status" aria-label={`Ваша должность: ${roleLabel}`}>
                <div className="h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 lg:h-16 lg:w-16 rounded-lg sm:rounded-xl lg:rounded-2xl bg-primary/10 flex items-center justify-center shadow-2xl border border-primary/20">
                  <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 lg:h-8 lg:w-8 text-primary" />
                </div>
                <div>
                  <p className="text-[8px] sm:text-[9px] lg:text-[10px] font-black text-white/20 uppercase tracking-[0.15em] sm:tracking-[0.2em] lg:tracking-[0.3em] mb-0.5 sm:mb-1">Статус контроля</p>
                  <p className="text-base sm:text-lg md:text-xl font-black text-white uppercase tracking-tighter">{roleLabel}</p>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* CONTENT AREA */}
        <div className="space-y-3 md:space-y-4 lg:space-y-6 animate-fade-in">
          {isManagement ? (
            /* MANAGEMENT LAYOUT */
            <div className="space-y-3 md:space-y-4 lg:space-y-6">
              {/* 1. Attendance at the very top (full width) */}
              {widgets.includes('attendance') && <AttendanceCard key="attendance_card_mgmt" />}

              {/* 2. KPI Stats */}
              {showKPISection && (
                hasDualKPI ? <DualKPIStats key="dual_kpi_stats" /> : <KPIStats key="kpi_stats" />
              )}

              {/* 3. Stats Grid */}
              {widgets.includes('director_stats') && <DirectorStatsCards key="director_stats_cards" />}
              {widgets.includes('manager_stats') && <ManagerStatsCards key="manager_stats_cards" />}

              {/* 4. Notification Bar */}
              <SendNotificationButton key="send_notification_btn" />

              {/* 5. Calendar & Notifications Column */}
              {widgets.includes('calendar') && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-6">
                  <div className="lg:col-span-2">
                    <CalendarWidget key="calendar_widget_mgmt" className="lg:h-[600px]" />
                  </div>
                  <div className="lg:col-span-1 h-full flex flex-col">
                    {/* notifications always here for management instead of redundant plan */}
                    {widgets.includes('notifications') && (
                      <NotificationsCard key="notifications_widget" className="lg:h-[600px]" />
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* REGULAR EMPLOYEE LAYOUT */
            <div className="space-y-3 md:space-y-4 lg:space-y-6">
              {/* KPI Stats for realtors */}
              {showKPISection && (
                hasDualKPI ? <DualKPIStats key="dual_kpi_stats" /> : <KPIStats key="kpi_stats" />
              )}

              {/* Primary Operations Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-6 xl:gap-8 mb-3 md:mb-6 lg:mb-8">
                <DailyReportButton key="daily_report_btn_employee" />
                <DailyPlanButton key="daily_plan_btn_employee" />
                <ServiceRequestButton key="service_request_btn_employee" />
              </div>

              {/* Main Content Grid (Calendar left, Plan right) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-6">
                <div className="lg:col-span-2 flex flex-col gap-3 md:gap-4 lg:gap-6">
                  {widgets.includes('calendar') && <CalendarWidget key="calendar_widget" />}
                </div>
                <div className="lg:col-span-1 flex flex-col gap-3 md:gap-4 lg:gap-6">
                  {widgets.includes('quarterly_plan') &&
                    (legacySalesPlanWidget ? (
                      <UnifiedPlanWidget key="quarterly_plan_employee" />
                    ) : (
                      <PersonalPlanProgressWidget key="quarterly_plan_employee" />
                    ))}
                </div>
              </div>

              {/* Attendance & Notifications (Equal sizes row) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 lg:gap-6">
                {widgets.includes('attendance') && <AttendanceCard key="attendance_card_employee" />}
                {widgets.includes('notifications') && <NotificationsCard key="notifications_card_employee" className="max-h-[340px]" />}
              </div>

              {/* Grid for remaining small widgets */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-6">
                {widgets
                  .filter(w => !['calendar', 'director_stats', 'manager_stats', 'stats', 'daily_report', 'plan_widget', 'quarterly_plan', 'service_request', 'realtor_stats', 'attendance', 'notifications', 'manager_actions'].includes(w))
                  .map(w => renderWidget(w))
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default Index;
