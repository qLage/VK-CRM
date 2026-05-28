import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FileText,
  Zap, Briefcase, Star, Globe, Wallet, Shield,
} from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';

// Components
import { ServiceRequestSettings } from '@/components/service-requests/ServiceRequestSettings';
import { BranchesSettings } from '@/components/settings/BranchesSettings';
import { KpiSettings } from '@/components/settings/KpiSettings';
import { RatingSettings } from '@/components/settings/RatingSettings';
import { AvitoSettings } from '@/components/settings/AvitoSettings';
import { SalariesSettings } from '@/components/settings/SalariesSettings';
import { AuditSettings } from '@/components/settings/AuditSettings';

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { accessLevel } = useAuth();

  const canManageInterface = accessLevel >= 90;

  const allowedTabs = useMemo(
    () =>
      canManageInterface
        ? ['audit', 'reports', 'salaries', 'branches', 'kpi', 'rating', 'avito']
        : ['reports'],
    [canManageInterface],
  );

  const raw = searchParams.get('tab');
  const activeTab = raw && allowedTabs.includes(raw) ? raw : 'reports';

  const onTabChange = (next: string) => {
    const valid = allowedTabs.includes(next) ? next : 'reports';
    setSearchParams(
      (s) => {
        if (valid === 'reports') s.delete('tab');
        else s.set('tab', valid);
        return s;
      },
      { replace: true },
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6 md:space-y-8 lg:space-y-12 pb-16 md:pb-20 animate-fade-in max-w-[1600px] mx-auto pt-6 md:pt-8 lg:pt-10 px-3 sm:px-4 md:px-6 lg:px-8">

        {/* Header */}
        <div className="relative">
          <div className="absolute -left-20 -top-20 w-48 h-48 md:w-64 md:h-64 bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 md:gap-4 mb-4">
              <img src="/logo-panel.svg" alt="Logo" className="h-6 md:h-8 w-auto object-contain opacity-60" />
            </div>
            <div className="flex items-center gap-2 md:gap-3 mb-2">
              <div className="h-px w-6 md:w-8 bg-primary/50" />
              <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-primary/60">Центр управления</span>
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tighter leading-none mb-3 md:mb-4">
              НАСТРОЙКИ <span className="text-white/20">СИСТЕМЫ</span>
            </h1>
            <p className="text-white/40 font-medium max-w-md text-xs md:text-sm">Конфигурация бизнес-процессов, структуры организации и параметров интерфейса</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-6 md:space-y-8 lg:space-y-10">
          <div className="sticky top-12 lg:top-0 z-20 bg-background/40 backdrop-blur-3xl py-4 md:py-6 -my-4 md:-my-6 border-b border-white/5">
            <TabsList className="w-full md:w-auto overflow-x-auto scrollbar-hide">

              {canManageInterface && (
                <TabsTrigger value="audit" className="gap-1.5 md:gap-2 lg:gap-3 whitespace-nowrap">
                  <Shield className="h-3 w-3 md:h-3.5 md:h-3.5 lg:h-4 lg:w-4" />
                  <span className="hidden sm:inline">АУДИТ</span>
                  <span className="sm:hidden">АУДИТ</span>
                </TabsTrigger>
              )}

              <TabsTrigger value="reports" className="gap-1.5 md:gap-2 lg:gap-3 whitespace-nowrap">
                <FileText className="h-3 w-3 md:h-3.5 md:h-3.5 lg:h-4 lg:w-4" />
                <span className="hidden sm:inline">ОТЧЕТНОСТЬ</span>
                <span className="sm:hidden">ОТЧЕТЫ</span>
              </TabsTrigger>

              {canManageInterface && (
                <TabsTrigger value="salaries" className="gap-1.5 md:gap-2 lg:gap-3 whitespace-nowrap">
                  <Wallet className="h-3 w-3 md:h-3.5 md:h-3.5 lg:h-4 lg:w-4" />
                  ЗАРПЛАТЫ
                </TabsTrigger>
              )}

              {canManageInterface && (
                <TabsTrigger value="branches" className="gap-1.5 md:gap-2 lg:gap-3 whitespace-nowrap">
                  <Briefcase className="h-3 w-3 md:h-3.5 md:h-3.5 lg:h-4 lg:w-4" />
                  ФИЛИАЛЫ
                </TabsTrigger>
              )}

              {canManageInterface && (
                <TabsTrigger value="kpi" className="gap-1.5 md:gap-2 lg:gap-3 whitespace-nowrap">
                  <Zap className="h-3 w-3 md:h-3.5 md:h-3.5 lg:h-4 lg:w-4" />
                  <span className="hidden sm:inline">KPI</span>
                  <span className="sm:hidden">KPI</span>
                </TabsTrigger>
              )}

              {canManageInterface && (
                <TabsTrigger value="rating" className="gap-1.5 md:gap-2 lg:gap-3 whitespace-nowrap">
                  <Star className="h-3 w-3 md:h-3.5 md:h-3.5 lg:h-4 lg:w-4" />
                  <span className="hidden sm:inline">РЕЙТИНГ</span>
                  <span className="sm:hidden">РЕЙТИНГ</span>
                </TabsTrigger>
              )}

              {canManageInterface && (
                <TabsTrigger value="avito" className="gap-1.5 md:gap-2 lg:gap-3 whitespace-nowrap">
                  <Globe className="h-3 w-3 md:h-3.5 md:h-3.5 lg:h-4 lg:w-4" />
                  AVITO
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {canManageInterface && (
            <TabsContent value="audit" className="space-y-6 md:space-y-8 lg:space-y-12 mt-0 focus-visible:ring-0">
              <section>
                <div className="flex items-center gap-2.5 md:gap-3 lg:gap-4 mb-5 md:mb-6 lg:mb-8">
                  <div className="p-2.5 md:p-3 lg:p-4 bg-rose-500/10 rounded-xl md:rounded-2xl border border-rose-500/10 shadow-lg shadow-rose-500/5">
                    <Shield className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7 text-rose-400" />
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl lg:text-3xl font-black text-white uppercase tracking-tight">АУДИТ</h2>
                    <p className="text-[9px] md:text-[10px] lg:text-xs font-black text-white/20 uppercase tracking-[0.2em] md:tracking-[0.3em] mt-0.5 md:mt-1">
                      Журнал действий сотрудников и изменений в системе
                    </p>
                  </div>
                </div>
                <AuditSettings />
              </section>
            </TabsContent>
          )}

          <TabsContent value="reports" className="space-y-6 md:space-y-8 lg:space-y-12 mt-0 focus-visible:ring-0">
            <section>
              <div className="flex items-center gap-2.5 md:gap-3 lg:gap-4 mb-5 md:mb-6 lg:mb-8">
                <div className="p-2.5 md:p-3 lg:p-4 bg-emerald-500/10 rounded-xl md:rounded-2xl border border-emerald-500/10 shadow-lg shadow-emerald-500/5">
                  <FileText className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl lg:text-3xl font-black text-white uppercase tracking-tight">ОТЧЕТНОСТЬ</h2>
                  <p className="text-[9px] md:text-[10px] lg:text-xs font-black text-white/20 uppercase tracking-[0.2em] md:tracking-[0.3em] mt-0.5 md:mt-1">Конструктор форм и типов служебных записок</p>
                </div>
              </div>
              <ServiceRequestSettings />
            </section>
          </TabsContent>

          {canManageInterface && (
            <TabsContent value="salaries" className="space-y-6 md:space-y-8 lg:space-y-12 mt-0 focus-visible:ring-0">
              <section>
                <div className="flex items-center gap-2.5 md:gap-3 lg:gap-4 mb-5 md:mb-6 lg:mb-8">
                  <div className="p-2.5 md:p-3 lg:p-4 bg-violet-500/10 rounded-xl md:rounded-2xl border border-violet-500/10 shadow-lg shadow-violet-500/5">
                    <Wallet className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7 text-violet-400" />
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl lg:text-3xl font-black text-white uppercase tracking-tight">ЗАРПЛАТЫ</h2>
                    <p className="text-[9px] md:text-[10px] lg:text-xs font-black text-white/20 uppercase tracking-[0.2em] md:tracking-[0.3em] mt-0.5 md:mt-1">
                      Оклад по роли (МОП, РОП, коммерческий) и параметры выплат Финансы
                    </p>
                  </div>
                </div>
                <SalariesSettings />
              </section>
            </TabsContent>
          )}

          <TabsContent value="branches" className="space-y-6 md:space-y-8 lg:space-y-12 mt-0 focus-visible:ring-0">
            <section>
              <div className="flex items-center gap-2.5 md:gap-3 lg:gap-4 mb-5 md:mb-6 lg:mb-8">
                <div className="p-2.5 md:p-3 lg:p-4 bg-blue-500/10 rounded-xl md:rounded-2xl border border-blue-500/10 shadow-lg shadow-blue-500/5">
                  <Briefcase className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl lg:text-3xl font-black text-white uppercase tracking-tight">ФИЛИАЛЫ</h2>
                  <p className="text-[9px] md:text-[10px] lg:text-xs font-black text-white/20 uppercase tracking-[0.2em] md:tracking-[0.3em] mt-0.5 md:mt-1">Управление региональной сетью офисов</p>
                </div>
              </div>
              <BranchesSettings />
            </section>
          </TabsContent>

          {canManageInterface && (
            <TabsContent value="kpi" className="space-y-6 md:space-y-8 lg:space-y-12 mt-0 focus-visible:ring-0">
              <section>
                <div className="flex items-center gap-2.5 md:gap-3 lg:gap-4 mb-5 md:mb-6 lg:mb-8">
                  <div className="p-2.5 md:p-3 lg:p-4 bg-emerald-500/10 rounded-xl md:rounded-2xl border border-emerald-500/10 shadow-lg shadow-emerald-500/5">
                    <Zap className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7 text-emerald-500" />
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl lg:text-3xl font-black text-white uppercase tracking-tight">KPI НАСТРОЙКИ</h2>
                    <p className="text-[9px] md:text-[10px] lg:text-xs font-black text-white/20 uppercase tracking-[0.2em] md:tracking-[0.3em] mt-0.5 md:mt-1">Конфигурация формул расчета зарплаты</p>
                  </div>
                </div>
                <KpiSettings />
              </section>
            </TabsContent>
          )}

          {canManageInterface && (
            <TabsContent value="rating" className="space-y-6 md:space-y-8 lg:space-y-12 mt-0 focus-visible:ring-0">
              <section>
                <div className="flex items-center gap-2.5 md:gap-3 lg:gap-4 mb-5 md:mb-6 lg:mb-8">
                  <div className="p-2.5 md:p-3 lg:p-4 bg-amber-500/10 rounded-xl md:rounded-2xl border border-amber-500/10 shadow-lg shadow-amber-500/5">
                    <Star className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7 text-amber-500" />
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl lg:text-3xl font-black text-white uppercase tracking-tight">НАСТРОЙКИ РЕЙТИНГА</h2>
                    <p className="text-[9px] md:text-[10px] lg:text-xs font-black text-white/20 uppercase tracking-[0.2em] md:tracking-[0.3em] mt-0.5 md:mt-1">Конфигурация эталонных целей для оценки 5.0</p>
                  </div>
                </div>
                <RatingSettings />
              </section>
            </TabsContent>
          )}

          {canManageInterface && (
            <TabsContent value="avito" className="space-y-6 md:space-y-8 lg:space-y-12 mt-0 focus-visible:ring-0">
              <section>
                <div className="flex items-center gap-2.5 md:gap-3 lg:gap-4 mb-5 md:mb-6 lg:mb-8">
                  <div className="p-2.5 md:p-3 lg:p-4 bg-sky-500/10 rounded-xl md:rounded-2xl border border-sky-500/10 shadow-lg shadow-sky-500/5">
                    <Globe className="h-5 w-5 md:h-6 md:w-6 lg:h-7 lg:w-7 text-sky-400" />
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl lg:text-3xl font-black text-white uppercase tracking-tight">AVITO</h2>
                    <p className="text-[9px] md:text-[10px] lg:text-xs font-black text-white/20 uppercase tracking-[0.2em] md:tracking-[0.3em] mt-0.5 md:mt-1">Интеграция объявлений и синхронизация</p>
                  </div>
                </div>
                <AvitoSettings />
              </section>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </MainLayout>
  );
}
