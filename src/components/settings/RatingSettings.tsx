import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Star, Plus, Trash2, Save, Award, 
  Zap, Target, BarChart3, AlertCircle, Sparkles, ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { localAPI } from '@/integrations/localAPI';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatInteger, groupedIntegerInputDisplay, clampIntAmountFromDigits } from '@/utils/formatters';

interface RatingMetric {
  key: string;
  label: string;
  value: number;
  period: 'quarter';
}

interface RatingConfig {
  metrics: RatingMetric[];
}

interface BenchmarkData {
  revenue: number;
  deals: number;
  objects: number;
  deposits: number;
  lastAnalyzed: string;
}

const AVAILABLE_METRICS = [
  { key: 'target_revenue', label: 'Валовая выручка' },
  { key: 'target_deposits', label: 'Задатки' },
  { key: 'target_objects', label: 'Рост базы (Объекты)' },
  { key: 'target_deals', label: 'Сделки' },
  { key: 'target_meetings', label: 'Встречи' },
  { key: 'target_showings', label: 'Показы' },
  { key: 'target_calls', label: 'Звонки' },
  { key: 'target_newbuildings', label: 'Новостройки' },
  { key: 'target_mortgage', label: 'Ипотека' },
];

export function RatingSettings() {
  const [config, setConfig] = useState<RatingConfig>({ metrics: [] });
  const [benchmarks, setBenchmarks] = useState<BenchmarkData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [metricToDelete, setMetricToDelete] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchConfig(), fetchBenchmarks()]);
    };
    init();
  }, []);

  const fetchBenchmarks = async () => {
    try {
      const data = await localAPI.request('/settings/benchmarks');
      setBenchmarks(data);
    } catch (error) {
      console.error('Error fetching benchmarks:', error);
    }
  };

  const fetchConfig = async () => {
    try {
      const data = await localAPI.request('/settings');
      if (data.rating_config) {
        setConfig(data.rating_config);
      } else {
        // Default initial metrics if nothing in DB
        setConfig({
          metrics: [
            { key: 'target_objects', label: 'Рост базы', value: 20, period: 'quarter' },
            { key: 'target_revenue', label: 'Валовая выручка', value: 1500000, period: 'quarter' },
            { key: 'target_deposits', label: 'Задатки', value: 18, period: 'quarter' }
          ]
        });
      }
    } catch (error) {
      console.error('Error fetching rating config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await localAPI.request('/settings', {
        method: 'POST',
        body: {
          key: 'rating_config',
          value: config
        }
      });
      toast({
        title: 'Успешно',
        description: 'Настройки рейтинга сохранены',
      });
    } catch (error) {
      toast({
        title: 'Ошибка',
        description: 'Не удалось сохранить настройки',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addMetric = () => {
    const unusedMetric = AVAILABLE_METRICS.find(m => !config.metrics.some(cm => cm.key === m.key));
    if (unusedMetric) {
      setConfig({
        ...config,
        metrics: [
          ...config.metrics,
          { ...unusedMetric, value: 0, period: 'quarter' }
        ]
      });
    }
  };

  const removeMetric = (key: string) => {
    setMetricToDelete(key);
  };

  const confirmDelete = () => {
    if (metricToDelete) {
      setConfig({
        ...config,
        metrics: config.metrics.filter(m => m.key !== metricToDelete)
      });
      setMetricToDelete(null);
    }
  };

  const updateMetricValue = (key: string, value: number) => {
    setConfig((prev) => {
      const prevVal = prev.metrics.find((m) => m.key === key)?.value ?? 0;
      if (prevVal === value) return prev;
      return {
        ...prev,
        metrics: prev.metrics.map((m) => (m.key === key ? { ...m, value } : m)),
      };
    });
  };

  const updateMetricKey = (oldKey: string, newKey: string) => {
    const metricInfo = AVAILABLE_METRICS.find(m => m.key === newKey);
    if (metricInfo) {
      setConfig({
        ...config,
        metrics: config.metrics.map(m => m.key === oldKey ? { ...m, key: newKey, label: metricInfo.label } : m)
      });
    }
  };

  const applyBenchmarks = () => {
    if (!benchmarks) return;
    
    setBenchmarks(null); // Simple loading state feedback
    
    const newMetrics: RatingMetric[] = [
      { key: 'target_revenue', label: 'Валовая выручка', value: benchmarks.revenue, period: 'quarter' },
      { key: 'target_deposits', label: 'Задатки', value: benchmarks.deposits, period: 'quarter' },
      { key: 'target_objects', label: 'Рост базы', value: benchmarks.objects, period: 'quarter' }
    ];
    
    setConfig({ metrics: newMetrics });
    fetchBenchmarks(); // reload benchmarks state
    
    toast({
      title: 'Бенчмарки применены',
      description: 'Установлены средние показатели лидеров за последние 6 месяцев',
    });
  };

  if (isLoading) return <div className="h-40 animate-pulse bg-white/5 rounded-3xl" />;

  return (
    <div className="space-y-8 md:space-y-12">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-12">
        {/* Main Settings */}
        <div className="xl:col-span-8 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                <Star className="h-6 w-6 text-amber-500 fill-amber-500/20" />
                КРИТЕРИИ ИДЕАЛЬНОГО РЕЙТИНГА
              </h3>
              <p className="text-[10px] md:text-xs font-bold text-white/40 uppercase tracking-widest mt-1">Настройка показателей для достижения балла 5.0</p>
            </div>
            <Button 
              onClick={addMetric}
              variant="outline"
              className="bg-primary/10 border-primary/20 text-primary hover:bg-primary hover:text-black rounded-xl h-10 px-4 font-black text-xs uppercase tracking-widest gap-2 transition-all duration-300"
            >
              <Plus className="h-4 w-4" />
              Добавить
            </Button>
          </div>

          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {config.metrics.map((metric, idx) => (
                <motion.div
                  key={metric.key}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Card className="bg-zinc-900/40 border-white/5 overflow-hidden group hover:bg-zinc-900/60 transition-all duration-500 rounded-2xl shadow-xl">
                    <CardContent className="p-4 md:p-6 flex flex-col md:flex-row items-center gap-4 md:gap-8">
                      <div className="w-full md:w-64">
                        <Select 
                          value={metric.key} 
                          onValueChange={(v: string) => updateMetricKey(metric.key, v)}
                        >
                          <SelectTrigger className="bg-zinc-950 border-white/10 text-white rounded-xl h-12 px-4 shadow-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-white/10 rounded-xl">
                            {AVAILABLE_METRICS.map(m => (
                              <SelectItem 
                                key={m.key} 
                                value={m.key}
                                disabled={config.metrics.some(cm => cm.key === m.key && cm.key !== metric.key)}
                                className="text-[10px] font-black uppercase tracking-widest py-3"
                              >
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex-1 flex items-center gap-4 w-full">
                        <div className="relative flex-1">
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={groupedIntegerInputDisplay(metric.value)}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              updateMetricValue(metric.key, clampIntAmountFromDigits(e.target.value))
                            }
                            className="bg-zinc-950 border-white/10 text-white rounded-xl h-12 pl-4 pr-12 text-lg font-black tabular-nums shadow-xl focus:ring-primary/50"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-white/20 uppercase tracking-widest">/ Квартал</span>
                        </div>
                        
                        <div className="hidden lg:flex flex-col items-center justify-center px-4 py-2 bg-white/5 rounded-xl border border-white/5 min-w-[100px]">
                          <span className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-0.5">В месяц</span>
                          <span className="text-sm font-black text-primary tabular-nums">
                            {formatInteger(Math.ceil(metric.value / 3))}
                          </span>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMetric(metric.key)}
                        className="text-white/20 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl h-12 w-12 transition-all duration-300"
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {config.metrics.length === 0 && (
              <div className="p-12 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                <AlertCircle className="h-10 w-10 text-white/10 mx-auto mb-4" />
                <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Метрики не выбраны</p>
                <Button onClick={addMetric} variant="link" className="text-primary mt-2">Добавить первый показатель</Button>
              </div>
            )}
          </div>

          <div className="pt-4">
            <Button 
              onClick={handleSave}
              disabled={isSaving}
              className="w-full md:w-auto bg-primary text-white hover:bg-primary/90 rounded-2xl h-14 px-10 font-black text-sm uppercase tracking-widest gap-3 shadow-2xl shadow-primary/20 transition-all duration-300 active:scale-95"
            >
              {isSaving ? <Zap className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Сохранить конфигурацию
            </Button>
          </div>
        </div>

        {/* Sidebar Info & Recommendations */}
        <div className="xl:col-span-4 space-y-6 md:space-y-8">
          <Card className="bg-zinc-900/60 backdrop-blur-3xl border-white/5 overflow-hidden shadow-2xl rounded-[1.5rem] md:rounded-[2.5rem] group border-t-white/10">
            <CardContent className="p-6 md:p-8 space-y-6">
              <div className="flex items-center gap-4 text-primary">
                <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20 group-hover:rotate-6 transition-transform duration-500">
                  <Award className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-black text-white uppercase tracking-tight">РЕКОМЕНДАЦИИ</h4>
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Максимальная эффективность</p>
                </div>
              </div>

              <div className="space-y-4">
                {config.metrics.map((metric, idx) => {
                  const mInfo = AVAILABLE_METRICS.find(am => am.key === metric.key);
                  const icon = mInfo?.key.includes('revenue') ? Target : 
                               mInfo?.key.includes('deposits') || mInfo?.key.includes('deals') ? Zap : 
                               BarChart3;
                  
                  // Map benchmark keys to metric keys
                  let bVal: number | undefined;
                  if (metric.key === 'target_revenue') bVal = benchmarks?.revenue;
                  else if (metric.key === 'target_deals') bVal = benchmarks?.deals;
                  else if (metric.key === 'target_objects') bVal = benchmarks?.objects;
                  else if (metric.key === 'target_deposits') bVal = benchmarks?.deposits;

                  const hasBenchmark = bVal !== undefined && bVal > 0;
                  const displayLabel = mInfo?.label.toUpperCase() || 'ПОКАЗАТЕЛЬ';

                  // Specific advice for each metric type
                  const getAdvice = () => {
                    if (hasBenchmark) {
                      const val = metric.key === 'target_revenue' ? `${((bVal || 0) / 1000000).toFixed(1)}M` : bVal;
                      return `Среднее у ваших лидеров: ${val} в квартал. Это отличный ориентир для 5.0.`;
                    }
                    
                    switch(metric.key) {
                      case 'target_revenue': return 'Оптимально ставить от 1.5M до 2.5M в квартал для агента среднего уровня.';
                      case 'target_deals': return 'Хороший показатель — 3-5 успешных сделок в квартал.';
                      case 'target_objects': return 'Рекомендуем норму в 18-25 новых объектов (6-8 в месяц) для ликвидности.';
                      case 'target_deposits': return 'Стабильный результат — это 15-20 задатков за квартал.';
                      case 'target_meetings': return 'Для активных продаж нужно проводить 20-30 встреч в квартал.';
                      case 'target_calls': return 'Норма по звонкам для поддержания воронки — от 300 в квартал.';
                      default: return `Установите амбициозную, но достижимую цель для показателя "${mInfo?.label}".`;
                    }
                  };

                  return (
                    <motion.div 
                      key={metric.key}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="flex gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-primary/20 transition-all duration-300 relative overflow-hidden group"
                    >
                      <div className="absolute right-0 top-0 w-16 h-16 bg-primary/5 blur-2xl group-hover:bg-primary/10 transition-all" />
                      {React.createElement(icon, { className: "h-5 w-5 text-primary shrink-0 mt-1" })}
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-[10px] font-black text-white uppercase tracking-widest">{displayLabel}</p>
                          {hasBenchmark && (
                            <span className="text-[10px] font-black text-primary px-1.5 py-0.5 bg-primary/10 rounded">
                              {metric.key === 'target_revenue'
                                ? `~${((bVal || 0) / 1000000).toFixed(1)}M`
                                : `~${formatInteger(Math.round(bVal ?? 0))}`}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white/40 leading-relaxed font-medium">
                          {getAdvice()}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}

                {config.metrics.length === 0 && (
                  <div className="p-8 text-center bg-white/5 rounded-2xl border border-dashed border-white/5">
                    <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Добавьте критерии для получения рекомендаций</p>
                  </div>
                )}
              </div>

              {benchmarks && (
                <Button 
                  onClick={applyBenchmarks}
                  className="w-full bg-primary text-white hover:bg-primary/95 rounded-2xl h-12 font-black text-[10px] uppercase tracking-[0.2em] gap-2 transition-all group shadow-xl"
                >
                  <Sparkles className="h-3.5 w-3.5 group-hover:animate-pulse shadow-2xl" />
                  Применить эталоны лидеров
                  <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={!!metricToDelete} onOpenChange={(open: boolean) => !open && setMetricToDelete(null)}>
        <AlertDialogContent className="bg-zinc-900 border-white/10 rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white font-black uppercase tracking-tight">Подтверждение удаления</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              Вы действительно хотите удалить этот критерий из рейтинга? Это действие можно будет отменить только если вы не сохраните настройки.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-xl font-bold uppercase tracking-widest text-[10px]">Отмена</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-rose-500 text-white hover:bg-rose-600 rounded-xl font-bold uppercase tracking-widest text-[10px]"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
