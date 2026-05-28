import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLeads, useCreateLead, useUpdateLead, useDeleteLead, useAddLeadTouch, useDeleteLeadTouch, useLead, Lead, LeadCreate, LEAD_STATUSES, MORTGAGE_TYPES } from '@/hooks/useLeads';
import { useSharedData, useEmployeesData } from '@/hooks/useSharedData';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { INPUT_WITH_LEADING_ICON } from '@/lib/inputClassNames';
import { formatPhoneRu } from '@/lib/phone-utils';
import {
  Users, Search, Plus, Filter, Phone, Calendar, MoreVertical, Pencil, Trash2, Eye,
  User, Layers, Coins, Building2, Home, MessageSquare, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger
} from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { MainLayout } from '@/components/layout/MainLayout';

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ru-RU');
}

export default function Leads() {
  const { accessLevel, user } = useAuth();

  const [category, setCategory] = useState<'newbuilding' | 'secondary'>('newbuilding');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  const [leadsScope, setLeadsScope] = useState<'personal' | 'branch'>(() => (accessLevel >= 90 ? 'branch' : 'personal'));

  const { branches, teams } = useSharedData();
  const { data: employees = [] } = useEmployeesData();

  const { data, isLoading } = useLeads({
    category,
    search,
    status: statusFilter,
    branch_id: branchFilter,
    team_id: teamFilter,
    created_by: employeeFilter,
    scope: leadsScope,
    page,
  });
  const createMutation = useCreateLead();
  const updateMutation = useUpdateLead();
  const deleteMutation = useDeleteLead();

  const leads = data?.leads || [];
  const total = data?.total || 0;

  const handleCreate = async (data: LeadCreate) => {
    await createMutation.mutateAsync(data);
    setFormOpen(false);
  };

  const handleUpdate = async (data: LeadCreate & { id: string }) => {
    await updateMutation.mutateAsync(data);
    setEditLead(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Удалить лид?')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const stats = useMemo(() => {
    const inWork = leads.filter(l => l.status === 'in_progress').length;
    const deals = leads.filter(l => l.status === 'deal').length;
    return { inWork, deals };
  }, [leads]);

  const activeFiltersCount = [
    statusFilter !== 'all',
    branchFilter !== 'all',
    teamFilter !== 'all',
    employeeFilter !== 'all',
  ].filter(Boolean).length;
  const isDirector = accessLevel >= 100;

  const filteredTeams = branchFilter !== 'all'
    ? (teams || []).filter((t: any) => t.branch_id === branchFilter)
    : (teams || []);

  const filteredEmployees = useMemo(() => {
    let list = employees as any[];
    if (branchFilter !== 'all') list = list.filter((e: any) => e.branch_id === branchFilter);
    if (teamFilter !== 'all') list = list.filter((e: any) => e.team_id === teamFilter);
    return list;
  }, [employees, branchFilter, teamFilter]);

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
              ЛИДЫ
            </h1>
            <p className="text-xs md:text-sm font-black text-white/20 uppercase tracking-[0.3em] flex items-center gap-2">
              <span className="w-8 md:w-10 h-px bg-white/10" />
              новостройки · вторичка · воронка продаж
            </p>
          </div>
        </div>

        {/* ── CATEGORY TABS ── */}
        <div className="flex gap-3">
          <button
            onClick={() => { setCategory('newbuilding'); setPage(1); }}
            className={cn(
              "flex items-center gap-2.5 px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all border",
              category === 'newbuilding'
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300 shadow-lg shadow-emerald-500/5"
                : "bg-zinc-900/40 border-white/5 text-white/40 hover:text-white/70 hover:border-white/10"
            )}
          >
            <Building2 className="w-4 h-4" />
            Новостройки
          </button>
          <button
            onClick={() => { setCategory('secondary'); setPage(1); }}
            className={cn(
              "flex items-center gap-2.5 px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all border",
              category === 'secondary'
                ? "bg-amber-500/10 border-amber-500/20 text-amber-300 shadow-lg shadow-amber-500/5"
                : "bg-zinc-900/40 border-white/5 text-white/40 hover:text-white/70 hover:border-white/10"
            )}
          >
            <Home className="w-4 h-4" />
            Вторичка
          </button>
        </div>

        <div className="flex gap-2 p-1 bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-xl w-fit">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setLeadsScope('personal');
              setPage(1);
              setEmployeeFilter('all');
            }}
            className={cn(
              'gap-2 rounded-lg transition-all h-9 md:h-10 px-3 md:px-4 text-[10px] font-black uppercase tracking-widest',
              leadsScope === 'personal'
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'text-white/60 hover:text-white hover:bg-white/5',
            )}
          >
            <User className="h-4 w-4 shrink-0" />
            Мои лиды
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setLeadsScope('branch');
              setPage(1);
            }}
            className={cn(
              'gap-2 rounded-lg transition-all h-9 md:h-10 px-3 md:px-4 text-[10px] font-black uppercase tracking-widest',
              leadsScope === 'branch'
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'text-white/60 hover:text-white hover:bg-white/5',
            )}
          >
            <Users className="h-4 w-4 shrink-0" />
            Лиды филиала
          </Button>
        </div>

        {/* ── BENTO STATS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {[
            { label: 'Всего лидов', value: isLoading ? null : total.toString(), icon: Users, glow: 'bg-violet-500/10', border: 'border-violet-500/10', iconCls: 'text-violet-400' },
            { label: 'В работе', value: isLoading ? null : stats.inWork.toString(), icon: Layers, glow: 'bg-amber-500/10', border: 'border-amber-500/10', iconCls: 'text-amber-400' },
            { label: 'Со сделками', value: isLoading ? null : stats.deals.toString(), icon: Coins, glow: 'bg-emerald-500/10', border: 'border-emerald-500/10', iconCls: 'text-emerald-400' },
            { label: 'Новых сегодня', value: isLoading ? null : leads.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length.toString(), icon: User, glow: 'bg-blue-500/10', border: 'border-blue-500/10', iconCls: 'text-blue-400' },
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

        {/* ── HEADER ACTIONS ── */}
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 items-stretch md:items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3 flex-1 max-w-2xl">
            <div className="flex-1 relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-white/30" aria-hidden />
              <Input
                placeholder="Поиск по имени или телефону..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
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
              <PopoverContent align="end" sideOffset={8} className="w-[min(92vw,420px)] p-0 bg-zinc-950 border-white/10 rounded-2xl shadow-2xl">
                <div className="p-5 border-b border-white/5 flex items-center gap-3">
                  <div className="p-2 bg-violet-500/10 rounded-xl border border-violet-500/10">
                    <Filter className="h-4 w-4 text-violet-400" />
                  </div>
                  <p className="text-white font-black uppercase tracking-widest text-sm">Фильтры</p>
                </div>
                <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                  {isDirector && (
                    <div>
                      <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Филиал</label>
                      <Select value={branchFilter} onValueChange={v => { setBranchFilter(v); setTeamFilter('all'); setEmployeeFilter('all'); setPage(1); }}>
                        <SelectTrigger className="h-10 rounded-xl bg-zinc-900/60 border-white/5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Все филиалы</SelectItem>
                          {(branches || []).map((b: any) => (
                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Команда</label>
                    <Select value={teamFilter} onValueChange={v => { setTeamFilter(v); setEmployeeFilter('all'); setPage(1); }}>
                      <SelectTrigger className="h-10 rounded-xl bg-zinc-900/60 border-white/5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все команды</SelectItem>
                        {filteredTeams.map((t: any) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Кто создал</label>
                    <Select
                      value={employeeFilter}
                      disabled={leadsScope === 'personal'}
                      onValueChange={v => { setEmployeeFilter(v); setPage(1); }}
                    >
                      <SelectTrigger className="h-10 rounded-xl bg-zinc-900/60 border-white/5 disabled:opacity-50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все сотрудники</SelectItem>
                        {filteredEmployees.map((e: any) => (
                          <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {leadsScope === 'personal' && (
                      <p className="text-[9px] text-white/25 mt-1.5 font-medium">Для «Мои лиды» показаны только ваши записи</p>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Статус</label>
                    <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                      <SelectTrigger className="h-10 rounded-xl bg-zinc-900/60 border-white/5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все статусы</SelectItem>
                        {Object.entries(LEAD_STATUSES).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {activeFiltersCount > 0 && (
                  <div className="border-t border-white/5 p-4">
                    <Button variant="outline" size="sm" className="w-full rounded-xl border-white/10 text-white/60 hover:text-white text-[10px] font-black uppercase tracking-widest" onClick={() => { setStatusFilter('all'); setBranchFilter('all'); setTeamFilter('all'); setEmployeeFilter('all'); }}>
                      Сбросить фильтры
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          <Button
            onClick={() => setFormOpen(true)}
            className="h-10 md:h-11 px-6 bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95 group"
          >
            <Plus className="h-4 w-4 mr-2 group-hover:rotate-90 transition-transform" />
            Добавить лид
          </Button>
        </div>

        {/* ── LEAD LIST ── */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Users className="w-14 h-14 text-white/10 mb-4" />
            <p className="text-sm font-black text-white/30 uppercase tracking-widest">Нет лидов</p>
            <p className="text-xs text-white/15 mt-1">Нажмите «Добавить лид» чтобы создать первый</p>
          </div>
        ) : (
          <div className="grid gap-3">
            <AnimatePresence mode="popLayout">
              {leads.map((lead, idx) => {
                const st = LEAD_STATUSES[lead.status] || { label: lead.status, color: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/20' };
                return (
                  <motion.div
                    key={lead.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: idx * 0.03 }}
                    className="relative overflow-hidden rounded-xl md:rounded-2xl bg-zinc-900/40 border border-white/5 p-4 md:p-5 backdrop-blur-3xl group hover:border-violet-500/20 transition-all shadow-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={cn(
                          "w-11 h-11 md:w-12 md:h-12 rounded-xl md:rounded-2xl border flex items-center justify-center shrink-0",
                          category === 'newbuilding' ? "bg-emerald-500/10 border-emerald-500/10" : "bg-amber-500/10 border-amber-500/10"
                        )}>
                          <span className={cn("text-base md:text-lg font-black", category === 'newbuilding' ? "text-emerald-400" : "text-amber-400")}>
                            {lead.full_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm md:text-base font-black text-white truncate tracking-tight">{lead.full_name}</p>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {lead.phone && (
                              <span className="flex items-center gap-1.5 text-[10px] md:text-[11px] font-bold text-white/30 uppercase tracking-widest">
                                <Phone className="w-3 h-3 text-white/20" />
                                {lead.phone}
                              </span>
                            )}
                            {lead.mortgage && (
                              <span className="text-[9px] font-black uppercase tracking-widest text-cyan-400/60 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/10">
                                Ипотека{lead.mortgage_type ? `: ${MORTGAGE_TYPES[lead.mortgage_type] || lead.mortgage_type}` : ''}
                                {lead.mortgage_approved && ' ✓'}
                              </span>
                            )}
                            {lead.residential_complex && (
                              <span className="text-[10px] font-bold text-white/25">
                                {category === 'secondary' ? 'Адрес:' : 'ЖК:'} {lead.residential_complex}
                              </span>
                            )}
                            {lead.created_by_name && (
                              <span className="text-[10px] font-bold text-white/25 truncate max-w-[140px]" title={lead.created_by_name}>
                                · {lead.created_by === user?.id ? 'Вы' : lead.created_by_name}
                              </span>
                            )}
                            {(lead.touches_count || 0) > 0 && (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-white/25">
                                <MessageSquare className="w-3 h-3" />{lead.touches_count}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={cn('text-[9px] font-black uppercase tracking-wider border px-2.5 py-1 rounded-lg', st.color)}>
                          {st.label}
                        </Badge>
                        <span className="text-[10px] font-bold text-white/15 uppercase tracking-widest hidden sm:block">
                          {formatDate(lead.created_at)}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-white/40 hover:text-white">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-zinc-950 border-white/10 rounded-xl">
                            <DropdownMenuItem onClick={() => setDetailLeadId(lead.id)} className="gap-2 text-xs font-bold uppercase tracking-widest">
                              <Eye className="w-3.5 h-3.5" />Просмотр
                            </DropdownMenuItem>
                            {isDirector && (
                              <DropdownMenuItem onClick={() => setEditLead(lead)} className="gap-2 text-xs font-bold uppercase tracking-widest">
                                <Pencil className="w-3.5 h-3.5" />Редактировать
                              </DropdownMenuItem>
                            )}
                            {isDirector && (
                              <DropdownMenuItem onClick={() => handleDelete(lead.id)} className="gap-2 text-xs font-bold uppercase tracking-widest text-red-400">
                                <Trash2 className="w-3.5 h-3.5" />Удалить
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Pagination */}
        {total > 50 && (
          <div className="flex justify-center gap-3 pt-4">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-xl border-white/10 text-white/60 font-bold uppercase tracking-widest text-[10px]">Назад</Button>
            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest flex items-center px-3">
              {page} / {Math.ceil(total / 50)}
            </span>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(p => p + 1)} className="rounded-xl border-white/10 text-white/60 font-bold uppercase tracking-widest text-[10px]">Далее</Button>
          </div>
        )}
      </div>

      {/* ── DIALOGS ── */}
      <LeadFormDialog
        open={formOpen || !!editLead}
        lead={editLead}
        defaultCategory={category}
        onClose={() => { setFormOpen(false); setEditLead(null); }}
        onSubmit={editLead ? (d) => handleUpdate({ ...d, id: editLead.id }) : handleCreate}
        loading={createMutation.isPending || updateMutation.isPending}
      />

      <LeadDetailDialog
        leadId={detailLeadId}
        onClose={() => setDetailLeadId(null)}
      />
    </MainLayout>
  );
}

// ─── Lead Form Dialog ─────────────────────────────────────────────────
function LeadFormDialog({ open, lead, defaultCategory, onClose, onSubmit, loading }: {
  open: boolean;
  lead: Lead | null;
  defaultCategory: 'newbuilding' | 'secondary';
  onClose: () => void;
  onSubmit: (data: LeadCreate) => Promise<void>;
  loading: boolean;
}) {
  const [form, setForm] = useState<LeadCreate>({
    category: defaultCategory,
    full_name: '',
    phone: '',
    birthday: '',
    mortgage: false,
    mortgage_type: '',
    mortgage_approved: false,
    residential_complex: '',
    result: '',
    comment: '',
    status: 'new',
  });

  useEffect(() => {
    if (open && lead) {
      setForm({
        category: lead.category,
        full_name: lead.full_name,
        phone: lead.phone ? formatPhoneRu(lead.phone) : '',
        birthday: lead.birthday ? lead.birthday.split('T')[0] : '',
        mortgage: lead.mortgage,
        mortgage_type: lead.mortgage_type || '',
        mortgage_approved: lead.mortgage_approved,
        residential_complex: lead.residential_complex || '',
        result: lead.result || '',
        comment: lead.comment || '',
        status: lead.status,
      });
    } else if (open && !lead) {
      setForm({ category: defaultCategory, full_name: '', phone: '', birthday: '', mortgage: false, mortgage_type: '', mortgage_approved: false, residential_complex: '', result: '', comment: '', status: 'new' });
    }
  }, [open, lead, defaultCategory]);

  const handlePhoneChange = (val: string) => {
    setForm(f => ({ ...f, phone: formatPhoneRu(val) }));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg rounded-2xl bg-zinc-950 border-white/10 p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 pb-4 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/10 rounded-xl border border-violet-500/10">
              <Users className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <DialogTitle className="text-white font-black uppercase tracking-widest text-base">
                {lead ? 'Редактировать лид' : 'Новый лид'}
              </DialogTitle>
              <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-0.5">
                {lead ? 'Изменение данных' : 'Добавление в базу'}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Category */}
          <div>
            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Категория <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm(f => ({ ...f, category: 'newbuilding' }))} className={cn("flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all", form.category === 'newbuilding' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-zinc-900/60 border-white/5 text-white/40")}>
                Новостройка
              </button>
              <button type="button" onClick={() => setForm(f => ({ ...f, category: 'secondary' }))} className={cn("flex-1 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all", form.category === 'secondary' ? "bg-amber-500/10 border-amber-500/20 text-amber-300" : "bg-zinc-900/60 border-white/5 text-white/40")}>
                Вторичка
              </button>
            </div>
          </div>

          {/* FIO */}
          <div>
            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">ФИО <span className="text-red-500">*</span></label>
            <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Иванов Иван Иванович" className="h-11 rounded-xl bg-zinc-900/60 border-white/5" />
          </div>

          {/* Phone + Birthday */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Телефон</label>
              <Input value={form.phone} onChange={e => handlePhoneChange(e.target.value)} placeholder="+7 (999) 123-45-67" className="h-11 rounded-xl bg-zinc-900/60 border-white/5 normal-case font-medium tracking-normal" />
            </div>
            <div>
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Дата рождения</label>
              <Input type="date" value={form.birthday} onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))} className="h-11 rounded-xl bg-zinc-900/60 border-white/5" />
            </div>
          </div>

          {/* Mortgage */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Ипотека</label>
              <button type="button" onClick={() => setForm(f => ({ ...f, mortgage: !f.mortgage }))} className={cn("px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all", form.mortgage ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-300" : "bg-zinc-900/60 border-white/5 text-white/30")}>
                {form.mortgage ? 'Да' : 'Нет'}
              </button>
              {form.mortgage && (
                <button type="button" onClick={() => setForm(f => ({ ...f, mortgage_approved: !f.mortgage_approved }))} className={cn("px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all", form.mortgage_approved ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-zinc-900/60 border-white/5 text-white/30")}>
                  {form.mortgage_approved ? 'Одобрена ✓' : 'Не одобрена'}
                </button>
              )}
            </div>
            {form.mortgage && (
              <div>
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Вид ипотеки</label>
                <Select value={form.mortgage_type || ''} onValueChange={v => setForm(f => ({ ...f, mortgage_type: v }))}>
                  <SelectTrigger className="h-10 rounded-xl bg-zinc-900/60 border-white/5"><SelectValue placeholder="Выберите..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="base">Базовая</SelectItem>
                    <SelectItem value="family">Семейная</SelectItem>
                    <SelectItem value="it">IT</SelectItem>
                    <SelectItem value="installment">Рассрочка</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* ЖК / адрес */}
          <div>
            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">
              {form.category === 'secondary' ? 'Адрес' : 'ЖК'}
            </label>
            <Input
              value={form.residential_complex}
              onChange={e => setForm(f => ({ ...f, residential_complex: e.target.value }))}
              placeholder={form.category === 'secondary' ? 'Адрес объекта' : 'Название жилого комплекса'}
              className="h-11 rounded-xl bg-zinc-900/60 border-white/5"
            />
          </div>

          {/* Status */}
          <div>
            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Статус</label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="h-11 rounded-xl bg-zinc-900/60 border-white/5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(LEAD_STATUSES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ИТОГ */}
          <div>
            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Итог</label>
            <Textarea value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value }))} placeholder="Итог работы с лидом..." className="rounded-xl bg-zinc-900/60 border-white/5 min-h-[60px] resize-none" />
          </div>

          {/* Comment */}
          <div>
            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Комментарий</label>
            <Textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} placeholder="Заметки..." className="rounded-xl bg-zinc-900/60 border-white/5 min-h-[60px] resize-none" />
          </div>
        </div>

        <div className="border-t border-white/5 p-6 flex gap-3 flex-shrink-0">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1 h-11 rounded-xl border-white/10 text-white/70 hover:text-white">Отмена</Button>
          <Button
            disabled={!form.full_name.trim() || loading}
            onClick={() => onSubmit(form)}
            className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 disabled:opacity-40"
          >
            {loading ? 'Сохранение...' : lead ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Lead Detail Dialog (with touches) ────────────────────────────────
function LeadDetailDialog({ leadId, onClose }: { leadId: string | null; onClose: () => void }) {
  const { user } = useAuth();
  const { data: lead, isLoading } = useLead(leadId);
  const addTouch = useAddLeadTouch();
  const deleteTouch = useDeleteLeadTouch();
  const [newTouch, setNewTouch] = useState('');

  if (!leadId) return null;

  const handleAddTouch = async () => {
    if (!newTouch.trim() || !leadId) return;
    await addTouch.mutateAsync({ leadId, text: newTouch.trim() });
    setNewTouch('');
  };

  const st = lead ? (LEAD_STATUSES[lead.status] || { label: lead.status, color: '' }) : { label: '', color: '' };

  return (
    <Dialog open={!!leadId} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg rounded-2xl bg-zinc-950 border-white/10 p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 pb-4 border-b border-white/5 flex-shrink-0">
          {isLoading || !lead ? (
            <div className="h-10 w-48 bg-white/10 rounded-lg animate-pulse" />
          ) : (
            <div className="flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-2xl border flex items-center justify-center", lead.category === 'newbuilding' ? "bg-emerald-500/10 border-emerald-500/10" : "bg-amber-500/10 border-amber-500/10")}>
                <span className={cn("text-lg font-black", lead.category === 'newbuilding' ? "text-emerald-400" : "text-amber-400")}>{lead.full_name.charAt(0)}</span>
              </div>
              <div>
                <DialogTitle className="text-white font-black tracking-tight text-base">{lead.full_name}</DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={cn('text-[9px] font-black uppercase tracking-wider border px-2 py-0.5 rounded-lg', st.color)}>{st.label}</Badge>
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/20">
                    {lead.category === 'newbuilding' ? 'Новостройка' : 'Вторичка'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogHeader>

        {lead && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="w-3.5 h-3.5 text-white/20" />
                  <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Телефон</p>
                </div>
                <p className="text-sm font-bold text-white">{lead.phone || '—'}</p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-3.5 h-3.5 text-white/20" />
                  <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">День рождения</p>
                </div>
                <p className="text-sm font-bold text-white">{formatDate(lead.birthday)}</p>
              </div>
            </div>

            {/* Mortgage */}
            {lead.mortgage && (
              <div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/10">
                <p className="text-[9px] font-black text-cyan-400/60 uppercase tracking-widest mb-2">Ипотека</p>
                <p className="text-sm font-bold text-white">
                  {lead.mortgage_type ? MORTGAGE_TYPES[lead.mortgage_type] : 'Да'}
                  {lead.mortgage_approved && <span className="text-emerald-400 ml-2">· Одобрена</span>}
                  {!lead.mortgage_approved && <span className="text-white/30 ml-2">· Не одобрена</span>}
                </p>
              </div>
            )}

            {/* ЖК / адрес */}
            {lead.residential_complex && (
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-3.5 h-3.5 text-white/20" />
                  <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">
                    {lead.category === 'secondary' ? 'Адрес' : 'Жилой комплекс'}
                  </p>
                </div>
                <p className="text-sm font-bold text-white">{lead.residential_complex}</p>
              </div>
            )}

            {(lead.created_by_name || lead.created_by) && (
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-white/5">
                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Создал</p>
                <p className="text-sm font-bold text-white">
                  {lead.created_by_name || '—'}
                  {lead.created_by && user?.id && lead.created_by === user.id && (
                    <span className="text-[10px] font-black text-primary ml-2 uppercase tracking-widest">(вы)</span>
                  )}
                </p>
              </div>
            )}

            {/* Итог */}
            {lead.result && (
              <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                <p className="text-[9px] font-black text-emerald-400/60 uppercase tracking-widest mb-2">Итог</p>
                <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{lead.result}</p>
              </div>
            )}

            {/* Comment */}
            {lead.comment && (
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-white/5">
                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Комментарий</p>
                <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{lead.comment}</p>
              </div>
            )}

            {/* Touches */}
            <div className="space-y-3">
              <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Касания ({lead.touches?.length || 0})</p>

              {/* Add new touch */}
              <div className="flex gap-2">
                <Textarea
                  value={newTouch}
                  onChange={e => setNewTouch(e.target.value)}
                  placeholder="Добавить заметку о касании..."
                  className="rounded-xl bg-zinc-900/60 border-white/5 text-sm flex-1 min-h-[60px] resize-none"
                />
              </div>
              <Button size="sm" onClick={handleAddTouch} disabled={!newTouch.trim() || addTouch.isPending} className="h-9 rounded-xl bg-primary/80 hover:bg-primary text-[9px] font-black uppercase tracking-widest px-4">
                <Plus className="w-3 h-3 mr-1" />Добавить касание
              </Button>

              {/* Touch list */}
              {lead.touches && lead.touches.length > 0 && (
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {lead.touches.map(touch => (
                    <div key={touch.id} className="relative p-4 rounded-xl bg-zinc-900/50 border border-white/5 group">
                      <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed font-medium">{touch.text}</p>
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
                        <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">
                          {touch.created_by_name || 'Система'} · {formatDate(touch.created_at)}
                        </p>
                        <button
                          onClick={() => deleteTouch.mutate({ leadId: lead.id, touchId: touch.id })}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
              <div className="p-3 rounded-xl bg-zinc-900/40 border border-white/5">
                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Создан</p>
                <p className="text-sm font-bold text-white">{formatDate(lead.created_at)}</p>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/40 border border-white/5">
                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Создал</p>
                <p className="text-sm font-bold text-white">{lead.created_by_name || '—'}</p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
