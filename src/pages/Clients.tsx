import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useClients, useCreateClient, useUpdateClient, useDeleteClient, useClientAccessCheck, Client, CLIENT_STATUSES, ClientCreate } from '@/hooks/useClients';
import { useSharedData, useEmployeesData } from '@/hooks/useSharedData';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { INPUT_WITH_LEADING_ICON } from '@/lib/inputClassNames';
import { formatPhoneRu } from '@/lib/phone-utils';
import {
  Users, Search, Plus, Filter, Phone, Calendar, MessageSquare,
  MoreVertical, Pencil, Trash2, Eye, UserCheck, UserX, User, Layers, Coins
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
import { ClientAccessSettings } from '@/components/clients/ClientAccessSettings';

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ru-RU');
}

export default function Clients() {
  const { accessLevel } = useAuth();
  const { data: accessCheck } = useClientAccessCheck();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [detailClient, setDetailClient] = useState<Client | null>(null);
  const [showAccessSettings, setShowAccessSettings] = useState(false);

  const { branches, teams } = useSharedData();
  const { data: employees = [] } = useEmployeesData();

  const { data, isLoading } = useClients({ search, status: statusFilter, branch_id: branchFilter, team_id: teamFilter, created_by: employeeFilter, page });
  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient();
  const deleteMutation = useDeleteClient();

  const clients = data?.clients || [];
  const total = data?.total || 0;

  const handleCreate = async (data: ClientCreate) => {
    await createMutation.mutateAsync(data);
    setFormOpen(false);
  };

  const handleUpdate = async (data: ClientCreate & { id: string }) => {
    await updateMutation.mutateAsync(data);
    setEditClient(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Удалить клиента? Связь с объектами будет разорвана.')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  // Stats
  const stats = useMemo(() => {
    const inWork = clients.filter(c => c.status === 'in_progress').length;
    const deals = clients.filter(c => c.status === 'deal').length;
    return { inWork, deals };
  }, [clients]);

  // If user is restricted, show message (must be AFTER all hooks)
  if (accessCheck?.restricted) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center space-y-3">
            <UserX className="w-16 h-16 mx-auto text-muted-foreground/40" />
            <p className="text-lg font-medium text-muted-foreground">Раздел «Клиенты» скрыт</p>
            <p className="text-sm text-muted-foreground/70">Обратитесь к руководителю для получения доступа</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  const isDirector = accessLevel >= 100;
  const activeFiltersCount = [
    statusFilter !== 'all',
    branchFilter !== 'all',
    teamFilter !== 'all',
    employeeFilter !== 'all',
  ].filter(Boolean).length;

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
              КЛИЕНТЫ
            </h1>
            <p className="text-xs md:text-sm font-black text-white/20 uppercase tracking-[0.3em] flex items-center gap-2">
              <span className="w-8 md:w-10 h-px bg-white/10" />
              база клиентов · статусы · привязка к объектам
            </p>
          </div>

          {accessLevel >= 50 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAccessSettings(true)}
              className="h-10 md:h-11 px-4 md:px-6 gap-2 bg-zinc-900/60 border-white/10 text-white hover:bg-white/5 rounded-xl transition-all font-bold uppercase tracking-widest text-[10px]"
            >
              <UserCheck className="h-4 w-4" />
              Управление доступом
            </Button>
          )}
        </div>

        {/* ── BENTO STATS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {[
            {
              label: 'Всего клиентов', value: isLoading ? null : total.toString(),
              icon: Users, glow: 'bg-violet-500/10', border: 'border-violet-500/10', iconCls: 'text-violet-400',
            },
            {
              label: 'В работе', value: isLoading ? null : stats.inWork.toString(),
              icon: Layers, glow: 'bg-amber-500/10', border: 'border-amber-500/10', iconCls: 'text-amber-400',
            },
            {
              label: 'Со сделками', value: isLoading ? null : stats.deals.toString(),
              icon: Coins, glow: 'bg-emerald-500/10', border: 'border-emerald-500/10', iconCls: 'text-emerald-400',
            },
            {
              label: 'Новых сегодня', value: isLoading ? null : clients.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString()).length.toString(),
              icon: User, glow: 'bg-blue-500/10', border: 'border-blue-500/10', iconCls: 'text-blue-400',
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

        {/* ── HEADER ACTIONS (Search + Filters + Create) ── */}
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
              <PopoverContent
                align="end"
                sideOffset={8}
                className="w-[min(92vw,420px)] p-0 bg-zinc-950 border-white/10 rounded-2xl shadow-2xl"
              >
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
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Сотрудник</label>
                    <Select value={employeeFilter} onValueChange={v => { setEmployeeFilter(v); setPage(1); }}>
                      <SelectTrigger className="h-10 rounded-xl bg-zinc-900/60 border-white/5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все сотрудники</SelectItem>
                        {filteredEmployees.map((e: any) => (
                          <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Статус</label>
                    <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                      <SelectTrigger className="h-10 rounded-xl bg-zinc-900/60 border-white/5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все статусы</SelectItem>
                        {Object.entries(CLIENT_STATUSES).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {activeFiltersCount > 0 && (
                  <div className="border-t border-white/5 p-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl border-white/10 text-white/60 hover:text-white text-[10px] font-black uppercase tracking-widest"
                      onClick={() => { setStatusFilter('all'); setBranchFilter('all'); setTeamFilter('all'); setEmployeeFilter('all'); }}
                    >
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
            Добавить клиента
          </Button>
        </div>

        {/* ── CLIENT LIST ── */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Users className="w-14 h-14 text-white/10 mb-4" />
            <p className="text-sm font-black text-white/30 uppercase tracking-widest">Нет клиентов</p>
            <p className="text-xs text-white/15 mt-1">Нажмите «Добавить клиента» чтобы создать первого</p>
          </div>
        ) : (
          <div className="grid gap-3">
            <AnimatePresence mode="popLayout">
              {clients.map((client, idx) => {
                const st = CLIENT_STATUSES[client.status] || { label: client.status, color: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/20' };
                return (
                  <motion.div
                    key={client.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: idx * 0.03 }}
                    className="relative overflow-hidden rounded-xl md:rounded-2xl bg-zinc-900/40 border border-white/5 p-4 md:p-5 backdrop-blur-3xl group hover:border-violet-500/20 transition-all shadow-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-11 h-11 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-violet-500/10 border border-violet-500/10 flex items-center justify-center shrink-0">
                          <span className="text-base md:text-lg font-black text-violet-400">
                            {client.full_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm md:text-base font-black text-white truncate tracking-tight">{client.full_name}</p>
                          <div className="flex items-center gap-3 mt-1">
                            {client.phone && (
                              <span className="flex items-center gap-1.5 text-[10px] md:text-[11px] font-bold text-white/30 uppercase tracking-widest">
                                <Phone className="w-3 h-3 text-white/20" />
                                {client.phone}
                              </span>
                            )}
                            {client.birthday && (
                              <span className="flex items-center gap-1.5 text-[10px] md:text-[11px] font-bold text-white/30 uppercase tracking-widest">
                                <Calendar className="w-3 h-3 text-white/20" />
                                {formatDate(client.birthday)}
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
                          {formatDate(client.created_at)}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-white/40 hover:text-white">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-zinc-950 border-white/10 rounded-xl">
                            <DropdownMenuItem onClick={() => setDetailClient(client)} className="gap-2 text-xs font-bold uppercase tracking-widest">
                              <Eye className="w-3.5 h-3.5" />Просмотр
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditClient(client)} className="gap-2 text-xs font-bold uppercase tracking-widest">
                              <Pencil className="w-3.5 h-3.5" />Редактировать
                            </DropdownMenuItem>
                            {accessLevel >= 50 && (
                              <DropdownMenuItem onClick={() => handleDelete(client.id)} className="gap-2 text-xs font-bold uppercase tracking-widest text-red-400">
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
      <ClientFormDialog
        open={formOpen || !!editClient}
        client={editClient}
        onClose={() => { setFormOpen(false); setEditClient(null); }}
        onSubmit={editClient ? (d) => handleUpdate({ ...d, id: editClient.id }) : handleCreate}
        loading={createMutation.isPending || updateMutation.isPending}
      />

      <ClientDetailDialog
        client={detailClient}
        onClose={() => setDetailClient(null)}
      />

      {showAccessSettings && (
        <ClientAccessSettings
          open={showAccessSettings}
          onClose={() => setShowAccessSettings(false)}
        />
      )}
    </MainLayout>
  );
}

// ─── Client Form Dialog ───────────────────────────────────────────────
function ClientFormDialog({ open, client, onClose, onSubmit, loading }: {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSubmit: (data: ClientCreate) => Promise<void>;
  loading: boolean;
}) {
  const [form, setForm] = useState<ClientCreate>({
    full_name: '',
    phone: '',
    birthday: '',
    comment: '',
    status: 'new',
  });

  // Sync form when client changes
  useEffect(() => {
    if (open && client) {
      setForm({
        full_name: client.full_name,
        phone: client.phone ? formatPhoneRu(client.phone) : '',
        birthday: client.birthday ? client.birthday.split('T')[0] : '',
        comment: client.comment || '',
        status: client.status,
      });
    } else if (open && !client) {
      setForm({ full_name: '', phone: '', birthday: '', comment: '', status: 'new' });
    }
  }, [open, client]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md rounded-2xl bg-zinc-950 border-white/10 p-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-6 pb-4 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/10 rounded-xl border border-violet-500/10">
              <Users className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <DialogTitle className="text-white font-black uppercase tracking-widest text-base">
                {client ? 'Редактировать клиента' : 'Новый клиент'}
              </DialogTitle>
              <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-0.5">
                {client ? 'Изменение данных' : 'Добавление в базу'}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">
              ФИО <span className="text-red-500">*</span>
            </label>
            <Input
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="Иванов Иван Иванович"
              className="h-11 rounded-xl bg-zinc-900/60 border-white/5"
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Телефон</label>
            <Input
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: formatPhoneRu(e.target.value) }))}
              placeholder="+7 (999) 123-45-67"
              className="h-11 rounded-xl bg-zinc-900/60 border-white/5 normal-case font-medium tracking-normal"
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Дата рождения</label>
            <Input
              type="date"
              value={form.birthday}
              onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))}
              className="h-11 rounded-xl bg-zinc-900/60 border-white/5"
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Статус</label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="h-11 rounded-xl bg-zinc-900/60 border-white/5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CLIENT_STATUSES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Комментарий</label>
            <Textarea
              value={form.comment}
              onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
              placeholder="Заметки о клиенте..."
              className="rounded-xl bg-zinc-900/60 border-white/5 min-h-[80px] resize-none"
            />
          </div>
        </div>

        <div className="border-t border-white/5 p-6 flex gap-3 flex-shrink-0">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1 h-11 rounded-xl border-white/10 text-white/70 hover:text-white">
            Отмена
          </Button>
          <Button
            disabled={!form.full_name.trim() || loading}
            onClick={() => onSubmit(form)}
            className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 disabled:opacity-40"
          >
            {loading ? 'Сохранение...' : client ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Client Detail Dialog ─────────────────────────────────────────────
function ClientDetailDialog({ client, onClose }: { client: Client | null; onClose: () => void }) {
  if (!client) return null;
  const st = CLIENT_STATUSES[client.status] || { label: client.status, color: '' };

  return (
    <Dialog open={!!client} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md rounded-2xl bg-zinc-950 border-white/10 p-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-6 pb-4 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/10 flex items-center justify-center">
              <span className="text-lg font-black text-violet-400">{client.full_name.charAt(0)}</span>
            </div>
            <div>
              <DialogTitle className="text-white font-black tracking-tight text-base">{client.full_name}</DialogTitle>
              <Badge variant="outline" className={cn('text-[9px] font-black uppercase tracking-wider border mt-1 px-2 py-0.5 rounded-lg', st.color)}>
                {st.label}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-zinc-900/40 border border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <Phone className="w-3.5 h-3.5 text-white/20" />
                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Телефон</p>
              </div>
              <p className="text-sm font-bold text-white">{client.phone || '—'}</p>
            </div>
            <div className="p-4 rounded-xl bg-zinc-900/40 border border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-3.5 h-3.5 text-white/20" />
                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">День рождения</p>
              </div>
              <p className="text-sm font-bold text-white">{formatDate(client.birthday)}</p>
            </div>
          </div>

          {client.comment && (
            <div className="p-4 rounded-xl bg-zinc-900/40 border border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-3.5 h-3.5 text-white/20" />
                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Комментарий</p>
              </div>
              <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{client.comment}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
            <div className="p-4 rounded-xl bg-zinc-900/40 border border-white/5">
              <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1.5">Создан</p>
              <p className="text-sm font-bold text-white">{formatDate(client.created_at)}</p>
            </div>
            <div className="p-4 rounded-xl bg-zinc-900/40 border border-white/5">
              <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1.5">Создал</p>
              <p className="text-sm font-bold text-white">{client.created_by_name || '—'}</p>
            </div>
          </div>

          {client.properties && client.properties.length > 0 && (
            <div className="p-4 rounded-xl bg-zinc-900/40 border border-white/5">
              <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-3">Связанные объекты</p>
              <div className="space-y-2">
                {client.properties.map((prop: any) => (
                  <div key={prop.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                    <span className="text-xs font-bold text-white">{prop.city}, {prop.address}</span>
                    <span className="text-[10px] font-bold text-white/30">{prop.price ? `${(prop.price / 1_000_000).toFixed(1)} млн` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
