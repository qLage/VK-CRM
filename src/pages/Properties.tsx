import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useProperties, Property, PropertyFilters } from '@/hooks/useProperties';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { INPUT_WITH_LEADING_ICON } from '@/lib/inputClassNames';
import {
  Building2, Search, Plus, Filter, MapPin, Home, House, TreePine, Store, Key,
  Check, X, Send, Archive, Globe, ArrowRightLeft,
  ImageIcon, MoreVertical, Pencil, Trash2, Eye, User, Users,
  Layers, Coins, CheckCircle2, LayoutGrid, List
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger
} from '@/components/ui/popover';
import { PropertyFormDialog } from '@/components/properties/PropertyFormDialog';
import { PropertyDetailDialog } from '@/components/properties/PropertyDetailDialog';
import { PropertyTransferDialog } from '@/components/properties/PropertyTransferDialog';
import { PropertyApproveDialog } from '@/components/properties/PropertyApproveDialog';
import { MainLayout } from '@/components/layout/MainLayout';

const CATEGORIES: Record<string, { label: string; icon: any; color: string; ring: string }> = {
  newbuilding: { label: 'Новостройка', icon: Building2, color: 'text-blue-300', ring: 'bg-blue-500/15 border-blue-500/20' },
  secondary:   { label: 'Вторичка',     icon: Home,      color: 'text-amber-300', ring: 'bg-amber-500/15 border-amber-500/20' },
  /** Как в форме объекта (PropertyFormDialog): продажа квартиры */
  apartment_sell: { label: 'Вторичка', icon: Home, color: 'text-amber-300', ring: 'bg-amber-500/15 border-amber-500/20' },
  /** Аренда квартиры — тот же визуал, что «Аренда» */
  apartment_rent: { label: 'Аренда', icon: Key, color: 'text-cyan-300', ring: 'bg-cyan-500/15 border-cyan-500/20' },
  house:        { label: 'Дом, дача',   icon: House,     color: 'text-orange-300', ring: 'bg-orange-500/15 border-orange-500/20' },
  land:        { label: 'Участок',      icon: TreePine,  color: 'text-emerald-300', ring: 'bg-emerald-500/15 border-emerald-500/20' },
  commercial:  { label: 'Коммерция',    icon: Store,     color: 'text-purple-300', ring: 'bg-purple-500/15 border-purple-500/20' },
  rent:        { label: 'Аренда',       icon: Key,       color: 'text-cyan-300', ring: 'bg-cyan-500/15 border-cyan-500/20' },
};

const STATUSES: Record<string, { label: string; color: string }> = {
  draft:             { label: 'Черновик',         color: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/20' },
  pending_approval:  { label: 'На одобрении',     color: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20' },
  approved:          { label: 'Одобрен',          color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' },
  rejected:          { label: 'Отклонён',         color: 'bg-red-500/15 text-red-300 border-red-500/20' },
  avito_pending:     { label: 'Avito: ожидание',  color: 'bg-blue-500/15 text-blue-300 border-blue-500/20' },
  avito_approved:    { label: 'Avito: одобрен',   color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/20' },
  published_avito:   { label: 'Опубликован',      color: 'bg-indigo-500/15 text-indigo-200 border-indigo-500/20' },
  in_feed:           { label: 'Опубликован',      color: 'bg-indigo-500/15 text-indigo-200 border-indigo-500/20' },
  archive_pending:   { label: 'Архив: ожидание',  color: 'bg-orange-500/15 text-orange-300 border-orange-500/20' },
  archived:          { label: 'Архив',            color: 'bg-zinc-600/15 text-zinc-400 border-zinc-600/20' },
  transfer_pending:  { label: 'Передача',         color: 'bg-violet-500/15 text-violet-300 border-violet-500/20' },
};

const VALUE_LABELS: Record<string, Record<string, string>> = {
  house_type: {
    panel: 'Панельный',
    brick: 'Кирпичный',
    monolith: 'Монолитный',
    'monolith-brick': 'Монолит-кирпич',
    block: 'Блочный',
    wood: 'Деревянный',
  },
  renovation: {
    without: 'Требуется',
    cosmetic: 'Косметический',
    euro: 'Евро',
    designer: 'Дизайнерский',
    requires: 'Требуется',
  },
  bathroom: {
    combined: 'Совмещённый',
    separate: 'Раздельный',
    in_house: 'В доме',
  },
  balcony: {
    balcony: 'Балкон',
    loggia: 'Лоджия',
    both: 'Балкон+лоджия',
    none: 'Нет',
  },
  parking: {
    underground: 'Подземная',
    ground: 'Наземная',
    yard_open: 'Во дворе',
    yard_barrier: 'Двор (шлагбаум)',
    guest: 'Гостевая',
  },
  elevator: {
    none: 'Нет',
    passenger: 'Пассажирский',
    freight: 'Грузовой',
    both: 'Пасс.+груз.',
  },
  view_from_window: {
    yard: 'Во двор',
    street: 'На улицу',
    sunny: 'Солнечная',
  },
  land_status: {
    izhs: 'ИЖС',
    snt: 'СНТ',
    dnp: 'ДНП',
    lpx: 'ЛПХ',
  },
  furniture: {
    full: 'Полная',
    partial: 'Частичная',
    none: 'Нет',
  },
  lease_term: {
    long: 'Длительный',
    short: 'Краткосрочный',
    any: 'Любой',
  },
  yes_no: {
    yes: 'Да',
    no: 'Нет',
  },
};

function mapValue(group: string, value: any): string {
  if (value === null || value === undefined || value === '') return '—';
  const raw = String(value);
  const mapped = VALUE_LABELS[group]?.[raw];
  return mapped || raw;
}

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatCompactMoney(value: number): string {
  if (!value || isNaN(value)) return '0';
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + ' МЛРД';
  if (value >= 1_000_000)     return (value / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' МЛН';
  if (value >= 1_000)         return (value / 1_000).toFixed(0) + ' К';
  return value.toString();
}

export default function Properties() {
  const queryClient = useQueryClient();
  const { user, accessLevel, isDirector, profile } = useAuth();
  const hasTeam = !!profile?.team_id;

  const [filters, setFilters] = useState<PropertyFilters>({ view: 'my' });
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<'cards' | 'list'>('cards');
  const [createOpen, setCreateOpen] = useState(false);
  const [editProperty, setEditProperty] = useState<Property | null>(null);
  const [viewProperty, setViewProperty] = useState<Property | null>(null);
  const [transferProperty, setTransferProperty] = useState<Property | null>(null);
  const [approveProperty, setApproveProperty] = useState<Property | null>(null);
  const [approveMode, setApproveMode] = useState<'approve' | 'reject'>('approve');

  const activeFilters = useMemo(() => ({
    ...filters,
    search: search || undefined,
  }), [filters, search]);

  const {
    properties, total, isLoading,
    createProperty, updateProperty, submitForApproval, approveProperty: approveAction,
    requestArchive, requestAvito, transferProperty: transferAction, deleteProperty
  } = useProperties(activeFilters);

  const { data: branchesRaw } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => { const { data } = await localAPI.request('/branches'); return Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []; },
    enabled: isDirector,
  });
  const branches = (branchesRaw as any[]) || [];

  const { data: clientsRaw } = useQuery({
    queryKey: ['properties-clients-lookup'],
    queryFn: async () => {
      const { data } = await localAPI.request('/clients?limit=500&page=1');
      if (Array.isArray((data as any)?.clients)) return (data as any).clients;
      return [];
    },
  });
  const clientsById = useMemo(() => {
    const map = new Map<string, string>();
    ((clientsRaw as any[]) || []).forEach((c: any) => map.set(c.id, c.full_name || c.phone || c.id));
    return map;
  }, [clientsRaw]);

  const canApproveAny = accessLevel >= 50;

  // ── Stats ──
  const stats = useMemo(() => {
    const totalValue = properties.reduce((s, p) => s + Number(p.price || 0), 0);
    const approved = properties.filter(p => ['approved', 'avito_approved', 'published_avito', 'in_feed'].includes(p.status)).length;
    const pending = properties.filter(p => ['pending_approval', 'avito_pending', 'archive_pending'].includes(p.status)).length;
    return { totalValue, approved, pending };
  }, [properties]);

  const activeFiltersCount = [
    filters.status && filters.status !== 'all',
    filters.category && filters.category !== 'all',
    filters.price_min,
    filters.price_max,
    filters.branch_id,
  ].filter(Boolean).length;

  return (
    <MainLayout>
      <div className="space-y-6 md:space-y-8 lg:space-y-10 animate-fade-in max-w-[1600px] mx-auto pb-16 md:pb-20 pt-4 md:pt-6 lg:pt-8 px-4 sm:px-8">

        {/* ── PREMIUM HEADER ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6 lg:gap-8">
          <div className="space-y-2 md:space-y-3">
            <div className="mb-2">
              <img src="/logo-panel.svg" alt="Logo" className="h-5 md:h-6 w-auto object-contain opacity-40" />
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white uppercase tracking-tighter leading-none">
              ОБЪЕКТЫ
            </h1>
            <p className="text-xs md:text-sm font-black text-white/20 uppercase tracking-[0.3em] flex items-center gap-2">
              <span className="w-8 md:w-10 h-px bg-white/10" />
              недвижимость · одобрение · публикация на Avito
            </p>
          </div>
        </div>

        {/* ── BENTO STATS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {[
            {
              label: 'Всего объектов', value: isLoading ? null : total.toString(),
              icon: Building2, glow: 'bg-primary/10', border: 'border-primary/10', iconCls: 'text-primary',
            },
            {
              label: 'Одобрено', value: isLoading ? null : stats.approved.toString(),
              icon: CheckCircle2, glow: 'bg-emerald-500/10', border: 'border-emerald-500/10', iconCls: 'text-emerald-400',
            },
            {
              label: 'В работе', value: isLoading ? null : stats.pending.toString(),
              icon: Layers, glow: 'bg-amber-500/10', border: 'border-amber-500/10', iconCls: 'text-amber-400',
            },
            {
              label: 'Общая стоимость', value: isLoading ? null : formatCompactMoney(stats.totalValue),
              icon: Coins, glow: 'bg-violet-500/10', border: 'border-violet-500/10', iconCls: 'text-violet-400',
            },
          ].map((card, idx) => {
            const Icon = card.icon;
            return (
              <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="relative overflow-hidden rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] bg-zinc-900/40 border border-white/5 p-5 md:p-6 lg:p-7 backdrop-blur-3xl group shadow-2xl">
                <div className={`absolute top-0 right-0 w-24 md:w-32 h-24 md:h-32 ${card.glow} blur-[60px] rounded-full pointer-events-none transition-all duration-1000`} />
                <div className="relative z-10 space-y-3 md:space-y-4">
                  <div className={`p-2.5 md:p-3 ${card.glow} rounded-xl md:rounded-2xl border ${card.border} w-fit`}>
                    <Icon className={`h-5 w-5 md:h-6 md:w-6 ${card.iconCls}`} />
                  </div>
                  <div>
                    {card.value === null ? (
                      <div className="h-8 md:h-10 w-24 bg-white/10 rounded-lg animate-pulse" />
                    ) : (
                      <h2 className="text-2xl md:text-3xl lg:text-4xl font-black text-white tracking-tighter tabular-nums">{card.value}</h2>
                    )}
                    <p className="text-[9px] md:text-[10px] font-black text-white/20 uppercase tracking-[0.15em] md:tracking-[0.2em] mt-1">{card.label}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ── VIEW TOGGLE (Мои / Команда) ── */}
        {hasTeam && (
          <div className="flex gap-2 p-1 bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-lg w-fit">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters(f => ({ ...f, view: 'my' }))}
              className={cn("gap-2 transition-all",
                filters.view === 'my' ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-white/60 hover:text-white hover:bg-white/5")}
            >
              <User className="h-4 w-4" /> Мои объекты
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters(f => ({ ...f, view: 'team' }))}
              className={cn("gap-2 transition-all",
                filters.view === 'team' ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-white/60 hover:text-white hover:bg-white/5")}
            >
              <Users className="h-4 w-4" /> Команда
            </Button>
          </div>
        )}

        {/* ── HEADER ACTIONS (Search + Filters + Create) ── */}
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 items-stretch md:items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3 flex-1 max-w-2xl">
            <div className="flex-1 relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-white/30" aria-hidden />
              <Input
                placeholder="Поиск по адресу, городу, сотруднику..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={cn(INPUT_WITH_LEADING_ICON, 'h-10 md:h-11 rounded-xl bg-zinc-900/60 border-white/5 text-sm')}
              />
            </div>

            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-10 md:h-11 px-4 md:px-6 gap-2 bg-zinc-900/60 border-white/10 text-white hover:bg-white/5 rounded-xl transition-all",
                    activeFiltersCount > 0 && "border-primary/50 bg-primary/5 text-primary"
                  )}
                >
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline font-bold uppercase tracking-widest text-[10px]">Фильтры</span>
                  {activeFiltersCount > 0 && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white ml-1">
                      {activeFiltersCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={8}
                className="w-[min(92vw,420px)] p-0 bg-zinc-950 border-white/10 rounded-2xl shadow-2xl"
              >
                <div className="p-5 border-b border-white/5 flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-xl border border-primary/10">
                    <Filter className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-white font-black uppercase tracking-widest text-sm">Фильтры</p>
                </div>

                <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                  <div>
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Статус</label>
                    <Select value={filters.status || 'all'} onValueChange={v => setFilters(f => ({ ...f, status: v === 'all' ? undefined : v }))}>
                      <SelectTrigger className="h-10 rounded-xl bg-zinc-900/60 border-white/5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все статусы</SelectItem>
                        {Object.entries(STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Категория</label>
                    <Select value={filters.category || 'all'} onValueChange={v => setFilters(f => ({ ...f, category: v === 'all' ? undefined : v }))}>
                      <SelectTrigger className="h-10 rounded-xl bg-zinc-900/60 border-white/5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все категории</SelectItem>
                        {Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {isDirector && (
                    <div>
                      <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Филиал</label>
                      <Select value={filters.branch_id || 'all'} onValueChange={v => setFilters(f => ({ ...f, branch_id: v === 'all' ? undefined : v }))}>
                        <SelectTrigger className="h-10 rounded-xl bg-zinc-900/60 border-white/5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Все филиалы</SelectItem>
                          {branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Цена от, ₽</label>
                      <Input type="number" placeholder="0" value={filters.price_min || ''} onChange={e => setFilters(f => ({ ...f, price_min: e.target.value || undefined }))} className="h-10 rounded-xl bg-zinc-900/60 border-white/5" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Цена до, ₽</label>
                      <Input type="number" placeholder="∞" value={filters.price_max || ''} onChange={e => setFilters(f => ({ ...f, price_max: e.target.value || undefined }))} className="h-10 rounded-xl bg-zinc-900/60 border-white/5" />
                    </div>
                  </div>
                </div>

                {activeFiltersCount > 0 && (
                  <div className="border-t border-white/5 p-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl border-white/10 text-white/60 hover:text-white text-[10px] font-black uppercase tracking-widest"
                      onClick={() => setFilters({ view: filters.view })}
                    >
                      Сбросить фильтры
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-900/60 border border-white/10">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDisplayMode('cards')}
                className={cn(
                  "h-8 px-2.5 rounded-lg transition-all",
                  displayMode === 'cards'
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDisplayMode('list')}
                className={cn(
                  "h-8 px-2.5 rounded-lg transition-all",
                  displayMode === 'list'
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                )}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button
            onClick={() => setCreateOpen(true)}
            className="h-10 md:h-11 px-6 bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95 group"
          >
            <Plus className="h-4 w-4 mr-2 group-hover:rotate-90 transition-transform" />
            Добавить объект
          </Button>
        </div>

        {/* ── PROPERTY GRID ── */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="rounded-xl md:rounded-2xl bg-zinc-900/40 border border-white/5 overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-white/5" />
                <div className="p-4 space-y-2">
                  <div className="h-5 w-1/2 bg-white/10 rounded" />
                  <div className="h-3 w-3/4 bg-white/5 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : properties.length === 0 ? (
          <div className="rounded-xl md:rounded-[1.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 p-12 md:p-16 text-center">
            <div className="inline-flex p-4 rounded-2xl bg-primary/10 border border-primary/10 mb-4">
              <Building2 className="h-8 w-8 text-primary/60" />
            </div>
            <p className="text-sm font-black text-white/40 uppercase tracking-widest mb-2">Нет объектов</p>
            <p className="text-xs text-white/30">
              {search || activeFiltersCount > 0
                ? 'Попробуйте изменить параметры поиска'
                : 'Нажмите «Добавить объект» чтобы создать первый'}
            </p>
          </div>
        ) : displayMode === 'cards' ? (
          <AnimatePresence mode="popLayout">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
              {properties.map((prop, i) => {
                const cat = CATEGORIES[(prop.category || '').trim()] || CATEGORIES.secondary;
                const st = STATUSES[prop.status || ''] || STATUSES.draft;
                const CatIcon = cat.icon;
                const isOwner = prop.owner_id === user?.id;
                const sameTeam = !!profile?.team_id && profile?.team_id === (prop as any).team_id;
                const sameBranch = !!profile?.branch_id && profile?.branch_id === prop.branch_id;
                const canEditProp =
                  isOwner ||
                  accessLevel >= 100 ||
                  (accessLevel >= 90 && sameBranch) ||
                  (accessLevel >= 50 && sameTeam);
                const isPending = ['pending_approval', 'avito_pending', 'archive_pending'].includes(prop.status);
                const canApproveThis = canApproveAny && isPending;
                const cover = (prop as any).cover_url || (prop as any).first_photo_url;
                const publicationBadge =
                  prop.status === 'published_avito' || prop.status === 'in_feed' || (prop as any).avito_feed_enabled
                    ? { label: 'Опубликован', color: 'bg-indigo-500/15 text-indigo-200 border-indigo-500/20' }
                    : prop.status === 'avito_approved'
                      ? { label: 'Одобрен Avito', color: 'bg-blue-500/15 text-blue-200 border-blue-500/20' }
                      : prop.status === 'avito_pending'
                        ? { label: 'Ожидает Avito', color: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/20' }
                        : { label: 'Не опубликован', color: 'bg-zinc-500/15 text-zinc-200 border-zinc-500/20' };
                const showPublicationBadge = !['published_avito', 'in_feed'].includes(prop.status);

                return (
                  <motion.div
                    key={prop.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  >
                    <div
                      className="group relative rounded-xl md:rounded-2xl bg-zinc-900/40 backdrop-blur-3xl border border-white/5 hover:border-white/15 overflow-hidden cursor-pointer transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5"
                      onClick={() => setViewProperty(prop)}
                    >
                      {/* Cover */}
                      <div className="relative aspect-[4/3] bg-gradient-to-br from-zinc-800 to-zinc-900 overflow-hidden">
                        {cover ? (
                          <img src={cover} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <CatIcon className={cn("h-16 w-16 opacity-20", cat.color)} />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />

                        <div className="absolute top-3 right-3 z-20">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="p-1.5 rounded-lg bg-black/50 backdrop-blur-md text-white/70 hover:text-white hover:bg-black/70 transition-all opacity-0 group-hover:opacity-100"
                                onClick={e => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setViewProperty(prop); }}>
                                <Eye className="h-4 w-4 mr-2" /> Просмотр
                              </DropdownMenuItem>
                              {canEditProp && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditProperty(prop); }}>
                                  <Pencil className="h-4 w-4 mr-2" /> Редактировать
                                </DropdownMenuItem>
                              )}
                              {isOwner && ['draft', 'rejected'].includes(prop.status) && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); submitForApproval.mutate(prop.id); }}>
                                  <Send className="h-4 w-4 mr-2" /> На одобрение
                                </DropdownMenuItem>
                              )}
                              {canApproveThis && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setApproveProperty(prop); }}>
                                  <Check className="h-4 w-4 mr-2" /> Одобрить/Отклонить
                                </DropdownMenuItem>
                              )}
                              {isOwner && prop.status === 'approved' && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); requestAvito.mutate(prop.id); }}>
                                  <Globe className="h-4 w-4 mr-2" /> Опубликовать
                                </DropdownMenuItem>
                              )}
                              {isOwner && !['archived', 'archive_pending', 'transfer_pending'].includes(prop.status) && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setTransferProperty(prop); }}>
                                  <ArrowRightLeft className="h-4 w-4 mr-2" /> Передать
                                </DropdownMenuItem>
                              )}
                              {isOwner && !['archived', 'archive_pending'].includes(prop.status) && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); requestArchive.mutate(prop.id); }} className="text-orange-400">
                                  <Archive className="h-4 w-4 mr-2" /> В архив
                                </DropdownMenuItem>
                              )}
                              {accessLevel >= 100 && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); deleteProperty.mutate(prop.id); }} className="text-red-400">
                                  <Trash2 className="h-4 w-4 mr-2" /> Удалить
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Bottom badges */}
                        <div className="absolute bottom-3 left-3 right-14 z-10 flex flex-wrap items-center gap-1.5">
                          <div className={cn("flex items-center gap-1 px-2 py-1 rounded-lg backdrop-blur-md border text-[10px] font-bold uppercase tracking-wider", cat.ring, cat.color)}>
                            <CatIcon className="h-3 w-3" />
                            {cat.label}
                          </div>
                          <div className={cn("px-2 py-1 rounded-lg backdrop-blur-md border text-[10px] font-bold uppercase tracking-wider", st.color)}>
                            {st.label}
                          </div>
                          {showPublicationBadge && (
                            <div className={cn("px-2 py-1 rounded-lg backdrop-blur-md border text-[10px] font-bold uppercase tracking-wider", publicationBadge.color)}>
                              {publicationBadge.label}
                            </div>
                          )}
                        </div>

                        {/* Photo count */}
                        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[10px] text-white/70">
                          <ImageIcon className="h-3 w-3" />
                          <span className="font-bold">{prop.photo_count || 0}</span>
                        </div>

                        {/* Transfer pending overlay */}
                        {prop.transfer_status === 'pending' && (
                          <div className="absolute bottom-12 left-3 z-20 px-2 py-1 rounded-lg bg-violet-500/30 backdrop-blur-md border border-violet-400/30 text-[10px] font-bold text-violet-100 flex items-center gap-1">
                            <ArrowRightLeft className="h-3 w-3" /> {prop.transfer_to_name}
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-4 space-y-2.5">
                        <div className="flex items-baseline gap-1">
                          <p className="text-xl md:text-2xl font-black text-white tracking-tighter tabular-nums">
                            {Number(prop.price).toLocaleString('ru-RU')}
                          </p>
                          <span className="text-sm font-bold text-white/30">₽</span>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-white/60 min-w-0">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-white/30" />
                          <span className="truncate">{prop.address || prop.city || 'Адрес не указан'}</span>
                        </div>

                        {(prop.rooms || prop.area_total || prop.floor) && (
                          <div className="flex flex-wrap gap-2 text-[10px] font-bold text-white/40 uppercase tracking-wider">
                            {prop.rooms != null && (
                              <span>
                                {prop.rooms === 'Студия' ? 'Студия' :
                                 prop.rooms === 'Своб. планировка' ? 'Своб. планировка' :
                                 prop.rooms === '10 и более' ? '10+ комн.' :
                                 /^\d+$/.test(String(prop.rooms)) ? `${prop.rooms}-комн.` :
                                 prop.rooms}
                              </span>
                            )}
                            {prop.area_total != null && <span>· {prop.area_total} м²</span>}
                            {prop.floor != null && <span>· {prop.floor}/{prop.floors_total || '?'} эт.</span>}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-white/5">
                          <span className="text-[10px] text-white/40 truncate">{prop.owner_name || '—'}</span>
                          {prop.branch_name && (
                            <span className="text-[10px] text-white/30 font-bold uppercase tracking-wider truncate ml-2">{prop.branch_name}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </AnimatePresence>
        ) : (
          <div className="rounded-xl md:rounded-2xl bg-zinc-900/40 backdrop-blur-3xl border border-white/5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[3200px] w-full">
                <thead className="bg-black/20 border-b border-white/5">
                  <tr className="text-left text-[10px] font-black text-white/35 uppercase tracking-widest">
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Создан</th>
                    <th className="px-4 py-3">Обновлён</th>
                    <th className="px-4 py-3">Публ. статус</th>
                    <th className="px-4 py-3">Источник</th>
                    <th className="px-4 py-3">Объект</th>
                    <th className="px-4 py-3">Статус</th>
                    <th className="px-4 py-3">Цена</th>
                    <th className="px-4 py-3">Цена за м²</th>
                    <th className="px-4 py-3">Комиссия/договор</th>
                    <th className="px-4 py-3">Город</th>
                    <th className="px-4 py-3">Адрес</th>
                    <th className="px-4 py-3">Координаты</th>
                    <th className="px-4 py-3">Метро/район</th>
                    <th className="px-4 py-3">Комн.</th>
                    <th className="px-4 py-3">Площадь общ.</th>
                    <th className="px-4 py-3">Площадь жил.</th>
                    <th className="px-4 py-3">Площадь кух.</th>
                    <th className="px-4 py-3">Этаж</th>
                    <th className="px-4 py-3">Дом</th>
                    <th className="px-4 py-3">Год постройки</th>
                    <th className="px-4 py-3">Ремонт</th>
                    <th className="px-4 py-3">Санузел</th>
                    <th className="px-4 py-3">Балкон</th>
                    <th className="px-4 py-3">Лифт</th>
                    <th className="px-4 py-3">Вид из окна</th>
                    <th className="px-4 py-3">Паркинг</th>
                    <th className="px-4 py-3">Площадь участка</th>
                    <th className="px-4 py-3">Статус земли</th>
                    <th className="px-4 py-3">Тип коммерции</th>
                    <th className="px-4 py-3">Мебель</th>
                    <th className="px-4 py-3">Техника</th>
                    <th className="px-4 py-3">Интернет</th>
                    <th className="px-4 py-3">Депозит</th>
                    <th className="px-4 py-3">Срок аренды</th>
                    <th className="px-4 py-3">Требования</th>
                    <th className="px-4 py-3">С детьми/жив.</th>
                    <th className="px-4 py-3">Ответственный</th>
                    <th className="px-4 py-3">Филиал</th>
                    <th className="px-4 py-3">Команда</th>
                    <th className="px-4 py-3">Клиент</th>
                    <th className="px-4 py-3">Фото</th>
                    <th className="px-4 py-3">Перенос/архив</th>
                    <th className="px-4 py-3 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {properties.map((prop) => {
                    const cat = CATEGORIES[(prop.category || '').trim()] || CATEGORIES.secondary;
                    const st = STATUSES[prop.status || ''] || STATUSES.draft;
                    const CatIcon = cat.icon;
                    const isOwner = prop.owner_id === user?.id;
                    const sameTeam = !!profile?.team_id && profile?.team_id === (prop as any).team_id;
                    const sameBranch = !!profile?.branch_id && profile?.branch_id === prop.branch_id;
                    const canEditProp =
                      isOwner ||
                      accessLevel >= 100 ||
                      (accessLevel >= 90 && sameBranch) ||
                      (accessLevel >= 50 && sameTeam);
                    const isPending = ['pending_approval', 'avito_pending', 'archive_pending'].includes(prop.status);
                    const canApproveThis = canApproveAny && isPending;
                    const cover = (prop as any).cover_url || (prop as any).first_photo_url;
                    const areaTotal = Number(prop.area_total || 0);
                    const priceSqm = areaTotal > 0 ? Math.round(Number(prop.price || 0) / areaTotal) : null;
                    const publicationStatus =
                      prop.status === 'published_avito' || prop.status === 'in_feed' || (prop as any).avito_feed_enabled
                        ? 'Опубликован'
                        : prop.status === 'avito_approved'
                          ? 'Одобрен Avito'
                          : prop.status === 'avito_pending'
                            ? 'Ожидает Avito'
                            : 'Не опубликован';
                    const source = (prop as any).source || 'CRM';
                    const metroDistrict = (prop as any).transport_accessibility || (prop as any).infrastructure || '—';
                    const clientName = clientsById.get((prop as any).client_id) || (prop as any).client_id || '—';
                    const tech = [
                      (prop as any).appliances,
                      (prop as any).conditioner,
                      (prop as any).washing_machine,
                      (prop as any).dishwasher,
                      (prop as any).fridge,
                      (prop as any).tv,
                    ].filter(Boolean).length > 0 ? 'Есть' : '—';
                    const childrenPets = `${mapValue('yes_no', (prop as any).children_allowed)} / ${mapValue('yes_no', (prop as any).pets_allowed)}`;
                    const transferArchive = prop.transfer_status === 'pending'
                      ? `Передача: ${prop.transfer_to_name || 'ожидание'}`
                      : ['archived', 'archive_pending'].includes(prop.status)
                        ? (prop.status === 'archived' ? 'В архиве' : 'Архив: ожидание')
                        : '—';

                    return (
                      <tr
                        key={prop.id}
                        className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                        onClick={() => setViewProperty(prop)}
                      >
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{prop.id.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-white/65 whitespace-nowrap">{fmtDate(prop.created_at)}</td>
                        <td className="px-4 py-3 text-white/65 whitespace-nowrap">{fmtDate(prop.updated_at)}</td>
                        <td className="px-4 py-3 text-white/80 whitespace-nowrap">{publicationStatus}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{source}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 min-w-[280px]">
                            <div className="w-14 h-14 rounded-lg overflow-hidden bg-zinc-800 border border-white/10 shrink-0">
                              {cover ? (
                                <img src={cover} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <CatIcon className={cn("h-6 w-6 opacity-40", cat.color)} />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider mb-1", cat.ring, cat.color)}>
                                <CatIcon className="h-3 w-3" />
                                {cat.label}
                              </div>
                              <p className="text-sm text-white/85 truncate max-w-[320px]">{prop.address || 'Адрес не указан'}</p>
                              <p className="text-[10px] text-white/35">Фото: {prop.photo_count || 0}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap", st.color)}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white font-black tabular-nums whitespace-nowrap">
                          {Number(prop.price || 0).toLocaleString('ru-RU')} ₽
                        </td>
                        <td className="px-4 py-3 text-white/70 tabular-nums whitespace-nowrap">
                          {priceSqm ? `${priceSqm.toLocaleString('ru-RU')} ₽/м²` : '—'}
                        </td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{(prop as any).deal_type || '—'}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{prop.city || '—'}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap max-w-[260px] truncate">{prop.address || '—'}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{prop.lat && prop.lng ? `${prop.lat}, ${prop.lng}` : '—'}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap max-w-[220px] truncate">{metroDistrict}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{prop.rooms ?? '—'}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{prop.area_total != null ? `${prop.area_total} м²` : '—'}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{prop.area_living != null ? `${prop.area_living} м²` : '—'}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{prop.area_kitchen != null ? `${prop.area_kitchen} м²` : '—'}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{prop.floor != null ? `${prop.floor}/${prop.floors_total || '?'}` : '—'}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{mapValue('house_type', prop.house_type)}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{(prop.year_built || (prop as any).built_year) ?? '—'}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{mapValue('renovation', prop.renovation)}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{mapValue('bathroom', prop.bathroom)}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{mapValue('balcony', prop.balcony)}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{mapValue('elevator', prop.elevator)}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{mapValue('view_from_window', prop.view_from_window)}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{mapValue('parking', prop.parking)}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{prop.land_area != null ? `${prop.land_area}` : '—'}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{mapValue('land_status', prop.land_status)}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{(prop.commercial_type as any) || '—'}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{mapValue('furniture', (prop as any).furniture)}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{tech}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{mapValue('yes_no', (prop as any).internet)}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{(prop as any).deposit_amount || '—'}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{mapValue('lease_term', (prop as any).lease_term)}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap max-w-[260px] truncate">{(prop as any).tenant_requirements || '—'}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{childrenPets}</td>
                        <td className="px-4 py-3 text-white/80 whitespace-nowrap">{prop.owner_name || '—'}</td>
                        <td className="px-4 py-3 text-white/60 whitespace-nowrap">{prop.branch_name || '—'}</td>
                        <td className="px-4 py-3 text-white/60 whitespace-nowrap">{prop.team_name || '—'}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{clientName}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{prop.photo_count ?? 0}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap max-w-[220px] truncate">{transferArchive}</td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="p-1.5 rounded-lg bg-black/40 backdrop-blur-md text-white/70 hover:text-white hover:bg-black/70 transition-all"
                                onClick={e => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-xl">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setViewProperty(prop); }}>
                                <Eye className="h-4 w-4 mr-2" /> Просмотр
                              </DropdownMenuItem>
                              {canEditProp && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditProperty(prop); }}>
                                  <Pencil className="h-4 w-4 mr-2" /> Редактировать
                                </DropdownMenuItem>
                              )}
                              {isOwner && ['draft', 'rejected'].includes(prop.status) && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); submitForApproval.mutate(prop.id); }}>
                                  <Send className="h-4 w-4 mr-2" /> На одобрение
                                </DropdownMenuItem>
                              )}
                              {canApproveThis && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setApproveProperty(prop); }}>
                                  <Check className="h-4 w-4 mr-2" /> Одобрить/Отклонить
                                </DropdownMenuItem>
                              )}
                              {isOwner && prop.status === 'approved' && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); requestAvito.mutate(prop.id); }}>
                                  <Globe className="h-4 w-4 mr-2" /> Опубликовать
                                </DropdownMenuItem>
                              )}
                              {isOwner && !['archived', 'archive_pending', 'transfer_pending'].includes(prop.status) && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setTransferProperty(prop); }}>
                                  <ArrowRightLeft className="h-4 w-4 mr-2" /> Передать
                                </DropdownMenuItem>
                              )}
                              {isOwner && !['archived', 'archive_pending'].includes(prop.status) && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); requestArchive.mutate(prop.id); }} className="text-orange-400">
                                  <Archive className="h-4 w-4 mr-2" /> В архив
                                </DropdownMenuItem>
                              )}
                              {accessLevel >= 100 && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); deleteProperty.mutate(prop.id); }} className="text-red-400">
                                  <Trash2 className="h-4 w-4 mr-2" /> Удалить
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── DIALOGS ── */}
      <PropertyFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={async (data, photos, newClient) => {
          console.log('[Properties] onSubmit called, newClient:', newClient);
          // If new client data provided, create client first
          if (newClient && newClient.full_name) {
            console.log('[Properties] Creating client:', newClient);
            const { data: clientRes, error: clientErr } = await localAPI.request('/clients', { method: 'POST', body: { full_name: newClient.full_name, phone: newClient.phone, birthday: newClient.birthday, comment: newClient.comment } });
            console.log('[Properties] Client creation result:', { clientRes, clientErr });
            if (clientErr) {
              console.error('Failed to create client:', clientErr);
            } else if ((clientRes as any)?.id) {
              data.client_id = (clientRes as any).id;
              console.log('[Properties] Set client_id on property:', data.client_id);
            }
          }
          const result = await createProperty.mutateAsync(data) as any;
          // Upload all photos in a single multipart request — backend compresses each to ≤1 MB
          if (photos && photos.length > 0 && result?.id) {
            const formData = new FormData();
            for (const photo of photos) {
              formData.append('photos', photo);
            }
            await localAPI.upload(`/properties/${result.id}/photos`, formData);
          }
          // Invalidate detail cache so photos appear immediately when opening the dialog
          if (result?.id) {
            queryClient.invalidateQueries({ queryKey: ['property-detail', result.id] });
            queryClient.invalidateQueries({ queryKey: ['properties'] });
          }
          setCreateOpen(false);
          if (result?.id) {
            setViewProperty({ id: result.id } as Property);
          }
        }}
        isPending={createProperty.isPending}
      />

      {editProperty && (
        <PropertyFormDialog
          open={!!editProperty}
          onOpenChange={(open) => { if (!open) setEditProperty(null); }}
          initialData={editProperty}
          onSubmit={async (data, photos) => {
            await updateProperty.mutateAsync({ ...data, id: editProperty.id });
            if (photos && photos.length > 0) {
              const formData = new FormData();
              for (const photo of photos) {
                formData.append('photos', photo);
              }
              await localAPI.upload(`/properties/${editProperty.id}/photos`, formData);
              queryClient.invalidateQueries({ queryKey: ['property-detail', editProperty.id] });
              queryClient.invalidateQueries({ queryKey: ['properties'] });
            }
            setEditProperty(null);
          }}
          isPending={updateProperty.isPending}
        />
      )}

      {viewProperty && (
        <PropertyDetailDialog
          open={!!viewProperty}
          onOpenChange={(open) => { if (!open) setViewProperty(null); }}
          propertyId={viewProperty.id}
          onEdit={(p) => { setViewProperty(null); setEditProperty(p); }}
          onApprove={(p) => { setViewProperty(null); setApproveMode('approve'); setApproveProperty(p); }}
          onReject={(p) => { setViewProperty(null); setApproveMode('reject'); setApproveProperty(p); }}
          onTransfer={(p) => { setViewProperty(null); setTransferProperty(p); }}
        />
      )}

      {transferProperty && (
        <PropertyTransferDialog
          open={!!transferProperty}
          onOpenChange={(open) => { if (!open) setTransferProperty(null); }}
          property={transferProperty}
          onTransfer={(toUserId) => transferAction.mutateAsync({ id: transferProperty.id, to_user_id: toUserId }).then(() => setTransferProperty(null))}
          isPending={transferAction.isPending}
        />
      )}

      {approveProperty && (
        <PropertyApproveDialog
          open={!!approveProperty}
          onOpenChange={(open) => { if (!open) setApproveProperty(null); }}
          property={approveProperty}
          mode={approveMode}
          onAction={(action, reason) => approveAction.mutateAsync({ id: approveProperty.id, action, reason }).then(() => setApproveProperty(null))}
          isPending={approveAction.isPending}
        />
      )}
    </MainLayout>
  );
}
