import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useEmployeesData, useSharedData } from '@/hooks/useSharedData';
import type { MortgageServiceRow } from '@/hooks/useMortgageServices';
import { useClient, useClientAccessCheck, useClientSearch, useCreateClient } from '@/hooks/useClients';
import { ClientCreateInlineMini, ClientSearchInput } from '@/components/clients/ClientSearchPickOrCreate';
import { cn } from '@/lib/utils';
import { formatMoneyTrimTrailingZeros, parseApiNumber, groupedIntegerInputDisplay, clampIntAmountFromDigits } from '@/utils/formatters';
import { toast } from 'sonner';
import { Building2, Calculator, FileText, User } from 'lucide-react';
import { localAPI } from '@/integrations/localAPI';

function displayEmployeeName(e: any): string {
  if (!e) return '';
  return (e.full_name || `${e.first_name || ''} ${e.last_name || ''}`.trim()).trim();
}

function employeePositionNameLower(e: any): string {
  return String(e?.position?.name ?? e?.position_name ?? '').toLowerCase();
}

function isMortgageBrokerEmployee(e: any): boolean {
  if (!e?.is_active) return false;
  if (e.role === 'mortgage_broker') return true;
  const pos = employeePositionNameLower(e);
  if (pos.includes('ипотечный брокер')) return true;
  if (pos.includes('ипотек') && pos.includes('брокер')) return true;
  return false;
}

/** МОП филиала: по должности/роли (руководитель команды добавляется отдельно по leader_id). */
function isBranchMopByProfile(e: any): boolean {
  if (!e?.is_active) return false;
  if (e.role === 'sales_manager') return true;
  const pos = employeePositionNameLower(e);
  if (pos.includes('моп')) return true;
  return false;
}

function previewSplits(serviceCost: number) {
  const svc = Math.max(0, Number(serviceCost) || 0);
  if (svc <= 0) return { agent_fee: 0, broker_share: 0, agency_share: 0 };
  const remainder = Math.max(0, svc - 5000);
  const agent_fee = remainder > 0 ? 5000 : svc;
  const half = remainder / 2;
  return {
    agent_fee: Math.round(agent_fee * 100) / 100,
    broker_share: Math.round(half * 100) / 100,
    agency_share: Math.round(half * 100) / 100,
  };
}

function toDateInput(dealDate: string): string {
  if (!dealDate) return '';
  try {
    const d = new Date(dealDate);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch {
    /* ignore */
  }
  return dealDate.slice(0, 10);
}

function rowBankParts(row: MortgageServiceRow): { bank: string; program: string } {
  const r = row as MortgageServiceRow & { bank_name?: string; program_name?: string };
  let b = (r.bank_name != null ? String(r.bank_name) : '').trim();
  let p = (r.program_name != null ? String(r.program_name) : '').trim();
  if (!b && !p) {
    const raw = String(row.bank_program || '').trim();
    const idx = raw.indexOf(',');
    if (idx < 0) {
      b = raw;
    } else {
      b = raw.slice(0, idx).trim();
      p = raw.slice(idx + 1).trim();
    }
  }
  return { bank: b, program: p };
}

function MFormField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-xs font-bold text-white/50 uppercase tracking-wider">{label}</p>
      {children}
    </div>
  );
}

type MortgageClientSource = 'client' | 'lead' | 'external';

function PartySourceToggleBar({
  value,
  onChange,
}: {
  value: MortgageClientSource;
  onChange: (next: MortgageClientSource) => void;
}) {
  const cell = (m: MortgageClientSource, label: string) => (
    <button
      key={m}
      type="button"
      onClick={() => onChange(m)}
      className={cn(
        'flex-1 min-w-0 py-2.5 rounded-lg text-[11px] sm:text-xs font-black uppercase tracking-wider transition-colors',
        value === m
          ? 'bg-primary text-white'
          : 'text-white/45 hover:text-white/80 hover:bg-white/5'
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="flex w-full rounded-xl border border-white/10 p-1 bg-black/20 gap-1">
      {cell('client', 'Клиент')}
      {cell('lead', 'Лид')}
      {cell('external', 'Внешний')}
    </div>
  );
}

function MSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-3 text-white">
        <div className="p-2 bg-zinc-900/60 border border-white/10 rounded-lg shrink-0">{icon}</div>
        <h3 className="text-sm font-black uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  );
}

interface MortgageFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: MortgageServiceRow | null;
  defaultBranchId?: string | null;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  isSubmitting?: boolean;
}

export function MortgageFormDialog({
  open,
  onOpenChange,
  editing,
  defaultBranchId,
  onSubmit,
  isSubmitting,
}: MortgageFormDialogProps) {
  const { user, profile, accessLevel } = useAuth();
  const { data: employeesRaw = [] } = useEmployeesData();
  const { branches, teams } = useSharedData();
  const isDirector = accessLevel >= 90;
  const companyId = profile?.company_id ?? null;

  const branchesForCompany = useMemo(() => {
    const list = (Array.isArray(branches) ? branches : []) as Array<{ id: string; name?: string; company_id?: string }>;
    if (!companyId) return list.filter((b) => b?.id);
    return list.filter((b) => b?.id && (!b.company_id || String(b.company_id) === String(companyId)));
  }, [branches, companyId]);

  const employees = useMemo(
    () => (Array.isArray(employeesRaw) ? employeesRaw : []).filter((e: any) => e?.is_active),
    [employeesRaw]
  );

  const [dealDate, setDealDate] = useState('');
  const [bankName, setBankName] = useState('');
  const [programName, setProgramName] = useState('');
  const [serviceCostAmount, setServiceCostAmount] = useState(0);
  const [brokerId, setBrokerId] = useState<string>('');
  const [brokerName, setBrokerName] = useState('');
  const [agentId, setAgentId] = useState<string>('');
  const [agentName, setAgentName] = useState('');
  const [branchId, setBranchId] = useState<string>('');
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('approved');
  const [brokerPayoutStatus, setBrokerPayoutStatus] = useState<'pending' | 'paid'>('pending');
  const [brokerPaidAt, setBrokerPaidAt] = useState('');
  const [brokerPaidNote, setBrokerPaidNote] = useState('');

  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<{ id: string; full_name: string; phone: string } | null>(null);
  const [newClientData, setNewClientData] = useState<{
    full_name: string;
    phone: string;
    birthday?: string;
    comment?: string;
  } | null>(null);

  const [clientSource, setClientSource] = useState<MortgageClientSource>('client');
  const [leadSearch, setLeadSearch] = useState('');
  const [leadDropdownOpen, setLeadDropdownOpen] = useState(false);
  const [partyFreeName, setPartyFreeName] = useState('');
  const mortgageLeadsPickRef = useRef<HTMLDivElement>(null);

  const { data: clientAccessCheck } = useClientAccessCheck();
  const { data: clientSuggestions = [] } = useClientSearch(clientSearch);
  const editClientId = editing?.client_id ? String(editing.client_id) : '';
  const { data: linkedClient } = useClient(editClientId || null);
  const createClientMutation = useCreateClient();

  const inputCls = 'bg-white/[0.03] border-white/5 h-12 sm:h-14 text-base rounded-2xl';
  const selectTriggerCls = 'bg-white/[0.03] border-white/5 h-12 sm:h-14 text-base rounded-2xl';
  const clientInputClsSearch = cn(inputCls, 'normal-case tracking-normal');
  const clientInputClsMini = cn('h-10 rounded-xl bg-zinc-900/60 border-white/5');

  useEffect(() => {
    if (!open) return;
    const row = editing;
    if (row) {
      setDealDate(toDateInput(row.deal_date));
      const bp = rowBankParts(row);
      setBankName(bp.bank);
      setProgramName(bp.program);
      setServiceCostAmount(Math.round(parseApiNumber(row.service_cost)));
      setBrokerId(row.broker_id || '');
      setBrokerName(row.broker_name || '');
      setAgentId(row.agent_id || '');
      setAgentName(row.agent_name || '');
      setBranchId(row.branch_id || '');
      setStatus((row.status as typeof status) || 'approved');
      setBrokerPayoutStatus(row.broker_payout_status === 'paid' ? 'paid' : 'pending');
      setBrokerPaidAt(row.broker_paid_at ? toDateInput(row.broker_paid_at) : '');
      setBrokerPaidNote(row.broker_paid_note || '');
      setNewClientData(null);
      setClientSearch('');
      setLeadSearch('');
      setLeadDropdownOpen(false);
      if ((row as MortgageServiceRow & { client_id?: string }).client_id) {
        setSelectedClient({
          id: String((row as MortgageServiceRow & { client_id?: string }).client_id),
          full_name: row.client_name || 'Клиент',
          phone: '',
        });
        setClientSource('client');
        setPartyFreeName('');
      } else {
        setSelectedClient(null);
        setClientSource('external');
        setPartyFreeName(row.client_name || '');
      }
    } else {
      setDealDate(new Date().toISOString().slice(0, 10));
      setBankName('');
      setProgramName('');
      setServiceCostAmount(0);
      const defBranch =
        (defaultBranchId && String(defaultBranchId).trim()) ||
        profile?.branch_id ||
        user?.branch_id ||
        '';
      setBranchId(defBranch ? String(defBranch) : '');
      setBrokerId('');
      setBrokerName('');
      setAgentId('');
      setAgentName('');
      setStatus('approved');
      setBrokerPayoutStatus('pending');
      setBrokerPaidAt('');
      setBrokerPaidNote('');
      setSelectedClient(null);
      setNewClientData(null);
      setClientSearch('');
      setClientSource('client');
      setLeadSearch('');
      setLeadDropdownOpen(false);
      setPartyFreeName('');
    }
  }, [open, editing, profile?.branch_id, user?.branch_id, defaultBranchId]);

  useEffect(() => {
    if (!open || !linkedClient?.id) return;
    setSelectedClient({
      id: String(linkedClient.id),
      full_name: linkedClient.full_name || 'Клиент',
      phone: linkedClient.phone || '',
    });
    setNewClientData(null);
    setClientSearch('');
    setClientSource('client');
    setPartyFreeName('');
    setLeadSearch('');
    setLeadDropdownOpen(false);
  }, [open, linkedClient?.id, linkedClient?.full_name, linkedClient?.phone]);

  const brokerOptionsForBranch = useMemo(() => {
    const teamList = (Array.isArray(teams) ? teams : []) as Array<{ branch_id?: string | null; leader_id?: string | null }>;

    const leaderIdsInBranch = new Set<string>();
    if (branchId) {
      for (const t of teamList) {
        if (String(t.branch_id || '') === String(branchId) && t.leader_id) {
          leaderIdsInBranch.add(String(t.leader_id));
        }
      }
    }

    const byId = new Map<string, any>();
    for (const e of employees) {
      if (!e?.id || !e?.is_active) continue;

      if (branchId) {
        if (e.branch_id && String(e.branch_id) !== String(branchId)) continue;
        const isBroker = isMortgageBrokerEmployee(e);
        const isTeamLeaderHere = leaderIdsInBranch.has(String(e.id));
        const isMopHere = isBranchMopByProfile(e);
        if (isBroker || isTeamLeaderHere || isMopHere) {
          byId.set(String(e.id), e);
        }
      } else {
        if (isMortgageBrokerEmployee(e)) {
          byId.set(String(e.id), e);
        }
      }
    }

    return Array.from(byId.values()).sort((a, b) =>
      displayEmployeeName(a).localeCompare(displayEmployeeName(b), 'ru', { sensitivity: 'base' })
    );
  }, [branchId, employees, teams]);

  const agentsForBranch = useMemo(() => {
    if (!branchId) return employees;
    return employees.filter((e: any) => !e.branch_id || String(e.branch_id) === branchId);
  }, [branchId, employees]);

  const lockedBranchLabel = useMemo(() => {
    if (!branchId) return 'Не указан';
    const b = branchesForCompany.find((x) => String(x.id) === String(branchId));
    return (b?.name || 'Филиал').trim();
  }, [branchId, branchesForCompany]);

  const managerCanEditStatus = accessLevel >= 50;
  const clientRestricted = Boolean(clientAccessCheck?.restricted);

  const mortgageLeadQ = leadSearch.trim();
  const { data: mortgageLeadRows = [] } = useQuery({
    queryKey: ['mortgage-form-leads', mortgageLeadQ],
    queryFn: async () => {
      const { data, error } = await localAPI.request(
        `/leads?search=${encodeURIComponent(mortgageLeadQ)}&limit=35&page=1`
      );
      if (error) throw error;
      return Array.isArray((data as { leads?: unknown[] })?.leads) ? (data as { leads: any[] }).leads : [];
    },
    enabled: open && !clientRestricted && clientSource === 'lead' && mortgageLeadQ.length >= 2,
    staleTime: 15000,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (mortgageLeadsPickRef.current?.contains(e.target as Node)) return;
      setLeadDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleBrokerPick = (id: string) => {
    setBrokerId(id === '__none' ? '' : id);
    if (!id || id === '__none') {
      setBrokerName('');
      return;
    }
    const e = employees.find((x: any) => x.id === id);
    setBrokerName(displayEmployeeName(e));
  };

  const handleAgentPick = (id: string) => {
    setAgentId(id === '__none' ? '' : id);
    if (!id || id === '__none') {
      setAgentName('');
      return;
    }
    const e = employees.find((x: any) => x.id === id);
    setAgentName(displayEmployeeName(e));
  };

  const handleSave = useCallback(async () => {
    const cost = Math.max(0, Math.round(serviceCostAmount));
    const bank = bankName.trim();
    const program = programName.trim();

    const missing: string[] = [];
    if (!dealDate.trim()) missing.push('дату');
    if (!bank) missing.push('банк');
    if (!program) missing.push('программу');
    if (!Number.isFinite(cost) || cost <= 0) missing.push('стоимость услуги');
    if (missing.length) {
      toast.error(`Укажите ${ruJoinAnd(missing)}`);
      return;
    }

    let client_id: string | null = null;
    let client_name = '';

    if (clientRestricted) {
      client_name = clientSearch.trim();
      if (!client_name) {
        toast.error('Укажите ФИО клиента');
        return;
      }
    } else if (clientSource === 'external') {
      client_id = null;
      client_name = partyFreeName.trim();
      if (!client_name) {
        toast.error('Укажите наименование клиента или организации');
        return;
      }
    } else if (clientSource === 'lead') {
      client_id = null;
      client_name = partyFreeName.trim();
      if (!client_name) {
        toast.error('Выберите лида из списка');
        return;
      }
    } else {
      client_id = selectedClient?.id ?? null;
      client_name = (selectedClient?.full_name ?? newClientData?.full_name ?? clientSearch.trim()).trim();

      if (!selectedClient?.id && !newClientData?.full_name?.trim()) {
        toast.error('Выберите клиента из списка или создайте нового');
        return;
      }

      if (selectedClient?.id && !client_name) client_name = selectedClient.full_name;

      try {
        if (newClientData?.full_name?.trim()) {
          const digits = String(newClientData.phone || '').replace(/\D/g, '');
          if (digits.length < 10) {
            toast.error('Для нового клиента нужен номер телефона');
            return;
          }
          const created = await createClientMutation.mutateAsync({
            full_name: newClientData.full_name.trim(),
            phone: newClientData.phone,
            birthday: newClientData.birthday,
            comment: newClientData.comment,
            status: 'new',
          });
          client_id = created.id;
          client_name = created.full_name;
        }
      } catch {
        return;
      }
    }

    await onSubmit({
      deal_date: dealDate,
      bank_name: bank,
      program_name: program,
      service_cost: cost,
      client_name,
      client_id,
      broker_id: brokerId || null,
      broker_name: brokerName.trim() || null,
      agent_id: agentId || null,
      agent_name: agentName.trim() || null,
      branch_id: branchId || null,
      team_id: editing?.team_id ?? null,
      status,
      broker_payout_status: brokerPayoutStatus,
      broker_paid_at: brokerPaidAt || null,
      broker_paid_note: brokerPaidNote.trim() || null,
    });
  }, [
    serviceCostAmount,
    bankName,
    programName,
    dealDate,
    selectedClient,
    newClientData,
    clientSearch,
    clientRestricted,
    clientSource,
    partyFreeName,
    leadSearch,
    createClientMutation,
    onSubmit,
    brokerId,
    brokerName,
    agentId,
    agentName,
    branchId,
    editing?.team_id,
    status,
    brokerPayoutStatus,
    brokerPaidAt,
    brokerPaidNote,
  ]);

  const costNum = Math.max(0, serviceCostAmount);
  const splits = previewSplits(costNum);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ ['--dialog-content-max-width' as keyof React.CSSProperties]: '980px' } as React.CSSProperties}
        className="w-[calc(100vw-1.25rem)] sm:w-[96vw] max-w-[980px] max-h-[calc(100vh-1rem)] overflow-hidden bg-zinc-950/98 border-white/10 p-0 rounded-xl shadow-2xl flex flex-col"
      >
        <div className="p-4 sm:p-5 border-b border-white/10 bg-zinc-900/50 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg sm:text-xl font-semibold text-white truncate uppercase tracking-tight">
                {editing ? 'Редактирование услуги' : 'Новая ипотечная услуга'}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{dealDate ? new Date(dealDate).toLocaleDateString('ru-RU') : ''}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-6 sm:space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            <MSection title="Услуга" icon={<Calculator className="h-5 w-5 text-primary" />}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <MFormField label="Дата" className="md:col-span-2">
                  <Input type="date" value={dealDate} onChange={(e) => setDealDate(e.target.value)} className={inputCls} />
                </MFormField>
                <MFormField label="Банк">
                  <Input
                    placeholder="Напр. Сбербанк"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className={cn(inputCls, 'normal-case')}
                  />
                </MFormField>
                <MFormField label="Программа">
                  <Input
                    placeholder="Напр. новостройка"
                    value={programName}
                    onChange={(e) => setProgramName(e.target.value)}
                    className={cn(inputCls, 'normal-case')}
                  />
                </MFormField>
                <MFormField label="Стоимость услуги, ₽" className="md:col-span-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="50 000"
                    value={groupedIntegerInputDisplay(serviceCostAmount)}
                    onChange={(e) => setServiceCostAmount(clampIntAmountFromDigits(e.target.value))}
                    className={cn(inputCls, 'font-mono tabular-nums')}
                  />
                </MFormField>
              </div>
            </MSection>

            <MSection title="Клиент и филиал" icon={<Building2 className="h-5 w-5 text-emerald-400" />}>
              <div className="grid grid-cols-1 gap-4">
                <MFormField label="Клиент">
                  {clientRestricted ? (
                    <Input
                      placeholder="ФИО клиента"
                      value={clientSearch}
                      onChange={(e) => {
                        setClientSearch(e.target.value);
                        setSelectedClient(null);
                        setNewClientData(null);
                      }}
                      className={cn(inputCls, 'normal-case tracking-normal')}
                    />
                  ) : (
                    <div className="space-y-3">
                      <PartySourceToggleBar
                        value={clientSource}
                        onChange={(m) => {
                          if (m === 'external') {
                            const name =
                              selectedClient?.full_name?.trim() ||
                              newClientData?.full_name?.trim() ||
                              clientSearch.trim() ||
                              partyFreeName.trim();
                            setPartyFreeName(name);
                            setSelectedClient(null);
                            setNewClientData(null);
                            setClientSearch('');
                            setLeadSearch('');
                            setLeadDropdownOpen(false);
                          }
                          if (m === 'client') {
                            setLeadSearch('');
                            setLeadDropdownOpen(false);
                          }
                          if (m === 'lead') {
                            setSelectedClient(null);
                            setNewClientData(null);
                            setClientSearch('');
                          }
                          setClientSource(m);
                        }}
                      />

                      {clientSource === 'external' ? (
                        <Input
                          placeholder="ФИО, ООО или произвольное название"
                          value={partyFreeName}
                          onChange={(e) => setPartyFreeName(e.target.value)}
                          className={cn(inputCls, 'normal-case tracking-normal')}
                        />
                      ) : clientSource === 'lead' ? (
                        <div ref={mortgageLeadsPickRef} className="relative space-y-2">
                          <Input
                            value={leadSearch}
                            onChange={(e) => {
                              setLeadSearch(e.target.value);
                              setLeadDropdownOpen(true);
                            }}
                            onFocus={() => setLeadDropdownOpen(true)}
                            placeholder="Поиск лида из базы…"
                            className={cn(inputCls, 'normal-case tracking-normal')}
                          />
                          <p className="text-[10px] text-white/35 uppercase tracking-wide">
                            Нового лида здесь создать нельзя — только выбор из базы «Лиды».
                          </p>
                          {leadDropdownOpen && mortgageLeadQ.length >= 2 && mortgageLeadRows.length > 0 ? (
                            <div className="absolute z-50 left-0 right-0 mt-1 max-h-[220px] overflow-y-auto rounded-xl border border-white/10 bg-zinc-950 shadow-2xl">
                              {mortgageLeadRows.map((l: { id: string; full_name: string; phone?: string }) => (
                                <button
                                  key={l.id}
                                  type="button"
                                  className="w-full text-left px-3 py-2.5 text-sm text-white/80 hover:bg-white/5 hover:text-white border-b border-white/5 last:border-0"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setPartyFreeName(String(l.full_name || '').trim());
                                    setLeadSearch('');
                                    setLeadDropdownOpen(false);
                                  }}
                                >
                                  <span className="font-medium">{l.full_name}</span>
                                  {l.phone ? (
                                    <span className="ml-2 text-[11px] text-white/40">{l.phone}</span>
                                  ) : null}
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {leadDropdownOpen && mortgageLeadQ.length >= 2 && mortgageLeadRows.length === 0 ? (
                            <p className="text-[11px] text-amber-400/70 px-1">Лиды не найдены</p>
                          ) : null}
                          {partyFreeName.trim() ? (
                            <p className="text-xs text-white/55">
                              В записи: <span className="text-white font-medium">{partyFreeName}</span>
                            </p>
                          ) : null}
                        </div>
                      ) : selectedClient ? (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-emerald-300">{selectedClient.full_name.charAt(0)}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-white">{selectedClient.full_name}</p>
                            {selectedClient.phone ? <p className="text-[10px] text-white/50">{selectedClient.phone}</p> : null}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="shrink-0 text-white/50"
                            onClick={() => {
                              setSelectedClient(null);
                              setClientSearch('');
                              setNewClientData(null);
                            }}
                          >
                            ✕
                          </Button>
                        </div>
                      ) : newClientData ? (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-white">
                              {newClientData.full_name}{' '}
                              <span className="text-[9px] text-emerald-400 uppercase">(новый)</span>
                            </p>
                          </div>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setNewClientData(null)}>
                            ✕
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <ClientSearchInput
                            value={clientSearch}
                            onChange={(v) => {
                              setClientSearch(v);
                              setNewClientData(null);
                            }}
                            suggestions={clientSuggestions}
                            onSelect={(c) => {
                              setSelectedClient(c);
                              setClientSearch('');
                            }}
                            inputCls={clientInputClsSearch}
                          />
                          {clientSearch.length >= 2 && clientSuggestions.length === 0 && (
                            <ClientCreateInlineMini
                              defaultName={clientSearch}
                              onSave={(data) => setNewClientData(data)}
                              inputCls={clientInputClsMini}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </MFormField>

                <MFormField label="Филиал">
                  {isDirector ? (
                    <Select value={branchId || 'none'} onValueChange={(val) => setBranchId(val === 'none' ? '' : val)}>
                      <SelectTrigger className={`${selectTriggerCls} border-white/5`}>
                        <SelectValue placeholder="Выберите филиал" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-white/10">
                        <SelectItem value="none">Не выбрано</SelectItem>
                        {branchesForCompany.map((b: any) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.name || 'Филиал'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input readOnly value={lockedBranchLabel} className={`${inputCls} opacity-90 cursor-not-allowed`} />
                  )}
                </MFormField>
              </div>
            </MSection>
          </div>

          <MSection title="Участники" icon={<User className="h-5 w-5 text-primary" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MFormField label="Брокер (ипотека)">
                <Select value={brokerId || '__none'} onValueChange={handleBrokerPick}>
                  <SelectTrigger className={selectTriggerCls}>
                    <SelectValue placeholder="Выберите брокера" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-white/10">
                    <SelectItem value="__none">—</SelectItem>
                    {brokerOptionsForBranch.map((e: any) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {displayEmployeeName(e)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </MFormField>

              <MFormField label="Агент">
                <Select value={agentId || '__none'} onValueChange={handleAgentPick}>
                  <SelectTrigger className={selectTriggerCls}>
                    <SelectValue placeholder="Выберите агента" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-white/10">
                    <SelectItem value="__none">—</SelectItem>
                    {agentsForBranch.map((e: any) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {displayEmployeeName(e)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </MFormField>
            </div>
          </MSection>

          {(managerCanEditStatus || brokerPayoutStatus === 'paid') && (
            <MSection title="Статусы и выплата" icon={<Calculator className="h-5 w-5 text-amber-400" />}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {managerCanEditStatus && (
                  <MFormField label="Статус записи">
                    <Select value={status} onValueChange={(v: typeof status) => setStatus(v)}>
                      <SelectTrigger className={selectTriggerCls}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-white/10">
                        <SelectItem value="approved">Одобрено</SelectItem>
                        <SelectItem value="pending">Ожидает</SelectItem>
                        <SelectItem value="rejected">Отклонено</SelectItem>
                      </SelectContent>
                    </Select>
                  </MFormField>
                )}

                <MFormField label="Выплата брокеру">
                  <Select value={brokerPayoutStatus} onValueChange={(v: 'pending' | 'paid') => setBrokerPayoutStatus(v)}>
                    <SelectTrigger className={selectTriggerCls}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-950 border-white/10">
                      <SelectItem value="pending">Не выплачено</SelectItem>
                      <SelectItem value="paid">Выплачено</SelectItem>
                    </SelectContent>
                  </Select>
                </MFormField>

                {brokerPayoutStatus === 'paid' && (
                  <>
                    <MFormField label="Дата выплаты">
                      <Input type="date" value={brokerPaidAt} onChange={(e) => setBrokerPaidAt(e.target.value)} className={inputCls} />
                    </MFormField>
                    <MFormField label="Комментарий">
                      <Input value={brokerPaidNote} onChange={(e) => setBrokerPaidNote(e.target.value)} className={inputCls} />
                    </MFormField>
                  </>
                )}
              </div>
            </MSection>
          )}
        </div>

        {/* Тот же визуальный стиль футера, что у формы сделки; только суммы распределения ипотеки */}
        <div className="shrink-0 p-4 border-t border-white/10 bg-zinc-950/80 backdrop-blur flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6 flex-wrap justify-start w-full sm:w-auto">
            <div className="text-left min-w-[100px]">
              <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">Сумма услуги</p>
              <p className="text-2xl sm:text-3xl font-black text-primary tracking-tighter">{formatMoneyTrimTrailingZeros(costNum)}</p>
            </div>
            <div className="hidden sm:block w-px h-10 bg-white/10 shrink-0" />
            <div className="text-left min-w-[100px]">
              <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">Агент</p>
              <p className="text-xl font-black text-white/60 tracking-tighter">{formatMoneyTrimTrailingZeros(splits.agent_fee)}</p>
            </div>
            <div className="hidden sm:block w-px h-10 bg-white/10 shrink-0" />
            <div className="text-left min-w-[100px]">
              <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">Брокер</p>
              <p className="text-xl font-black text-white/60 tracking-tighter text-amber-400/80">
                {formatMoneyTrimTrailingZeros(splits.broker_share)}
              </p>
            </div>
            <div className="hidden sm:block w-px h-10 bg-white/10 shrink-0" />
            <div className="text-left min-w-[100px]">
              <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">Агентство</p>
              <p className="text-xl font-black text-emerald-400 tracking-tighter">
                {formatMoneyTrimTrailingZeros(splits.agency_share)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto shrink-0 justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="flex-1 sm:flex-none text-muted-foreground hover:text-white h-11 sm:h-12 px-4 sm:px-6 rounded-lg"
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={Boolean(isSubmitting) || createClientMutation.isPending}
              onClick={() => handleSave()}
              className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 text-white font-semibold h-11 sm:h-12 px-5 sm:px-7 rounded-lg font-black uppercase tracking-wider text-[10px]"
            >
              Сохранить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
