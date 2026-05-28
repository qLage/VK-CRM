import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Calendar as CalendarIcon, Download, Filter, RotateCcw, Search, FileText, User, Tag, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface AuditLogEntry {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, any>;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Создание',
  UPDATE: 'Изменение',
  DELETE: 'Удаление',
  STATUS_CHANGE: 'Изменение статуса',
  APPROVE: 'Одобрение',
  REJECT: 'Отклонение',
  LOGIN: 'Вход',
  LOGOUT: 'Выход',
};

const ENTITY_LABELS: Record<string, string> = {
  deal: 'Сделка',
  employee: 'Сотрудник',
  client: 'Клиент',
  report: 'Отчёт',
  property: 'Объект',
  service_request: 'Заявка',
  finance: 'Финансы',
  branch: 'Филиал',
  team: 'Команда',
  position: 'Должность',
  user: 'Пользователь',
  lead: 'Лид',
  avito: 'Авито',
  building: 'ЖК',
  payment: 'Платёж',
  commission: 'Комиссия',
  commission_rule: 'Правило комиссии',
  template: 'Шаблон',
  setting: 'Настройка',
  kpi_setting: 'KPI настройки',
  mortgage_service: 'Ипотека',
  recurring_expense: 'Расход',
  activity: 'Активность',
  attendance: 'Посещаемость',
  calendar_event: 'Событие',
  document: 'Документ',
  participant: 'Участник',
  profile: 'Профиль',
  plan: 'План',
  auth: 'Авторизация',
};

function getActionColor(action: string): string {
  switch (action) {
    case 'CREATE': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    case 'UPDATE': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    case 'DELETE': return 'text-red-400 bg-red-500/10 border-red-500/20';
    case 'APPROVE': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    case 'REJECT': return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    case 'STATUS_CHANGE': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    case 'LOGIN': return 'text-primary bg-primary/10 border-primary/20';
    default: return 'text-white/60 bg-white/5 border-white/10';
  }
}

export function AuditSettings() {
  const { accessLevel } = useAuth();
  const isDirector = accessLevel >= 90;

  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [filters, setFilters] = useState({
    action: 'all',
    entity_type: 'all',
    search: '',
    from: undefined as Date | undefined,
    to: undefined as Date | undefined,
  });
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const queryParams = useMemo(() => {
    const params: Record<string, string> = { page: String(page), limit: String(limit) };
    if (filters.action && filters.action !== 'all') params.action = filters.action;
    if (filters.entity_type && filters.entity_type !== 'all') params.entity_type = filters.entity_type;
    if (filters.from) params.from = filters.from.toISOString();
    if (filters.to) params.to = filters.to.toISOString();
    return params;
  }, [filters, page, limit]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit', 'logs', queryParams],
    queryFn: async () => {
      const searchParams = new URLSearchParams(queryParams);
      const { data, error } = await localAPI.request(`/audit/logs?${searchParams}`);
      if (error) throw error;
      return data as { rows: AuditLogEntry[]; pagination: { total: number; totalPages: number } };
    },
    enabled: isDirector,
    staleTime: 30000,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const { data: actionsData } = useQuery({
    queryKey: ['audit', 'actions'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/audit/actions');
      if (error) throw error;
      return data as string[];
    },
    enabled: isDirector,
  });

  const { data: entityTypesData } = useQuery({
    queryKey: ['audit', 'entity-types'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/audit/entity-types');
      if (error) throw error;
      return data as string[];
    },
    enabled: isDirector,
  });

  // Fallback to predefined lists if backend returns empty
  const actions = actionsData?.length ? actionsData : Object.keys(ACTION_LABELS);
  const entityTypes = entityTypesData?.length ? entityTypesData : Object.keys(ENTITY_LABELS);

  const handleExport = () => {
    if (!data?.rows) return;
    const rows = data.rows;
    const csvHeader = 'Дата,Пользователь,Действие,Тип,Название,Статус,Примечание\n';
    const csvRows = rows.map((r) => {
      const date = format(new Date(r.created_at), 'dd.MM.yyyy HH:mm:ss', { locale: ru });
      const details = r.details || {};
      const name = details.property_name || details.full_name || details.name || r.entity_id || '';
      const status = details.new_status || details.status || '';
      const note = details.reason || '';
      return [
        date,
        r.user_name,
        ACTION_LABELS[r.action] || r.action,
        ENTITY_LABELS[r.entity_type] || r.entity_type,
        name,
        status,
        note,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = '\uFEFF' + csvHeader + csvRows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Аудит экспортирован');
  };

  const quickDateFilters = [
    { label: 'Сегодня', days: 0 },
    { label: 'Неделя', days: 7 },
    { label: 'Месяц', days: 30 },
    { label: 'Квартал', days: 90 },
    { label: 'Год', days: 365 },
  ];

  const applyQuickFilter = (days: number) => {
    const to = new Date();
    const from = new Date();
    if (days === 0) {
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
    } else {
      from.setDate(from.getDate() - days);
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
    }
    setFilters((f) => ({ ...f, from, to }));
    setPage(1);
  };

  if (!isDirector) {
    return (
      <div className="flex items-center justify-center h-64 text-white/40 font-bold">
        Доступ запрещен
      </div>
    );
  }

  const filteredRows = (data?.rows || []).filter((r) => {
    if (!filters.search) return true;
    const q = filters.search.toLowerCase();
    return (
      r.user_name.toLowerCase().includes(q) ||
      (ACTION_LABELS[r.action] || r.action).toLowerCase().includes(q) ||
      (ENTITY_LABELS[r.entity_type] || r.entity_type).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Filters */}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
              <Input
                placeholder="Поиск по пользователю, действию..."
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                className="pl-9 bg-white/[0.03] border-white/10"
              />
            </div>
          </div>

          <Select value={filters.action} onValueChange={(v) => { setFilters((f) => ({ ...f, action: v })); setPage(1); }}>
            <SelectTrigger className="w-[200px] bg-white/[0.03] border-white/10">
              <SelectValue placeholder="Действие" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-950 border-white/10">
              <SelectItem value="all">Все действия</SelectItem>
              {actions?.map((a) => (
                <SelectItem key={a} value={a}>{ACTION_LABELS[a] || a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.entity_type} onValueChange={(v) => { setFilters((f) => ({ ...f, entity_type: v })); setPage(1); }}>
            <SelectTrigger className="w-[200px] bg-white/[0.03] border-white/10">
              <SelectValue placeholder="Тип сущности" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-950 border-white/10">
              <SelectItem value="all">Все типы</SelectItem>
              {entityTypes?.map((t) => (
                <SelectItem key={t} value={t}>{ENTITY_LABELS[t] || t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="bg-white/[0.03] border-white/10 gap-2">
                <CalendarIcon className="h-4 w-4" />
                {filters.from ? format(filters.from, 'dd.MM.yyyy') : 'От'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-zinc-950 border-white/10">
              <Calendar
                mode="single"
                selected={filters.from}
                onSelect={(d) => setFilters((f) => ({ ...f, from: d }))}
                locale={ru}
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="bg-white/[0.03] border-white/10 gap-2">
                <CalendarIcon className="h-4 w-4" />
                {filters.to ? format(filters.to, 'dd.MM.yyyy') : 'До'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-zinc-950 border-white/10">
              <Calendar
                mode="single"
                selected={filters.to}
                onSelect={(d) => setFilters((f) => ({ ...f, to: d }))}
                locale={ru}
              />
            </PopoverContent>
          </Popover>

          <Button variant="ghost" size="icon" onClick={() => { setFilters({ action: 'all', entity_type: 'all', search: '', from: undefined, to: undefined }); setPage(1); }}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {quickDateFilters.map((f) => (
            <Button
              key={f.label}
              variant="outline"
              size="sm"
              onClick={() => applyQuickFilter(f.days)}
              className="bg-white/[0.02] border-white/10 hover:bg-white/5 text-[10px] uppercase font-black tracking-wider"
            >
              {f.label}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="bg-white/[0.02] border-white/10 hover:bg-white/5 text-[10px] uppercase font-black tracking-wider gap-2 ml-auto"
          >
            <Download className="h-3 w-3" />
            Экспорт CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border border-white/10 rounded-2xl overflow-hidden bg-white/[0.02]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03]">
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-white/40">Дата</th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-white/40">Пользователь</th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-white/40">Действие</th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-white/40">Тип</th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-white/40">Название</th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-white/40">Статус</th>
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-white/40">Примечание</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-white/30">
                    <Activity className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Загрузка...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-white/30">
                    <FileText className="h-6 w-6 mx-auto mb-2 opacity-30" />
                    Записи не найдены
                  </td>
                </tr>
              ) : (
                filteredRows.flatMap((row) => {
                  const details = row.details || {};
                  const name = details.property_name || details.full_name || details.name || row.entity_id || '—';
                  const status = details.new_status || details.status || '—';
                  const diff = details.diff;
                  const note = details.reason || '—';
                  const isExpanded = expandedRows.has(row.id);
                  const hasDiff = diff && Object.keys(diff).length > 0;
                  const cells = (
                    <tr key={row.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => {
                      if (!hasDiff) return;
                      setExpandedRows(prev => {
                        const next = new Set(prev);
                        if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                        return next;
                      });
                    }}>
                      <td className="px-4 py-3 whitespace-nowrap text-white/50 text-xs">
                        {format(new Date(row.created_at), 'dd.MM.yyyy HH:mm', { locale: ru })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3 text-white/30" />
                          <span className="text-white font-medium text-xs">{row.user_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter border",
                          getActionColor(row.action)
                        )}>
                          {ACTION_LABELS[row.action] || row.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Tag className="h-3 w-3 text-white/30" />
                          <span className="text-white/60 text-xs">{ENTITY_LABELS[row.entity_type] || row.entity_type}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-white/60 text-xs max-w-[150px] truncate" title={name}>
                        {name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-white/50 text-xs">{status}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-white/40 text-xs max-w-[120px] truncate" title={note}>{note}</span>
                          {hasDiff && (
                            isExpanded ? <ChevronUp className="h-3 w-3 text-white/40" /> : <ChevronDown className="h-3 w-3 text-white/40" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                  if (!isExpanded || !hasDiff) return [cells];
                  const diffRow = (
                    <tr key={`${row.id}-diff`} className="border-b border-white/5 bg-white/[0.01]">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(diff).map(([k, v]: [string, any]) => (
                            <div key={k} className="inline-flex items-center gap-1.5 bg-white/[0.03] border border-white/10 rounded-md px-2 py-1 text-xs">
                              <span className="text-white/40">{k}</span>
                              <span className="text-red-400 line-through">{v.old ?? '—'}</span>
                              <span className="text-white/20">→</span>
                              <span className="text-emerald-400">{v.new ?? '—'}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                  return [cells, diffRow];
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
            <span className="text-[10px] text-white/30 font-bold uppercase tracking-wider">
              Страница {page} из {data.pagination.totalPages} ({data.pagination.total} записей)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="bg-white/[0.03] border-white/10"
              >
                Назад
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="bg-white/[0.03] border-white/10"
              >
                Вперед
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
