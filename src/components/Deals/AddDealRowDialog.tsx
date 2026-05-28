import { useState, useEffect, useMemo, useRef, memo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { localAPI } from '@/integrations/localAPI';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  Calendar, Building2, Users, Wallet,
  Info, FileText, Calculator,
  Clock, UserPlus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoneyTrimTrailingZeros, groupedIntegerInputDisplay, clampIntAmountFromDigits } from '@/utils/formatters';
import { useEmployeesData, useSharedData } from '@/hooks/useSharedData';
import { ClientCreateInlineMini, ClientSearchInput } from '@/components/clients/ClientSearchPickOrCreate';
import { useClientAccessCheck, useClientSearch, useCreateClient } from '@/hooks/useClients';

interface AddDealRowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingDeal?: any; // Keeping any for now as defining the full interface is too large for this fix
  onSuccess?: () => void;
  contextFilters?: {
    branch_id?: string;
    team_id?: string;
    agent_id?: string;
    agent_name?: string;
  };
}

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

type DealPartyMode = 'client' | 'lead' | 'external';

function PartyModeToggleBar({
  value,
  onChange,
}: {
  value: DealPartyMode;
  onChange: (next: DealPartyMode) => void;
}) {
  const cell = (m: DealPartyMode, label: string) => (
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

function coerceNumericField(v: unknown): number {
  const x = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(x) ? x : 0;
}

function displayEmployeeName(e: any): string {
  if (!e) return '';
  return (e.full_name || `${e.first_name || ''} ${e.last_name || ''}`.trim()).trim();
}

/** Один РОП на филиал: роль head_sales или должность с «РОП». */
function pickBranchRop(employees: any[], branchId: string | undefined | null): any | null {
  if (!branchId) return null;
  const inBranch = employees.filter((x: any) => x.branch_id === branchId && x.is_active);
  const byRole = inBranch.filter((x: any) => x.role === 'head_sales');
  if (byRole.length) return byRole[0];
  const byPos = inBranch.filter((x: any) => {
    const n = String(x.position?.name || '').toLowerCase();
    return n.includes('роп');
  });
  return byPos[0] || null;
}

/** Коммерческий директор в филиале. */
function pickBranchCommercialDirector(employees: any[], branchId: string | undefined | null): any | null {
  if (!branchId) return null;
  const inBranch = employees.filter((x: any) => x.branch_id === branchId && x.is_active);
  const byRole = inBranch.filter((x: any) => x.role === 'commercial');
  if (byRole.length) return byRole[0];
  const byPos = inBranch.filter((x: any) => {
    const n = String(x.position?.name || '').toLowerCase();
    return n.includes('коммерч');
  });
  return byPos[0] || null;
}

type RopRecipientOption = { id: string; name: string; percent: number; label: string };

/** Кому уходит доля «РОП» в сделке: штатный РОП филиала или коммерческий директор. */
function getRopRecipientOptions(employees: any[], branchId: string | undefined | null): RopRecipientOption[] {
  if (!branchId) return [];
  const rop = pickBranchRop(employees, branchId);
  const cd = pickBranchCommercialDirector(employees, branchId);
  const out: RopRecipientOption[] = [];
  if (rop?.id) {
    out.push({
      id: rop.id,
      name: displayEmployeeName(rop),
      percent: Number(rop.management_kpi_current) || 3,
      label: displayEmployeeName(rop)
    });
  }
  if (cd?.id && cd.id !== rop?.id) {
    out.push({
      id: cd.id,
      name: displayEmployeeName(cd),
      percent: Number(cd.management_kpi_current) || 3,
      label: displayEmployeeName(cd)
    });
  }
  return out;
}

function defaultRopFromBranch(employees: any[], branchId: string | undefined | null): RopRecipientOption {
  const opts = getRopRecipientOptions(employees, branchId);
  const preferred = pickBranchRop(employees, branchId);
  if (preferred?.id) {
    const o = opts.find((x) => x.id === preferred.id);
    if (o) return o;
  }
  return opts[0] || { id: '', name: '', percent: 0, label: '' };
}

/** Ипотечный брокер: роль или должность (в т.ч. «… ипотек … брокер …»). */
function isMortgageBrokerEmployee(e: any): boolean {
  if (!e?.is_active) return false;
  if (e.role === 'mortgage_broker') return true;
  const pos = String(e.position?.name || '').toLowerCase();
  if (pos.includes('ипотечный брокер')) return true;
  if (pos.includes('ипотек') && pos.includes('брокер')) return true;
  return false;
}

/**
 * Контекст для списка брокеров: филиал из формы → филиал выбранной команды (teams.branch_id) → филиал профиля.
 * Раньше при пустом branch_id в форме (или рассинхроне) список был пустой — в «Ипотеке» оставался только МОП.
 */
function brokerFilterContext(
  formBranchId: string | undefined,
  formTeamId: string | undefined,
  teams: any[],
  profileBranchId: string | undefined | null
): { branchId: string; teamId: string } {
  const teamId = String(formTeamId || '').trim();
  let branchFromTeam = '';
  if (teamId && Array.isArray(teams)) {
    const t = teams.find((x: any) => String(x?.id) === teamId);
    branchFromTeam = String(t?.branch_id || '').trim();
  }
  const branchId =
    String(formBranchId || '').trim() ||
    branchFromTeam ||
    String(profileBranchId || '').trim();
  return { branchId, teamId };
}

/** Все МОПы филиала = руководители команд (teams.leader_id) по выбранному branchId. */
function branchTeamLeaderMopOptions(
  branchId: string,
  teams: any[],
  employees: any[]
): { id: string; label: string }[] {
  if (!branchId || !Array.isArray(teams)) return [];
  const out: { id: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const t of teams) {
    if (String(t?.branch_id || '').trim() !== String(branchId).trim()) continue;
    const lid = t?.leader_id != null ? String(t.leader_id).trim() : '';
    if (!lid || seen.has(lid)) continue;
    seen.add(lid);
    const emp = employees.find((e: any) => String(e?.id) === lid);
    const name =
      displayEmployeeName(emp) ||
      String(t?.leader_name || '').trim() ||
      lid;
    out.push({ id: lid, label: name });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}

function isUuidString(v: unknown): boolean {
  const s = String(v ?? '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function uuidOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return isUuidString(s) ? s : null;
}

/** МОП = руководитель команды (teams.leader_id → profiles; имя из списка команд, если сотрудник не в кэше). */
function mopFromTeamLeader(teamId: string | undefined | null, teams: any[], employees: any[]) {
  if (!teamId) return { mop_id: '', mop_name: '', mop_percent: 0 };
  const tid = String(teamId).trim();
  const team = teams.find((t: any) => String(t?.id) === tid);
  const leaderId = team?.leader_id != null ? String(team.leader_id).trim() : '';
  const leader = leaderId ? employees.find((e: any) => String(e?.id) === leaderId) : undefined;
  const nameFromList = String(team?.leader_name || '').trim();
  return {
    mop_id: leaderId || '',
    mop_name: displayEmployeeName(leader) || nameFromList,
    mop_percent: Number(leader?.management_kpi_current) || 0
  };
}

function buildDealTableRequestBody(
  data: Record<string, any>,
  ctx: {
    profile: any;
    user: any;
    isEdit: boolean;
    currentYear: number;
    currentMonth: number;
  }
): Record<string, unknown> {
  const { profile, user, isEdit, currentYear, currentMonth } = ctx;
  const y = Math.round(Number(data.year));
  const m = Math.round(Number(data.month));
  const teamId = uuidOrNull(data.team_id);
  const branchId = uuidOrNull(data.branch_id);
  const agentId = uuidOrNull(data.agent_id);
  const ropId = uuidOrNull(data.rop_id);
  const mopId = uuidOrNull(data.mop_id);
  const mortgageCred = uuidOrNull(data.mortgage_credited_id);

  const num = (v: unknown) => {
    const x = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(x) ? x : 0;
  };

  const company =
    uuidOrNull(profile?.company_id) || '00000000-0000-0000-0000-000000000001';

  return {
    month: Number.isFinite(m) && m >= 1 && m <= 12 ? m : currentMonth,
    year: Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : currentYear,
    property_name: String(data.property_name ?? '').trim(),
    document_type: String(data.document_type ?? 'ДДУ').trim() || 'ДДУ',
    seller: String(data.seller ?? ''),
    buyer: String(data.buyer ?? ''),
    service: String(data.service ?? ''),
    information: String(data.information ?? ''),
    agent_name: String(data.agent_name ?? '').trim(),
    mop_name: String(data.mop_name ?? ''),
    rop_name: String(data.rop_name ?? ''),
    deposit_date: String(data.deposit_date ?? ''),
    deal_date: String(data.deal_date ?? ''),
    payment_date: String(data.payment_date ?? ''),
    comment: String(data.comment ?? ''),
    document_link: String(data.document_link ?? ''),
    payout_date: String(data.payout_date ?? ''),
    payout_mop_note: String(data.payout_mop_note ?? ''),
    payout_rop_note: String(data.payout_rop_note ?? ''),
    commission_seller_plan: num(data.commission_seller_plan),
    commission_buyer_plan: num(data.commission_buyer_plan),
    commission_seller_fact: num(data.commission_seller_fact),
    commission_buyer_fact: num(data.commission_buyer_fact),
    agent_percent_seller: num(data.agent_percent_seller),
    agent_percent_buyer: num(data.agent_percent_buyer),
    mop_percent: num(data.mop_percent),
    rop_percent: num(data.rop_percent),
    mortgage_deduction: num(data.mortgage_deduction),
    mortgage: num(data.mortgage_deduction) > 0 ? 1 : 0,
    team_id: isEdit ? teamId : teamId ?? uuidOrNull(profile?.team_id),
    branch_id: isEdit ? branchId : branchId ?? uuidOrNull(profile?.branch_id),
    company_id: company,
    agent_id: agentId ?? (!isEdit ? uuidOrNull(profile?.id) ?? uuidOrNull(user?.id) : null),
    rop_id: ropId,
    mop_id: mopId,
    mortgage_credited_id: mortgageCred,
    subcontractor_id: uuidOrNull(data.subcontractor_id),
    subcontractor_amount: num(data.subcontractor_amount),
    ...(data.status ? { status: String(data.status) } : {})
  };
}

const AddDealRowDialog = memo(function AddDealRowDialog({ open, onOpenChange, editingDeal, onSuccess, contextFilters }: AddDealRowDialogProps) {
  const queryClient = useQueryClient();
  const { user, accessLevel } = useAuth();
  const { data: employees = [] } = useEmployeesData();
  const { branches, teams } = useSharedData();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Fetch user's profile to get team info
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await localAPI.request(`/profiles/${user.id}`);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && open,
    staleTime: 600000,
    gcTime: 900000
  });

  const lastAutofillKeyRef = useRef('');
  const lastLoadedEditDealIdRef = useRef<string | null>(null);
  
  const [formData, setFormData] = useState({
    month: currentMonth,
    year: currentYear,
    property_name: '',
    document_type: 'ДДУ',
    seller: '',
    buyer: '',
    agent_name: '',
    rop_name: '',
    mop_name: '',
    service: 'Вторичка',
    information: '',
    mortgage_deduction: 0,
    mortgage: 0,
    deposit_date: '',
    deal_date: '',
    payment_date: '',
    commission_seller_plan: 0,
    commission_buyer_plan: 0,
    commission_seller_fact: 0,
    commission_buyer_fact: 0,
    agent_percent_seller: 50 as number | string,
    agent_percent_buyer: 50 as number | string,
    mop_percent: 0 as number | string,
    rop_percent: 0 as number | string,
    payout_date: '',
    payout_mop_note: '',
    payout_rop_note: '',
    document_link: '',
    comment: '',
    agent_id: '',
    team_id: '',
    branch_id: '',
    rop_id: '',
    mop_id: '',
    mortgage_credited_id: '',
    subcontractor_id: '',
    subcontractor_amount: 0
  });

  const [buyerPartyType, setBuyerPartyType] = useState<DealPartyMode>('client');
  const [buyerClientSearch, setBuyerClientSearch] = useState('');
  const [selectedBuyerClient, setSelectedBuyerClient] = useState<{ id: string; full_name: string; phone: string } | null>(
    null
  );
  const [newBuyerClientData, setNewBuyerClientData] = useState<{
    full_name: string;
    phone: string;
    birthday?: string;
    comment?: string;
  } | null>(null);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadDropdownOpen, setLeadDropdownOpen] = useState(false);
  const leadsPickRef = useRef<HTMLDivElement>(null);

  const [sellerPartyType, setSellerPartyType] = useState<DealPartyMode>('external');
  const [sellerClientSearch, setSellerClientSearch] = useState('');
  const [selectedSellerClient, setSelectedSellerClient] = useState<{ id: string; full_name: string; phone: string } | null>(
    null
  );
  const [newSellerClientData, setNewSellerClientData] = useState<{
    full_name: string;
    phone: string;
    birthday?: string;
    comment?: string;
  } | null>(null);
  const [sellerLeadSearch, setSellerLeadSearch] = useState('');
  const [sellerLeadDropdownOpen, setSellerLeadDropdownOpen] = useState(false);
  const sellerLeadsPickRef = useRef<HTMLDivElement>(null);

  const { data: clientAccessCheck } = useClientAccessCheck();
  const clientRestricted = Boolean(clientAccessCheck?.restricted);
  const { data: buyerClientSuggestions = [] } = useClientSearch(buyerClientSearch);
  const { data: sellerClientSuggestions = [] } = useClientSearch(sellerClientSearch);
  const createClientMutation = useCreateClient();

  const leadQ = leadSearch.trim();
  const { data: rawLeadRows = [] } = useQuery({
    queryKey: ['deal-dialog-leads', 'buyer', leadQ],
    queryFn: async () => {
      const { data, error } = await localAPI.request(
        `/leads?search=${encodeURIComponent(leadQ)}&limit=35&page=1`
      );
      if (error) throw error;
      return Array.isArray((data as { leads?: unknown[] })?.leads) ? (data as { leads: any[] }).leads : [];
    },
    enabled: open && buyerPartyType === 'lead' && leadQ.length >= 2,
    staleTime: 15000,
  });

  const sellerLeadQ = sellerLeadSearch.trim();
  const { data: rawSellerLeadRows = [] } = useQuery({
    queryKey: ['deal-dialog-leads', 'seller', sellerLeadQ],
    queryFn: async () => {
      const { data, error } = await localAPI.request(
        `/leads?search=${encodeURIComponent(sellerLeadQ)}&limit=35&page=1`
      );
      if (error) throw error;
      return Array.isArray((data as { leads?: unknown[] })?.leads) ? (data as { leads: any[] }).leads : [];
    },
    enabled: open && sellerPartyType === 'lead' && sellerLeadQ.length >= 2,
    staleTime: 15000,
  });

  useEffect(() => {
    if (!open) {
      setBuyerPartyType('client');
      setBuyerClientSearch('');
      setSelectedBuyerClient(null);
      setNewBuyerClientData(null);
      setLeadSearch('');
      setLeadDropdownOpen(false);
      setSellerPartyType('external');
      setSellerClientSearch('');
      setSelectedSellerClient(null);
      setNewSellerClientData(null);
      setSellerLeadSearch('');
      setSellerLeadDropdownOpen(false);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (leadsPickRef.current?.contains(t)) return;
      if (sellerLeadsPickRef.current?.contains(t)) return;
      setLeadDropdownOpen(false);
      setSellerLeadDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const effectiveTeamId = useMemo(() => {
    if (!open) return '';
    const agentTeam = formData.agent_id
      ? employees.find((e: any) => e.id === formData.agent_id)?.team_id
      : '';
    if (editingDeal?.id) {
      return (
        (formData.team_id && String(formData.team_id).trim()) ||
        (editingDeal.team_id && String(editingDeal.team_id).trim()) ||
        (agentTeam && String(agentTeam).trim()) ||
        (profile?.team_id && String(profile.team_id).trim()) ||
        ''
      );
    }
    return (
      (formData.team_id && String(formData.team_id).trim()) ||
      (agentTeam && String(agentTeam).trim()) ||
      (profile?.team_id && String(profile.team_id).trim()) ||
      ''
    );
  }, [
    open,
    editingDeal?.id,
    editingDeal?.team_id,
    formData.team_id,
    formData.agent_id,
    employees,
    profile?.team_id
  ]);

  const teamLeader = useMemo(() => {
    if (!effectiveTeamId) return null;
    const team = teams.find((t: any) => t.id === effectiveTeamId);
    if (!team?.leader_id) return null;
    return employees.find((e: any) => e.id === team.leader_id) || null;
  }, [effectiveTeamId, teams, employees]);

  const branchIdForRop = formData.branch_id || profile?.branch_id;

  const ropRecipientOptions = useMemo(
    () => getRopRecipientOptions(employees, branchIdForRop),
    [employees, branchIdForRop]
  );

  const ropSelectOptions = useMemo(() => {
    const base = getRopRecipientOptions(employees, branchIdForRop);
    if (formData.rop_id && !base.some((o) => o.id === formData.rop_id)) {
      return [
        ...base,
        {
          id: formData.rop_id,
          name: formData.rop_name || '',
          percent: Number(formData.rop_percent) || 3,
          label: `${formData.rop_name || 'Сотрудник'} (в сделке)`
        }
      ];
    }
    return base;
  }, [employees, branchIdForRop, formData.rop_id, formData.rop_name, formData.rop_percent]);

  const resolvedBranchRop = useMemo(() => {
    if (editingDeal) return { name: '', id: '', percent: 0 };
    const d = defaultRopFromBranch(employees, branchIdForRop);
    return { name: d.name, id: d.id, percent: d.percent };
  }, [editingDeal, employees, branchIdForRop]);

  const resolvedMop = useMemo(() => {
    if (editingDeal) return { name: '', id: '', percent: 0 };
    const name = displayEmployeeName(teamLeader);
    const id = teamLeader?.id || '';
    const percent = Number(teamLeader?.management_kpi_current) || 0;
    return { name, id, percent };
  }, [editingDeal, teamLeader]);

  const branchBrokers = useMemo(() => {
    const { branchId, teamId } = brokerFilterContext(
      formData.branch_id,
      formData.team_id,
      teams,
      profile?.branch_id
    );
    return employees.filter((e: any) => {
      if (!isMortgageBrokerEmployee(e)) return false;
      if (branchId && String(e.branch_id || '').trim() === branchId) return true;
      if (teamId && String(e.team_id || '').trim() === teamId) return true;
      return false;
    });
  }, [employees, formData.branch_id, formData.team_id, teams, profile?.branch_id]);

  const mortgageRecipientOptions = useMemo(() => {
    const { branchId } = brokerFilterContext(
      formData.branch_id,
      formData.team_id,
      teams,
      profile?.branch_id
    );
    const byId = new Map<string, { id: string; label: string }>();

    for (const o of branchTeamLeaderMopOptions(branchId, teams, employees)) {
      byId.set(o.id, o);
    }

    if (String(formData.mop_id || '').trim()) {
      const lid = String(formData.mop_id).trim();
      if (!byId.has(lid)) {
        byId.set(lid, {
          id: lid,
          label: formData.mop_name || 'руководитель команды'
        });
      }
    }

    for (const b of branchBrokers) {
      if (!b?.id) continue;
      const bid = String(b.id);
      if (byId.has(bid)) continue;
      byId.set(bid, { id: bid, label: displayEmployeeName(b) });
    }

    return Array.from(byId.values());
  }, [
    formData.branch_id,
    formData.team_id,
    formData.mop_id,
    formData.mop_name,
    teams,
    employees,
    branchBrokers,
    profile?.branch_id
  ]);

  // Загрузка формы: при редактировании — строго с сервера; при создании — автозаполнение.
  useEffect(() => {
    if (!open) {
      lastAutofillKeyRef.current = '';
      lastLoadedEditDealIdRef.current = null;
      return;
    }

    if (editingDeal?.id) {
      if (lastLoadedEditDealIdRef.current === editingDeal.id) return;
      lastLoadedEditDealIdRef.current = editingDeal.id;
      setFormData({
        month: editingDeal.month ?? currentMonth,
        year: editingDeal.year ?? currentYear,
        property_name: editingDeal.property_name || '',
        document_type: editingDeal.document_type || 'ДДУ',
        seller: editingDeal.seller || '',
        buyer: editingDeal.buyer || '',
        agent_name: editingDeal.agent_name || '',
        rop_name: editingDeal.rop_name ?? '',
        rop_id: editingDeal.rop_id ?? '',
        rop_percent: coerceNumericField(editingDeal.rop_percent ?? 0),
        mop_name: editingDeal.mop_name ?? '',
        mop_id: editingDeal.mop_id ?? '',
        mortgage_credited_id: editingDeal.mortgage_credited_id ?? '',
        subcontractor_id: editingDeal.subcontractor_id ?? '',
        subcontractor_amount: coerceNumericField(editingDeal.subcontractor_amount ?? 0),
        mortgage: editingDeal.mortgage !== undefined ? Number(editingDeal.mortgage) : (Number(editingDeal.mortgage_deduction) > 0 ? 1 : 0),
        service: editingDeal.service || 'Вторичка',
        information: editingDeal.information || '',
        mortgage_deduction: coerceNumericField(editingDeal.mortgage_deduction),
        deposit_date: editingDeal.deposit_date || '',
        deal_date: editingDeal.deal_date || '',
        payment_date: editingDeal.payment_date || '',
        commission_seller_plan: coerceNumericField(editingDeal.commission_seller_plan),
        commission_buyer_plan: coerceNumericField(editingDeal.commission_buyer_plan),
        commission_seller_fact: coerceNumericField(editingDeal.commission_seller_fact),
        commission_buyer_fact: coerceNumericField(editingDeal.commission_buyer_fact),
        agent_percent_seller: coerceNumericField(editingDeal.agent_percent_seller ?? 50),
        agent_percent_buyer: coerceNumericField(editingDeal.agent_percent_buyer ?? 50),
        mop_percent: coerceNumericField(editingDeal.mop_percent ?? 0),
        payout_date: editingDeal.payout_date || '',
        payout_mop_note: editingDeal.payout_mop_note || '',
        payout_rop_note: editingDeal.payout_rop_note || '',
        document_link: editingDeal.document_link || '',
        comment: editingDeal.comment || '',
        agent_id: editingDeal.agent_id || '',
        team_id: editingDeal.team_id || '',
        branch_id: editingDeal.branch_id || ''
      });
      setBuyerPartyType('external');
      setSellerPartyType('external');
      setBuyerClientSearch('');
      setSelectedBuyerClient(null);
      setNewBuyerClientData(null);
      setLeadSearch('');
      setLeadDropdownOpen(false);
      setSellerClientSearch('');
      setSelectedSellerClient(null);
      setNewSellerClientData(null);
      setSellerLeadSearch('');
      setSellerLeadDropdownOpen(false);
      return;
    }

    lastLoadedEditDealIdRef.current = null;
    if (!profile) return;

    const autofillKey = [
      'new',
      contextFilters?.branch_id || '',
      contextFilters?.team_id || '',
      contextFilters?.agent_id || '',
      contextFilters?.agent_name || '',
      employees.length,
      teams.length
    ].join('|');
    if (lastAutofillKeyRef.current === autofillKey) {
      return;
    }
    lastAutofillKeyRef.current = autofillKey;

    const fullName = profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
    const shouldAutofillAgentName = accessLevel < 90;

    const ctxBranchId = contextFilters?.branch_id || profile?.branch_id || '';
    const ctxTeamId = contextFilters?.team_id || profile?.team_id || '';

    // Resolve agent from contextFilters (agent_id or agent_name)
    let ctxAgentId = contextFilters?.agent_id || '';
    let ctxAgentName = contextFilters?.agent_id
      ? (employees.find((e: any) => e.id === contextFilters?.agent_id)?.full_name || '')
      : '';
    if (!ctxAgentId && contextFilters?.agent_name) {
      const matched = employees.find((e: any) => {
        const name = (e.full_name || `${e.first_name || ''} ${e.last_name || ''}`.trim()).trim();
        return name === contextFilters?.agent_name?.trim();
      });
      if (matched) {
        ctxAgentId = matched.id;
        ctxAgentName = matched.full_name || `${matched.first_name || ''} ${matched.last_name || ''}`.trim();
      } else {
        ctxAgentName = contextFilters?.agent_name || '';
      }
    }
    if (!ctxAgentId && shouldAutofillAgentName) {
      ctxAgentId = profile?.id || user?.id || '';
      ctxAgentName = fullName;
    }


    const { branchId: bcBranch, teamId: bcTeam } = brokerFilterContext(
      ctxBranchId,
      ctxTeamId,
      teams,
      ctxBranchId
    );
    const brokersHere = employees.filter((e: any) => {
      if (!isMortgageBrokerEmployee(e)) return false;
      if (bcBranch && String(e.branch_id || '').trim() === bcBranch) return true;
      if (bcTeam && String(e.team_id || '').trim() === bcTeam) return true;
      return false;
    });
    const defaultMortgageId =
      brokersHere.length === 1
        ? brokersHere[0].id
        : (resolvedMop.id || resolvedBranchRop.id || '');

    setFormData(prev => ({
      ...prev,
      month: currentMonth,
      year: currentYear,
      property_name: '',
      document_type: 'ДДУ',
      seller: '',
      buyer: '',
      agent_name: ctxAgentName,
      rop_name: resolvedBranchRop.name,
      rop_id: resolvedBranchRop.id,
      rop_percent: resolvedBranchRop.percent,
      mop_name: resolvedMop.name || '',
      mop_id: resolvedMop.id,
      mop_percent: resolvedMop.percent,
      mortgage_credited_id: defaultMortgageId,
      mortgage: profile?.role === 'mortgage_broker' ? 1 : (brokersHere.length > 0 || resolvedMop.id ? 1 : 0),
      service: 'Вторичка',
      information: '',
      mortgage_deduction: 0,
      deposit_date: '',
      deal_date: '',
      payment_date: '',
      commission_seller_plan: 0,
      commission_buyer_plan: 0,
      commission_seller_fact: 0,
      commission_buyer_fact: 0,
      agent_percent_seller: 50,
      agent_percent_buyer: 50,
      payout_date: '',
      payout_mop_note: '',
      payout_rop_note: '',
      document_link: '',
      comment: '',
      agent_id: ctxAgentId,
      team_id: ctxTeamId,
      branch_id: ctxBranchId,
      subcontractor_id: '',
      subcontractor_amount: 0
    }));
  }, [open, editingDeal?.id, profile, accessLevel, currentMonth, currentYear, resolvedBranchRop, resolvedMop, employees, user?.id, editingDeal, teams, contextFilters]);

  useEffect(() => {
    if (!open) return;
    if (editingDeal) return;
    if (!resolvedBranchRop.name && !resolvedBranchRop.id) return;

    setFormData(prev => (prev.rop_id?.trim() ? prev : { ...prev, rop_name: resolvedBranchRop.name, rop_id: resolvedBranchRop.id, rop_percent: resolvedBranchRop.percent }));
  }, [open, editingDeal, resolvedBranchRop]);

  useEffect(() => {
    if (!open || editingDeal) return;
    const ids = mortgageRecipientOptions.map((o) => o.id);
    if (ids.length === 0) return;
    setFormData((prev) => {
      if (prev.mortgage_credited_id && ids.includes(prev.mortgage_credited_id)) return prev;
      const preferred =
        (prev.mop_id && ids.includes(String(prev.mop_id)) ? String(prev.mop_id) : null) || ids[0];
      return { ...prev, mortgage_credited_id: preferred };
    });
  }, [open, editingDeal, mortgageRecipientOptions]);

  // МОП всегда = руководитель команды по данным сервера (/teams/:id + profile), а не устаревший mop из БД или урезанный кэш списка команд.
  useEffect(() => {
    if (!open) return;
    if (!effectiveTeamId?.trim() || !teamLeader?.id) return;
    const tid = String(effectiveTeamId).trim();
    const name = displayEmployeeName(teamLeader);
    setFormData((prev) => {
      if (String(prev.team_id || '').trim() !== tid) return prev;
      if (prev.mop_id === teamLeader.id && prev.mop_name === name) return prev;
      return {
        ...prev,
        mop_id: teamLeader.id,
        mop_name: name,
        mop_percent: Number(teamLeader.management_kpi_current) || Number(prev.mop_percent) || 0
      };
    });
  }, [open, effectiveTeamId, teamLeader]);

  // Редактирование: mortgage_credited_id из сделки или первый доступный вариант.
  useEffect(() => {
    if (!open || !editingDeal?.id) return;
    const saved = editingDeal.mortgage_credited_id;
    const ids = mortgageRecipientOptions.map(o => o.id);
    if (ids.length === 0) return;
    setFormData((prev) => {
      if (prev.mortgage_credited_id && ids.includes(prev.mortgage_credited_id)) return prev;
      if (saved && ids.includes(saved)) return { ...prev, mortgage_credited_id: saved };
      const preferred =
        (prev.mop_id && ids.includes(String(prev.mop_id)) ? String(prev.mop_id) : null) || ids[0];
      return { ...prev, mortgage_credited_id: preferred };
    });
  }, [open, editingDeal?.id, editingDeal?.mortgage_credited_id, mortgageRecipientOptions]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = buildDealTableRequestBody(data as Record<string, any>, {
        profile,
        user,
        isEdit: !!editingDeal,
        currentYear,
        currentMonth
      });
      if (editingDeal) {
        const { error } = await localAPI.request(`/deal-table/${editingDeal.id}`, {
          method: 'PUT',
          body: payload
        });
        if (error) throw error;
      } else {
        const { error } = await localAPI.request('/deal-table', {
          method: 'POST',
          body: payload
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      // Invalidate actual deal queries used by the UI
      queryClient.invalidateQueries({ queryKey: ['role-based-deals'] });
      queryClient.invalidateQueries({ queryKey: ['role-based-totals'] });
      queryClient.invalidateQueries({ queryKey: ['drill-down-grouped'] });
      queryClient.invalidateQueries({ queryKey: ['drill-down-detailed'] });
      queryClient.invalidateQueries({ queryKey: ['drill-down-totals'] });
      queryClient.invalidateQueries({ queryKey: ['grouped-deals'] });

      // Analytics/KPI depend on deals
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['kpi'] });

      // Invalidate employee stats widgets where deals are shown
      queryClient.invalidateQueries({ queryKey: ['employee-deal-stats'] });

      // Invalidate salary data (payroll depends on deals)
      queryClient.invalidateQueries({ queryKey: ['salaries'] });
      queryClient.invalidateQueries({ queryKey: ['salary-deals'] });

      // Invalidate finances (commissions depend on deals)
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['finance-stats'] });
      queryClient.invalidateQueries({ queryKey: ['finance-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['salaried-employees-list'] });

      // Invalidate shared reference data (only if it exists in cache)
      queryClient.invalidateQueries({ queryKey: ['profile'] });

      // (Other very broad invalidations removed to avoid network spam)


      // Invalidate KPI queries to update real-time
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ['dual-kpi', user.id] });
        queryClient.invalidateQueries({ queryKey: ['my-kpi-stats-detailed'] });
      }

      toast.success(editingDeal ? 'Сделка сохранена' : 'Сделка добавлена');
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Ошибка при сохранении');
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.agent_name?.trim()) {
      toast.error('Укажите агента');
      return;
    }

    // deposit_date, deal_date, payment_date are optional on creation (draft),
    // but required when submitting for approval (enforced by backend)
    if (!formData.payout_date) {
      toast.error('Укажите дату выплаты');
      return;
    }

    let buyerResolved = String(formData.buyer ?? '').trim();
    let sellerResolved = String(formData.seller ?? '').trim();

    if (!clientRestricted) {
      if (buyerPartyType === 'lead') {
        if (!buyerResolved) {
          toast.error('Выберите лида из списка (покупатель)');
          return;
        }
      } else if (buyerPartyType === 'external') {
        buyerResolved = String(formData.buyer ?? '').trim();
      } else {
        try {
          if (newBuyerClientData?.full_name?.trim()) {
            const digits = String(newBuyerClientData.phone || '').replace(/\D/g, '');
            if (digits.length < 10) {
              toast.error('Для нового клиента нужен номер телефона');
              return;
            }
            const created = await createClientMutation.mutateAsync({
              full_name: newBuyerClientData.full_name.trim(),
              phone: newBuyerClientData.phone,
              birthday: newBuyerClientData.birthday,
              comment: newBuyerClientData.comment,
              status: 'new',
            });
            buyerResolved = created.full_name;
          } else if (selectedBuyerClient?.full_name?.trim()) {
            buyerResolved = selectedBuyerClient.full_name.trim();
          } else if (buyerClientSearch.trim()) {
            buyerResolved = buyerClientSearch.trim();
          }
        } catch {
          return;
        }
      }

      if (sellerPartyType === 'lead') {
        if (!sellerResolved) {
          toast.error('Выберите лида из списка (продавец)');
          return;
        }
      } else if (sellerPartyType === 'external') {
        sellerResolved = String(formData.seller ?? '').trim();
      } else {
        try {
          if (newSellerClientData?.full_name?.trim()) {
            const digits = String(newSellerClientData.phone || '').replace(/\D/g, '');
            if (digits.length < 10) {
              toast.error('Для нового клиента нужен номер телефона (продавец)');
              return;
            }
            const created = await createClientMutation.mutateAsync({
              full_name: newSellerClientData.full_name.trim(),
              phone: newSellerClientData.phone,
              birthday: newSellerClientData.birthday,
              comment: newSellerClientData.comment,
              status: 'new',
            });
            sellerResolved = created.full_name;
          } else if (selectedSellerClient?.full_name?.trim()) {
            sellerResolved = selectedSellerClient.full_name.trim();
          } else if (sellerClientSearch.trim()) {
            sellerResolved = sellerClientSearch.trim();
          }
        } catch {
          return;
        }
      }
    }

    const submissionData = {
      ...formData,
      buyer: buyerResolved,
      seller: sellerResolved,
      mortgage_deduction: parseFloat(String(formData.mortgage_deduction)) || 0,
      commission_seller_plan: parseFloat(String(formData.commission_seller_plan)) || 0,
      commission_buyer_plan: parseFloat(String(formData.commission_buyer_plan)) || 0,
      commission_seller_fact: parseFloat(String(formData.commission_seller_fact)) || 0,
      commission_buyer_fact: parseFloat(String(formData.commission_buyer_fact)) || 0,
      agent_percent_seller: parseFloat(String(formData.agent_percent_seller)) || 0,
      agent_percent_buyer: parseFloat(String(formData.agent_percent_buyer)) || 0,
      mop_percent: parseFloat(String(formData.mop_percent)) || 0,
      rop_percent: parseFloat(String(formData.rop_percent)) || 0,
      mortgage: (parseFloat(String(formData.mortgage_deduction)) || 0) > 0 ? 1 : 0,
      // Revert rejected deal to draft on edit so it can be resubmitted
      ...(editingDeal?.status === 'rejected' ? { status: 'draft' } : {}),
    };

    createMutation.mutate(submissionData);
  };

  // const shouldHideAgentField = accessLevel < 30; // Unused
  // const showRopField = accessLevel >= 90; // Unused
  // const shouldHideRopField = !showRopField; // Unused

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          ['--dialog-content-max-width' as any]: '1500px',
        }}
        className="w-[calc(100vw-1.5rem)] sm:w-[98vw] max-w-[1500px] h-[calc(100vh-1.5rem)] max-h-[calc(100vh-1.5rem)] overflow-hidden bg-zinc-950/98 border-white/10 p-0 rounded-xl shadow-2xl flex flex-col"
      >
        {/* Header - Fixed & Clean */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-zinc-900/50 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg sm:text-xl font-semibold text-white truncate">
                  {editingDeal ? 'Редактирование сделки' : 'Новая сделка'}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {MONTH_NAMES[formData.month - 1]} {formData.year}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content - More Spacing */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
          <form onSubmit={handleSubmit} id="deal-form" className="space-y-8 sm:space-y-10 pb-28">

            {/* Primary Grid: Context & Object */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12">
              <Section
                title="Период и тип"
                icon={<Calendar className="h-5 w-5 text-primary" />}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField label="Месяц" className="md:col-span-2" required>
                    <Select value={formData.month.toString()} onValueChange={(v: string) => setFormData({ ...formData, month: parseInt(v) })}>
                      <SelectTrigger className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl focus:ring-primary/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-white/10">
                        {MONTH_NAMES.map((name, idx) => (
                          <SelectItem key={idx + 1} value={(idx + 1).toString()} className="focus:bg-primary/20">{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Год" required>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={formData.year}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, year: parseInt(e.target.value) || currentYear })}
                      className="bg-white/[0.03] border-white/5 h-14 text-base font-mono font-medium rounded-2xl"
                    />
                  </FormField>
                  <FormField label="Документ" required>
                    <Select value={formData.document_type} onValueChange={(v: string) => setFormData({ ...formData, document_type: v })}>
                      <SelectTrigger className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-white/10">
                        {['ДДУ', 'ДКП', 'Аренда', 'Другое'].map(t => (
                          <SelectItem key={t} value={t} className="focus:bg-primary/20">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                </div>
              </Section>

              <Section
                title="Объект и сервис"
                icon={<Building2 className="h-5 w-5 text-emerald-400" />}
              >
                <div className="space-y-4 sm:space-y-6">
                  <FormField label="Название ЖК / Объекта" required>
                    <Input
                      value={formData.property_name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, property_name: e.target.value })}
                      required
                      placeholder="Например: ЖК Одинцово, корпус 5"
                      className="bg-white/[0.03] border-white/5 h-14 text-base font-bold rounded-2xl focus:border-primary/30"
                    />
                  </FormField>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField label="Вид услуги" required>
                      <Select 
                        value={formData.service} 
                        onValueChange={(v: string) => setFormData({ ...formData, service: v })}
                      >
                        <SelectTrigger className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl">
                          <SelectValue placeholder="Выберите услугу" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-950 border-white/10">
                          {['Вторичка', 'Новостройка', 'Ипотека'].map(t => (
                            <SelectItem key={t} value={t} className="focus:bg-primary/20">{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Источник" required>
                      <Input
                        value={formData.information}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, information: e.target.value })}
                        placeholder="Рекомендация..."
                        className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl"
                      />
                    </FormField>
                  </div>
                </div>
              </Section>
            </div>

            {/* Steps & Parties */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8">
              <Section
                title="Стороны"
                icon={<Users className="h-5 w-5 text-indigo-400" />}
                className="lg:col-span-1"
              >
                <div className="space-y-4 sm:space-y-6">
                  <FormField label="Продавец" required>
                    {clientRestricted ? (
                      <Input
                        value={formData.seller}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, seller: e.target.value })}
                        placeholder="ФИО или ООО"
                        className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl"
                      />
                    ) : (
                      <div className="space-y-3">
                        <PartyModeToggleBar
                          value={sellerPartyType}
                          onChange={(m) => {
                            if (m === 'external') {
                              const name =
                                selectedSellerClient?.full_name?.trim() ||
                                newSellerClientData?.full_name?.trim() ||
                                sellerClientSearch.trim() ||
                                formData.seller.trim();
                              setFormData((p) => ({ ...p, seller: name }));
                              setSellerClientSearch('');
                              setSelectedSellerClient(null);
                              setNewSellerClientData(null);
                              setSellerLeadSearch('');
                              setSellerLeadDropdownOpen(false);
                            }
                            if (m === 'client') {
                              setSellerLeadSearch('');
                              setSellerLeadDropdownOpen(false);
                            }
                            if (m === 'lead') {
                              setSellerClientSearch('');
                              setSelectedSellerClient(null);
                              setNewSellerClientData(null);
                            }
                            setSellerPartyType(m);
                          }}
                        />

                        {sellerPartyType === 'external' ? (
                          <Input
                            value={formData.seller}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              setFormData({ ...formData, seller: e.target.value })
                            }
                            placeholder="ФИО, ООО или произвольное название"
                            className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl"
                          />
                        ) : sellerPartyType === 'client' ? (
                          <div className="space-y-3">
                            {selectedSellerClient ? (
                              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold truncate text-white">{selectedSellerClient.full_name}</p>
                                  {selectedSellerClient.phone ? (
                                    <p className="text-[10px] text-white/50">{selectedSellerClient.phone}</p>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  className="shrink-0 text-white/50 px-2"
                                  onClick={() => {
                                    setSelectedSellerClient(null);
                                    setFormData((p) => ({ ...p, seller: '' }));
                                  }}
                                  aria-label="Сбросить"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : newSellerClientData ? (
                              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <p className="text-sm font-medium text-white truncate">
                                  {newSellerClientData.full_name}{' '}
                                  <span className="text-[9px] text-emerald-400 uppercase font-bold">(новый клиент)</span>
                                </p>
                                <button type="button" className="shrink-0 text-white/50" onClick={() => setNewSellerClientData(null)}>
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <>
                                <ClientSearchInput
                                  value={sellerClientSearch}
                                  onChange={(v) => {
                                    setSellerClientSearch(v);
                                    setNewSellerClientData(null);
                                    setFormData((p) => ({ ...p, seller: v }));
                                  }}
                                  suggestions={sellerClientSuggestions}
                                  onSelect={(c) => {
                                    setSelectedSellerClient(c);
                                    setSellerClientSearch('');
                                    setFormData((p) => ({ ...p, seller: c.full_name }));
                                  }}
                                  inputCls={cn(
                                    'bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl normal-case tracking-normal'
                                  )}
                                  placeholder="Поиск клиента или введите ФИО..."
                                />
                                {sellerClientSearch.length >= 2 && sellerClientSuggestions.length === 0 && (
                                  <ClientCreateInlineMini
                                    defaultName={sellerClientSearch}
                                    onSave={(data) => {
                                      setNewSellerClientData(data);
                                      setFormData((p) => ({ ...p, seller: data.full_name }));
                                    }}
                                    inputCls="h-10 rounded-xl bg-zinc-900/60 border-white/5"
                                  />
                                )}
                              </>
                            )}
                          </div>
                        ) : (
                          <div ref={sellerLeadsPickRef} className="relative space-y-2">
                            <Input
                              value={sellerLeadSearch}
                              onChange={(e) => {
                                setSellerLeadSearch(e.target.value);
                                setSellerLeadDropdownOpen(true);
                              }}
                              onFocus={() => setSellerLeadDropdownOpen(true)}
                              placeholder="Поиск лида из базы…"
                              className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl"
                            />
                            <p className="text-[10px] text-white/35 uppercase tracking-wide">
                              Нового лида здесь создать нельзя — только выбор из базы «Лиды».
                            </p>
                            {sellerLeadDropdownOpen && sellerLeadQ.length >= 2 && rawSellerLeadRows.length > 0 ? (
                              <div className="absolute z-50 left-0 right-0 mt-1 max-h-[220px] overflow-y-auto rounded-xl border border-white/10 bg-zinc-950 shadow-2xl">
                                {rawSellerLeadRows.map((l: { id: string; full_name: string; phone?: string }) => (
                                  <button
                                    key={l.id}
                                    type="button"
                                    className="w-full text-left px-3 py-2.5 text-sm text-white/80 hover:bg-white/5 hover:text-white border-b border-white/5 last:border-0"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setFormData((p) => ({ ...p, seller: String(l.full_name || '').trim() }));
                                      setSellerLeadSearch('');
                                      setSellerLeadDropdownOpen(false);
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
                            {sellerLeadDropdownOpen && sellerLeadQ.length >= 2 && rawSellerLeadRows.length === 0 ? (
                              <p className="text-[11px] text-amber-400/70 px-1">Лиды не найдены</p>
                            ) : null}
                            {formData.seller.trim() ? (
                              <p className="text-xs text-white/55">
                                В сделке: <span className="text-white font-medium">{formData.seller}</span>
                              </p>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )}
                  </FormField>
                  <FormField label="Покупатель" required>
                    {clientRestricted ? (
                      <Input
                        value={formData.buyer}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setFormData({ ...formData, buyer: e.target.value })
                        }
                        placeholder="ФИО"
                        className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl"
                      />
                    ) : (
                      <div className="space-y-3">
                        <PartyModeToggleBar
                          value={buyerPartyType}
                          onChange={(m) => {
                            if (m === 'external') {
                              const name =
                                selectedBuyerClient?.full_name?.trim() ||
                                newBuyerClientData?.full_name?.trim() ||
                                buyerClientSearch.trim() ||
                                formData.buyer.trim();
                              setFormData((p) => ({ ...p, buyer: name }));
                              setBuyerClientSearch('');
                              setSelectedBuyerClient(null);
                              setNewBuyerClientData(null);
                              setLeadSearch('');
                              setLeadDropdownOpen(false);
                            }
                            if (m === 'client') {
                              setLeadSearch('');
                              setLeadDropdownOpen(false);
                            }
                            if (m === 'lead') {
                              setBuyerClientSearch('');
                              setSelectedBuyerClient(null);
                              setNewBuyerClientData(null);
                            }
                            setBuyerPartyType(m);
                          }}
                        />

                        {buyerPartyType === 'external' ? (
                          <Input
                            value={formData.buyer}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              setFormData({ ...formData, buyer: e.target.value })
                            }
                            placeholder="ФИО, ООО или произвольное название"
                            className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl"
                          />
                        ) : buyerPartyType === 'client' ? (
                          <div className="space-y-3">
                            {selectedBuyerClient ? (
                              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold truncate text-white">{selectedBuyerClient.full_name}</p>
                                  {selectedBuyerClient.phone ? (
                                    <p className="text-[10px] text-white/50">{selectedBuyerClient.phone}</p>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  className="shrink-0 text-white/50 px-2"
                                  onClick={() => {
                                    setSelectedBuyerClient(null);
                                    setFormData((p) => ({ ...p, buyer: '' }));
                                  }}
                                  aria-label="Сбросить"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : newBuyerClientData ? (
                              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                <p className="text-sm font-medium text-white truncate">
                                  {newBuyerClientData.full_name}{' '}
                                  <span className="text-[9px] text-emerald-400 uppercase font-bold">(новый клиент)</span>
                                </p>
                                <button
                                  type="button"
                                  className="shrink-0 text-white/50"
                                  onClick={() => setNewBuyerClientData(null)}
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <>
                                <ClientSearchInput
                                  value={buyerClientSearch}
                                  onChange={(v) => {
                                    setBuyerClientSearch(v);
                                    setNewBuyerClientData(null);
                                    setFormData((p) => ({ ...p, buyer: v }));
                                  }}
                                  suggestions={buyerClientSuggestions}
                                  onSelect={(c) => {
                                    setSelectedBuyerClient(c);
                                    setBuyerClientSearch('');
                                    setFormData((p) => ({ ...p, buyer: c.full_name }));
                                  }}
                                  inputCls={cn(
                                    'bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl normal-case tracking-normal'
                                  )}
                                  placeholder="Поиск клиента или введите ФИО..."
                                />
                                {buyerClientSearch.length >= 2 && buyerClientSuggestions.length === 0 && (
                                  <ClientCreateInlineMini
                                    defaultName={buyerClientSearch}
                                    onSave={(data) => {
                                      setNewBuyerClientData(data);
                                      setFormData((p) => ({ ...p, buyer: data.full_name }));
                                    }}
                                    inputCls="h-10 rounded-xl bg-zinc-900/60 border-white/5"
                                  />
                                )}
                              </>
                            )}
                          </div>
                        ) : (
                          <div ref={leadsPickRef} className="relative space-y-2">
                            <Input
                              value={leadSearch}
                              onChange={(e) => {
                                setLeadSearch(e.target.value);
                                setLeadDropdownOpen(true);
                              }}
                              onFocus={() => setLeadDropdownOpen(true)}
                              placeholder="Поиск лида из базы…"
                              className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl"
                            />
                            <p className="text-[10px] text-white/35 uppercase tracking-wide">
                              Нового лида здесь создать нельзя — только выбор из базы «Лиды».
                            </p>
                            {leadDropdownOpen && leadQ.length >= 2 && rawLeadRows.length > 0 ? (
                              <div className="absolute z-50 left-0 right-0 mt-1 max-h-[220px] overflow-y-auto rounded-xl border border-white/10 bg-zinc-950 shadow-2xl">
                                {rawLeadRows.map((l: { id: string; full_name: string; phone?: string }) => (
                                  <button
                                    key={l.id}
                                    type="button"
                                    className="w-full text-left px-3 py-2.5 text-sm text-white/80 hover:bg-white/5 hover:text-white border-b border-white/5 last:border-0"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setFormData((p) => ({ ...p, buyer: String(l.full_name || '').trim() }));
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
                            {leadDropdownOpen && leadQ.length >= 2 && rawLeadRows.length === 0 ? (
                              <p className="text-[11px] text-amber-400/70 px-1">Лиды не найдены</p>
                            ) : null}
                            {formData.buyer.trim() ? (
                              <p className="text-xs text-white/55">
                                В сделке: <span className="text-white font-medium">{formData.buyer}</span>
                              </p>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )}
                  </FormField>
                </div>
              </Section>

              <Section
                title="Даты"
                icon={<Clock className="h-5 w-5 text-blue-400" />}
                className="lg:col-span-1"
              >
                <div className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField label="Дата задатка">
                        <Input 
                          type="date" 
                          value={formData.deposit_date} 
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, deposit_date: e.target.value })} 
                          className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl px-4" 
                        />
                      </FormField>
                      <FormField label="Дата сделки">
                        <Input 
                          type="date" 
                          value={formData.deal_date} 
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, deal_date: e.target.value })} 
                          className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl px-4" 
                        />
                      </FormField>
                    </div>
                    <FormField label="Поступление денег">
                      <Input 
                        type="date" 
                        value={formData.payment_date} 
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, payment_date: e.target.value })} 
                        className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl px-4" 
                      />
                    </FormField>
                </div>
              </Section>

              <Section
                title="Команда"
                icon={<UserPlus className="h-5 w-5 text-amber-400" />}
                className="lg:col-span-1"
              >
                <div className="space-y-4 sm:space-y-6">
                  {/* Director level: Branch -> Team -> Agent */}
                  {accessLevel >= 90 && (
                    <>
                      <FormField label="Филиал" required>
                        <Select
                          value={formData.branch_id || 'none'}
                          onValueChange={(val: string) => {
                            const branchId = val === 'none' ? '' : val;
                            const d = defaultRopFromBranch(employees, branchId || undefined);
                            setFormData({
                              ...formData,
                              branch_id: branchId,
                              team_id: '',
                              agent_id: '',
                              agent_name: '',
                              rop_id: d.id,
                              rop_name: d.name,
                              rop_percent: d.percent,
                              mop_id: '',
                              mop_name: '',
                              mop_percent: 0,
                              mortgage_credited_id: ''
                            });
                          }}
                        >
                          <SelectTrigger className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl">
                            <SelectValue placeholder="Выберите филиал" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-950 border-white/10">
                            <SelectItem value="none">Не выбрано</SelectItem>
                            {(Array.isArray(branches) ? branches : []).map((b: any) => (
                              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>

                      <FormField label="Команда" required>
                        <Select
                          key={`team-dir-${formData.team_id}-${teams.length}`}
                          value={formData.team_id || 'none'}
                          disabled={!formData.branch_id}
                          onValueChange={(val: string) => {
                            const branchId = formData.branch_id || profile?.branch_id;
                            const teamId = val === 'none' ? '' : val;
                            const mop = mopFromTeamLeader(teamId || undefined, teams, employees);
                            const opts = getRopRecipientOptions(employees, branchId);
                            const def = defaultRopFromBranch(employees, branchId);
                            setFormData((prev) => {
                              const keep = prev.rop_id && opts.some((o) => o.id === prev.rop_id);
                              const r = keep ? (opts.find((o) => o.id === prev.rop_id) || def) : def;
                              return {
                                ...prev,
                                team_id: teamId,
                                agent_id: '',
                                agent_name: '',
                                rop_id: r.id,
                                rop_name: r.name,
                                rop_percent: r.percent,
                                mop_id: mop.mop_id,
                                mop_name: mop.mop_name,
                                mop_percent: mop.mop_percent
                              };
                            });
                          }}
                        >
                          <SelectTrigger className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl">
                            <SelectValue placeholder="Выберите команду" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-950 border-white/10">
                            <SelectItem value="none">Не выбрано</SelectItem>
                            <SelectItem value="no-team">Без команды</SelectItem>
                            {teams.filter((t: any) => t.branch_id === formData.branch_id).map((t: any) => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                            {formData.team_id && formData.team_id !== 'none' && formData.team_id !== 'no-team' && !teams.some((t: any) => t.id === formData.team_id && t.branch_id === formData.branch_id) && (
                              (() => {
                                const t = teams.find((t: any) => t.id === formData.team_id);
                                return t ? <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem> : null;
                              })()
                            )}
                          </SelectContent>
                        </Select>
                      </FormField>
                    </>
                  )}

                  {/* Manager level (50-89): Team (if not fixed) -> Agent */}
                  {accessLevel >= 50 && accessLevel < 90 && (
                     <FormField label="Команда" required>
                        <Select
                          key={`team-mgr-${formData.team_id}-${teams.length}`}
                          value={formData.team_id || 'none'}
                          onValueChange={(val: string) => {
                            const branchId = profile?.branch_id;
                            const teamId = val === 'none' ? '' : val;
                            const mop = mopFromTeamLeader(teamId || undefined, teams, employees);
                            const opts = getRopRecipientOptions(employees, branchId);
                            const def = defaultRopFromBranch(employees, branchId);
                            setFormData((prev) => {
                              const keep = prev.rop_id && opts.some((o) => o.id === prev.rop_id);
                              const r = keep ? (opts.find((o) => o.id === prev.rop_id) || def) : def;
                              return {
                                ...prev,
                                team_id: teamId,
                                agent_id: '',
                                agent_name: '',
                                rop_id: r.id,
                                rop_name: r.name,
                                rop_percent: r.percent,
                                mop_id: mop.mop_id,
                                mop_name: mop.mop_name,
                                mop_percent: mop.mop_percent
                              };
                            });
                          }}
                        >
                          <SelectTrigger className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl">
                            <SelectValue placeholder="Выберите команду" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-950 border-white/10">
                            <SelectItem value="none">Не выбрано</SelectItem>
                            <SelectItem value="no-team">Без команды</SelectItem>
                            {teams.filter((t: any) => t.branch_id === profile?.branch_id).map((t: any) => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                            {formData.team_id && formData.team_id !== 'none' && formData.team_id !== 'no-team' && !teams.some((t: any) => t.id === formData.team_id && t.branch_id === profile?.branch_id) && (
                              (() => {
                                const t = teams.find((t: any) => t.id === formData.team_id);
                                return t ? <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem> : null;
                              })()
                            )}
                          </SelectContent>
                        </Select>
                      </FormField>
                  )}

                  {/* Agent Selection: Dropdown if Manager/Director, Input if Agent */}
                  {accessLevel >= 50 ? (
                    <FormField label="Агент" required>
                      <Select
                        key={`agent-${formData.agent_id}-${employees.length}`}
                        value={formData.agent_id || 'none'}
                        disabled={!formData.team_id && accessLevel < 90}
                        onValueChange={(val: string) => {
                          const emp = employees.find((e: any) => e.id === val);
                          const tid =
                            (formData.team_id && String(formData.team_id).trim()) ||
                            (emp?.team_id && String(emp.team_id).trim()) ||
                            '';
                          const mop = mopFromTeamLeader(tid || undefined, teams, employees);
                          setFormData({
                            ...formData,
                            agent_id: val === 'none' ? '' : val,
                            agent_name: emp
                              ? emp.full_name || `${emp.first_name} ${emp.last_name}`.trim()
                              : '',
                            team_id: tid || formData.team_id,
                            mop_id: mop.mop_id,
                            mop_name: mop.mop_name,
                            mop_percent: mop.mop_percent
                          });
                        }}
                      >
                        <SelectTrigger className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl">
                          <SelectValue placeholder="Выберите агента" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-950 border-white/10">
                          <SelectItem value="none">Не выбрано</SelectItem>
                          {employees
                            .filter((e: any) => !formData.team_id || e.team_id === formData.team_id)
                            .map((e: any) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.full_name || `${e.first_name} ${e.last_name}`}
                              </SelectItem>
                            ))
                          }
                          {formData.agent_id && formData.agent_id !== 'none' && !employees.some((e: any) => e.id === formData.agent_id && (!formData.team_id || e.team_id === formData.team_id)) && (
                            (() => {
                              const e = employees.find((e: any) => e.id === formData.agent_id);
                              return e ? (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.full_name || `${e.first_name} ${e.last_name}`}
                                </SelectItem>
                              ) : null;
                            })()
                          )}
                        </SelectContent>
                      </Select>
                    </FormField>
                  ) : (
                    <FormField label="Агент" required>
                      <Input
                        value={formData.agent_name}
                        disabled
                        className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl opacity-70"
                      />
                    </FormField>
                  )}

                  {accessLevel >= 50 && (
                    <FormField label="Сдельщик">
                      <Select
                        value={formData.subcontractor_id || 'none'}
                        onValueChange={(val: string) => {
                          setFormData({ ...formData, subcontractor_id: val === 'none' ? '' : val });
                        }}
                      >
                        <SelectTrigger className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl">
                          <SelectValue placeholder="Выберите риелтора" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-950 border-white/10">
                          <SelectItem value="none">Не выбрано</SelectItem>
                          {employees
                            .filter((e: any) => {
                              if (!e.is_active) return false;
                              if (String(e.branch_id) !== String(formData.branch_id)) return false;
                              if (e.access_level != null) return Number(e.access_level) < 50;
                              const pos = String(e.position?.name || e.position_name || '').toLowerCase();
                              return pos.includes('риелтор') || pos.includes('риэлтор') || pos.includes('брокер') || pos.includes('агент');
                            })
                            .map((e: any) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.full_name || `${e.first_name} ${e.last_name}`}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                  )}

                  {(accessLevel >= 50 || formData.mop_name || formData.mop_id) && (
                    <FormField label="Менеджер отдела продаж" required>
                      <Input
                        value={formData.mop_name}
                        disabled
                        className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl opacity-50"
                      />
                    </FormField>
                  )}

                  {(accessLevel >= 50 || formData.rop_name || formData.rop_id) && (
                    <FormField label="Руководитель отдела продаж" required>
                      <Select
                        value={formData.rop_id || 'none'}
                        onValueChange={(val: string) => {
                          if (val === 'none') {
                            setFormData({ ...formData, rop_id: '', rop_name: '', rop_percent: 0 });
                            return;
                          }
                          const opt = ropSelectOptions.find((o) => o.id === val);
                          const emp = employees.find((e: any) => e.id === val);
                          setFormData({
                            ...formData,
                            rop_id: val,
                            rop_name: opt?.name || displayEmployeeName(emp),
                            rop_percent: (opt?.percent ?? Number(emp?.management_kpi_current)) || 3
                          });
                        }}
                        disabled={ropSelectOptions.length === 0}
                      >
                        <SelectTrigger
                          className={cn(
                            'bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl',
                            ropSelectOptions.length === 0 && 'opacity-70 cursor-not-allowed'
                          )}
                        >
                          <SelectValue placeholder="Выберите РОП или КД" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-950 border-white/10">
                          <SelectItem value="none" className="focus:bg-primary/20">
                            Не выбрано
                          </SelectItem>
                          {ropSelectOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id} className="focus:bg-primary/20">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                  )}

                  <FormField label="Ипотека">
                    <Select
                      value={formData.mortgage_credited_id || 'none'}
                      onValueChange={(val: string) => {
                        if (val === 'none') {
                          setFormData({
                            ...formData,
                            mortgage_credited_id: '',
                            mortgage: 0
                          });
                          return;
                        }
                        setFormData({
                          ...formData,
                          mortgage_credited_id: val,
                          mortgage: 1
                        });
                      }}
                      disabled={mortgageRecipientOptions.length === 0}
                    >
                      <SelectTrigger className={cn(
                        'bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl',
                        mortgageRecipientOptions.length === 0 && 'opacity-70 cursor-not-allowed'
                      )}>
                        <SelectValue placeholder="Выберите ответственного" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-white/10">
                        <SelectItem value="none" className="focus:bg-primary/20">Не выбрано</SelectItem>
                        {mortgageRecipientOptions.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id} className="focus:bg-primary/20">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                </div>
              </Section>
            </div>

            {/* Symmetrical Financial Calculation Grid */}
            <Section
              title="Финансы"
              icon={<Calculator className="h-6 w-6 text-primary" />}
              className="bg-zinc-950 border-primary/10 shadow-[0_0_80px_rgba(0,0,0,0.3)] relative overflow-hidden"
            >
              {/* Visual Highlight Layer for Fact column (middle two columns in 4-col grid) */}
              <div className="hidden xl:block absolute inset-y-0 left-[25%] right-[25%] bg-primary/[0.04] border-x border-primary/10 z-0" />
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-8 gap-y-6 items-start relative z-10">
                {/* Headers Row */}
                <div className="xl:col-span-1 pt-2">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-1 h-4 bg-white/20 rounded-full" />
                    <h4 className="text-[12px] font-black uppercase tracking-widest text-white/30">Прогноз (План)</h4>
                  </div>
                </div>
                <div className="xl:col-span-2 pt-2">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <div className="w-1 h-4 bg-primary rounded-full" />
                    <h4 className="text-[12px] font-black uppercase tracking-widest text-primary/80">Реальность (Факт)</h4>
                    <div className="w-1 h-4 bg-primary rounded-full" />
                  </div>
                </div>
                <div className="xl:col-span-1 pt-2">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-1 h-4 bg-white/20 rounded-full" />
                    <h4 className="text-[12px] font-black uppercase tracking-widest text-white/30">Ставки (%)</h4>
                  </div>
                </div>

                {/* Primary Row: Sellers & 1st Rate */}
                <FormField label="Комиссия (Продавец)">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={groupedIntegerInputDisplay(formData.commission_seller_plan)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setFormData({ ...formData, commission_seller_plan: clampIntAmountFromDigits(e.target.value) })
                    }
                    className="bg-white/[0.02] border-white/5 h-14 text-lg font-bold rounded-2xl px-6 tabular-nums"
                  />
                </FormField>
                <FormField label="Факт (Продавец)">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={groupedIntegerInputDisplay(formData.commission_seller_fact)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setFormData({ ...formData, commission_seller_fact: clampIntAmountFromDigits(e.target.value) })
                    }
                    className="bg-primary/5 border-primary/20 h-14 text-xl font-black rounded-2xl px-6 focus:border-primary/50 tabular-nums"
                  />
                </FormField>
                <FormField label="Факт (Покупатель)">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={groupedIntegerInputDisplay(formData.commission_buyer_fact)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setFormData({ ...formData, commission_buyer_fact: clampIntAmountFromDigits(e.target.value) })
                    }
                    className="bg-primary/5 border-primary/20 h-14 text-xl font-black rounded-2xl px-6 focus:border-primary/50 tabular-nums"
                  />
                </FormField>
                <div className="xl:col-start-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Агент (продавец) %" required>
                      <Input type="number" step="any" value={formData.agent_percent_seller} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, agent_percent_seller: e.target.value === '' ? '' : parseFloat(e.target.value) })} className="bg-white/5 border-white/5 h-14 text-lg font-bold rounded-2xl px-6" />
                    </FormField>
                    <FormField label="Агент (покупатель) %" required>
                      <Input type="number" step="any" value={formData.agent_percent_buyer} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, agent_percent_buyer: e.target.value === '' ? '' : parseFloat(e.target.value) })} className="bg-white/5 border-white/5 h-14 text-lg font-bold rounded-2xl px-6" />
                    </FormField>
                  </div>
                </div>

                {/* Secondary Row: Buyer, Deduction, Subcontractor, Rates */}
                <FormField label="Комиссия (Покупатель)">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={groupedIntegerInputDisplay(formData.commission_buyer_plan)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setFormData({ ...formData, commission_buyer_plan: clampIntAmountFromDigits(e.target.value) })
                    }
                    className="bg-white/[0.02] border-white/5 h-14 text-lg font-bold rounded-2xl px-6 tabular-nums"
                  />
                </FormField>
                <FormField label="Ипотечный вычет (Минус)">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={groupedIntegerInputDisplay(formData.mortgage_deduction)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setFormData({ ...formData, mortgage_deduction: clampIntAmountFromDigits(e.target.value) })
                    }
                    className="bg-rose-500/5 border-rose-500/20 h-14 px-6 text-xl font-black rounded-2xl text-rose-400 tabular-nums"
                  />
                </FormField>
                <FormField label="Сумма сдельщика (₽)">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={groupedIntegerInputDisplay(formData.subcontractor_amount)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setFormData({ ...formData, subcontractor_amount: clampIntAmountFromDigits(e.target.value) })
                    }
                    className="bg-white/[0.03] border-white/5 h-14 px-6 text-xl font-black rounded-2xl tabular-nums"
                  />
                </FormField>
                {/* Ставки — второй ряд */}
                <div className="xl:col-start-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="МОП (%)" required>
                      <Input type="number" step="1" value={formData.mop_percent} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, mop_percent: e.target.value === '' ? '' : Math.round(parseFloat(e.target.value)) })} className="bg-white/5 border-white/5 h-14 text-lg font-bold rounded-2xl px-6" />
                    </FormField>
                    <FormField label="РОП (%)" required>
                      <Input type="number" step="1" value={formData.rop_percent} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, rop_percent: e.target.value === '' ? '' : Math.round(parseFloat(e.target.value)) })} className="bg-white/5 border-white/5 h-14 text-lg font-bold rounded-2xl px-6" />
                    </FormField>
                  </div>
                </div>
              </div>
            </Section>

            {/* Final Details */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-12 items-stretch">
              <div className="lg:col-span-8">
                <Section
                  title="Дополнительно"
                  icon={<Info className="h-5 w-5 text-purple-400" />}
                  className="h-full flex flex-col"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 flex-1">
                    <div className="space-y-4 sm:space-y-6">
                        <FormField label="Ссылка (Облако/Диск)">
                          <Input 
                            value={formData.document_link} 
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, document_link: e.target.value })} 
                            placeholder="https://..." 
                            className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl px-6" 
                          />
                        </FormField>
                      <FormField label="Служебная записка">
                        <Input value={formData.payout_mop_note} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, payout_mop_note: e.target.value })} placeholder="Для бухгалтерии..." className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl" />
                      </FormField>
                    </div>
                    <FormField label="Комментарий к сделке">
                      <textarea
                        value={formData.comment}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, comment: e.target.value })}
                        placeholder="Особенности сделки, пожелания..."
                        className="bg-white/[0.03] border-white/5 w-full h-[calc(112px+24px)] p-5 text-base rounded-2xl resize-none focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                      />
                    </FormField>
                  </div>
                </Section>
              </div>

              <div className="lg:col-span-4 flex">
                <Section
                  title="Выплата"
                  icon={<Wallet className="h-5 w-5 text-emerald-400" />}
                  className="w-full h-full flex flex-col"
                >
                  <div className="space-y-4 sm:space-y-6 flex-1">
                    <FormField label="Дата выплаты (ожид./факт)" required>
                      <Input
                        type="date"
                        value={formData.payout_date}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, payout_date: e.target.value })}
                        required
                        className="bg-white/[0.03] border-white/5 h-14 text-base rounded-2xl"
                      />
                    </FormField>
                    <div className="p-4 sm:p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                      <p className="text-[11px] text-emerald-500/70 font-bold uppercase tracking-wider leading-relaxed">
                        После подтверждения сделка уйдет на проверку РОПу. Проверьте корректность дат и сумм.
                      </p>
                    </div>
                  </div>
                </Section>
              </div>
            </div>
          </form>
        </div>

        {/* Footer - Fixed Glass */}
        <div className="p-4 border-t border-white/10 bg-zinc-950/80 backdrop-blur flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="text-left">
              <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">Комиссия (факт)</p>
              <p className="text-2xl sm:text-3xl font-black text-primary tracking-tighter">
                {(() => {
                  const seller = Number(formData.commission_seller_fact);
                  const buyer = Number(formData.commission_buyer_fact);
                  return formatMoneyTrimTrailingZeros(seller + buyer);
                })()}
              </p>
            </div>
            <div className="hidden sm:block w-px h-10 bg-white/10" />
            <div className="text-left">
              <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">Доход агента</p>
              <p className="text-xl font-black text-white/60 tracking-tighter">
                {(() => {
                  const seller = Number(formData.commission_seller_fact);
                  const buyer = Number(formData.commission_buyer_fact);
                  const deduction = Number(formData.mortgage_deduction);
                  const percentSeller = Number(formData.agent_percent_seller);
                  const percentBuyer = Number(formData.agent_percent_buyer);
                  const subcontractor = Number(formData.subcontractor_amount || 0);
                  
                  const agent = ((seller - deduction) * percentSeller / 100) 
                    + (buyer * percentBuyer / 100)
                    - (subcontractor / 2);
                  return formatMoneyTrimTrailingZeros(agent);
                })()}
              </p>
            </div>
            <div className="hidden sm:block w-px h-10 bg-white/10" />
            <div className="text-left">
              <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">Выручка МОП</p>
              <p className="text-xl font-black text-white/60 tracking-tighter text-sky-400/80">
                {(() => {
                  const seller = Number(formData.commission_seller_fact);
                  const buyer = Number(formData.commission_buyer_fact);
                  const deduction = Number(formData.mortgage_deduction);
                  const subcontractor = Number(formData.subcontractor_amount || 0);
                  const mopPercent = Number(formData.mop_percent);
                  const base = (seller - deduction) + buyer - subcontractor;
                  const mop = base * mopPercent / 100;
                  return formatMoneyTrimTrailingZeros(mop);
                })()}
              </p>
            </div>
            <div className="hidden sm:block w-px h-10 bg-white/10" />
            <div className="text-left">
              <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">Выручка РОП</p>
              <p className="text-xl font-black text-white/60 tracking-tighter text-amber-400/80">
                {(() => {
                  const seller = Number(formData.commission_seller_fact);
                  const buyer = Number(formData.commission_buyer_fact);
                  const deduction = Number(formData.mortgage_deduction);
                  const subcontractor = Number(formData.subcontractor_amount || 0);
                  const ropPercent = Number(formData.rop_percent);
                  
                  const base = (seller - deduction) + buyer - subcontractor;
                  const rop = base * ropPercent / 100;
                  return formatMoneyTrimTrailingZeros(rop);
                })()}
              </p>
            </div>
            <div className="hidden sm:block w-px h-10 bg-white/10" />
            <div className="text-left">
              <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">Выручка агентства</p>
              <p className="text-xl font-black text-emerald-400 tracking-tighter">
                {(() => {
                  const seller = Number(formData.commission_seller_fact);
                  const buyer = Number(formData.commission_buyer_fact);
                  const deduction = Number(formData.mortgage_deduction);
                  const percentSeller = Number(formData.agent_percent_seller);
                  const percentBuyer = Number(formData.agent_percent_buyer);
                  const ropPercent = Number(formData.rop_percent);
                  const mopPercent = Number(formData.mop_percent);
                  const subcontractor = Number(formData.subcontractor_amount || 0);

                  const totalBase = (seller - deduction) + buyer;
                  const agentAfterSub = (((seller - deduction) * percentSeller / 100) 
                    + (buyer * percentBuyer / 100))
                    - (subcontractor / 2);
                  const sharedBase = totalBase - subcontractor;
                  const rop = sharedBase * ropPercent / 100;
                  const mop = sharedBase * mopPercent / 100;
                  return formatMoneyTrimTrailingZeros(totalBase - agentAfterSub - rop - mop - (subcontractor / 2));
                })()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Draft save removed — all new deals are drafts by default */}
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="flex-1 sm:flex-none text-muted-foreground hover:text-white h-11 sm:h-12 px-4 sm:px-6 rounded-lg"
            >
              Закрыть
            </Button>
            <Button
              form="deal-form"
              type="submit"
              disabled={createMutation.isPending || createClientMutation.isPending}
              className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 text-white font-semibold h-11 sm:h-12 px-5 sm:px-7 rounded-lg"
            >
              {createMutation.isPending ? 'Сохранение...' : editingDeal ? 'Сохранить' : 'Создать сделку'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

// Final Utility components - Max Spacing
function Section({ title, icon, children, className }: { title: string, icon: React.ReactNode, children: React.ReactNode, className?: string }) {
  return (
    <div className={cn("p-5 sm:p-6 rounded-xl bg-white/[0.02] border border-white/10", className)}>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-zinc-900/60 border border-white/10 rounded-lg">
          {icon}
        </div>
        <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wide">{title}</h3>
      </div>
      <div>{children}</div>
    </div>
  );
}

function FormField({ label, children, className, required }: { label: string, children: React.ReactNode, className?: string, required?: boolean }) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="h-6 flex items-end gap-1">
        <Label className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis">{label}</Label>
        {required && <span className="text-rose-500 text-xs leading-none mb-0.5">*</span>}
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

export { AddDealRowDialog };
