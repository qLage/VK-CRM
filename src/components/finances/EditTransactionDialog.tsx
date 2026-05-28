import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Save, Wallet, CreditCard } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import {
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
  MONTH_OPTIONS,
  needsKpiCascade,
  CATEGORY_LABELS,
} from '@/components/finances/transactionFormConfig';
import { formatInteger } from '@/utils/formatters';

function txAmountDigits(v: unknown): string {
  if (v == null || v === '') return '';
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(n).replace(/\D/g, '');
}

interface Props {
  transaction: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { id: string; data: Record<string, unknown> }) => void;
  isSaving?: boolean;
}

const categories = {
  income: [...INCOME_CATEGORIES],
  expense: [...EXPENSE_CATEGORIES],
};

export function EditTransactionDialog({ transaction, open, onOpenChange, onSave, isSaving }: Props) {
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [accountType, setAccountType] = useState<'cash' | 'account'>('cash');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [bookDay, setBookDay] = useState('1');
  const [bookMonth, setBookMonth] = useState('1');
  const [bookYear, setBookYear] = useState(String(new Date().getFullYear()));

  const relatedUserId = String(transaction?.user_id || transaction?.related_user_id || '').trim();
  const isDealCommission = transaction?.category === 'deal_commission';

  const { data: employee } = useQuery({
    queryKey: ['employee-profile-short', relatedUserId],
    queryFn: async () => {
      const { data, error } = await localAPI.request(`/employees/${relatedUserId}`);
      if (error) throw error;
      return (data as any)?.data ?? data;
    },
    enabled: open && !!relatedUserId && !isDealCommission,
  });

  useEffect(() => {
    if (!open || !transaction) return;

    if (isDealCommission) {
      setType('income');
      setCategory('deal_commission');
      setDescription(String(transaction.description || ''));
      setAmount(txAmountDigits(transaction.amount));
      setAccountType(transaction.account_type === 'account' ? 'account' : 'cash');
      const y = Number(transaction.year);
      const m = Number(transaction.month);
      if (Number.isFinite(y) && y > 1999 && Number.isFinite(m) && m >= 1 && m <= 12) {
        setBookYear(String(y));
        setBookMonth(String(m));
        setBookDay('1');
      } else {
        const ts = transaction.created_at ? new Date(transaction.created_at) : new Date();
        if (!Number.isNaN(ts.getTime())) {
          setBookDay(String(ts.getDate()));
          setBookMonth(String(ts.getMonth() + 1));
          setBookYear(String(ts.getFullYear()));
        }
      }
      return;
    }

    const t = transaction.type === 'expense' ? 'expense' : 'income';
    setType(t);
    setCategory(String(transaction.category || ''));
    setDescription(String(transaction.description || ''));
    setAmount(txAmountDigits(transaction.amount));
    setAccountType(transaction.account_type === 'account' ? 'account' : 'cash');

    const uidInit = String(transaction.user_id || transaction.related_user_id || '').trim();
    if (uidInit) setSelectedUserId(uidInit);

    const tsRaw = transaction.booked_at || transaction.created_at;
    const ts = tsRaw ? new Date(tsRaw as string) : new Date();
    if (!Number.isNaN(ts.getTime())) {
      setBookDay(String(ts.getDate()));
      setBookMonth(String(ts.getMonth() + 1));
      setBookYear(String(ts.getFullYear()));
    }
  }, [open, transaction, isDealCommission]);

  useEffect(() => {
    if (!open || !employee || isDealCommission) return;
    const bid = employee.branch_id ? String(employee.branch_id) : '';
    const tid = employee.team_id ? String(employee.team_id) : '';
    if (bid) setSelectedBranchId(bid);
    if (tid) setSelectedTeamId(tid);
    if (relatedUserId) setSelectedUserId(relatedUserId);
  }, [open, employee, isDealCommission, relatedUserId]);

  const cascade = needsKpiCascade(type, category);

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/branches');
      if (error) throw error;
      return Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    },
    enabled: open && cascade && !isDealCommission,
  });

  const { data: allTeams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/teams');
      if (error) throw error;
      return Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    },
    enabled: open && cascade && !!selectedBranchId && !isDealCommission,
  });

  const teams = allTeams.filter((team: any) => String(team.branch_id) === String(selectedBranchId));

  const { data: allEmployees = [] } = useQuery({
    queryKey: ['employees-for-transaction'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/employees');
      if (error) throw error;
      const arr = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      return arr.filter((e: any) => e.is_active);
    },
    enabled: open && cascade && !!selectedBranchId && !isDealCommission,
  });

  const employees = allEmployees.filter((emp: any) => {
    const matchesBranch = String(emp.branch_id) === String(selectedBranchId);
    const isManager = (emp.access_level || 0) >= 90;
    if (selectedTeamId === 'no-team') {
      return matchesBranch && isManager;
    }
    const matchesTeam = selectedTeamId && String(emp.team_id) === String(selectedTeamId);
    return matchesBranch && (matchesTeam || isManager);
  });

  const buildBookedAtIso = (): string | undefined => {
    const d = parseInt(bookDay, 10);
    const m = parseInt(bookMonth, 10);
    const y = parseInt(bookYear, 10);
    if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return undefined;
    if (m < 1 || m > 12 || y < 2000 || y > 2100) return undefined;
    const last = new Date(y, m, 0).getDate();
    if (d < 1 || d > last) return undefined;
    return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
  };

  const handleSave = () => {
    if (!transaction?.id) return;

    if (isDealCommission) {
      if (!amount || Number(amount) <= 0) return;
      const booked_at = buildBookedAtIso();
      const y = parseInt(bookYear, 10);
      const m = parseInt(bookMonth, 10);
      onSave({
        id: transaction.id,
        data: {
          amount: Number(amount),
          account_type: accountType,
          ...(booked_at ? { booked_at } : {}),
          ...(Number.isFinite(y) && Number.isFinite(m) ? { year: y, month: m } : {}),
        },
      });
      return;
    }

    if (!category || !amount || Number(amount) <= 0) return;
    if (cascade && !selectedUserId) return;
    if (!cascade && !description.trim()) return;

    const selectedEmployee = employees.find((e: any) => e.id === selectedUserId);
    const name = selectedEmployee?.full_name || 'Сотрудник';

    let desc = description.trim();
    if (cascade) {
      if (category === 'premium') desc = `Премия — ${name}`;
      else if (category === 'salary') desc = `Зарплата — ${name}`;
      else if (category === 'commission') desc = `Комиссия — ${name}`;
      else if (category === 'bonus') desc = `Бонус — ${name}`;
    }

    const booked_at = buildBookedAtIso();

    onSave({
      id: transaction.id,
      data: {
        type,
        category,
        description: desc,
        amount: Number(amount),
        account_type: accountType,
        ...(selectedUserId ? { related_user_id: selectedUserId } : {}),
        ...(booked_at ? { booked_at } : {}),
      },
    });
  };

  const handleCategoryChange = (v: string) => {
    setCategory(v);
    setSelectedBranchId('');
    setSelectedTeamId('');
    setSelectedUserId('');
    setDescription('');
  };

  const handleBranchChange = (v: string) => {
    setSelectedBranchId(v);
    setSelectedTeamId('');
    setSelectedUserId('');
  };

  const handleTeamChange = (v: string) => {
    setSelectedTeamId(v);
    setSelectedUserId('');
  };

  const yearNow = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => String(yearNow - 2 + i));
  const dayInMonth =
    parseInt(bookMonth, 10) && parseInt(bookYear, 10)
      ? new Date(parseInt(bookYear, 10), parseInt(bookMonth, 10), 0).getDate()
      : 31;
  const dayOptions = Array.from({ length: dayInMonth }, (_, i) => String(i + 1));

  const submitDisabled =
    isSaving ||
    !amount ||
    Number(amount) <= 0 ||
    (!isDealCommission && (!category || (cascade && !selectedUserId) || (!cascade && !description.trim())));

  const categoryOptions =
    category && !categories[type].some((c) => c.value === category)
      ? [{ value: category, label: `${CATEGORY_LABELS[category] || category} (текущая)` }, ...categories[type]]
      : categories[type];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-md max-h-[90vh] overflow-y-auto sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-base md:text-lg">
            {isDealCommission ? 'Комиссия по сделке' : 'Редактирование операции'}
          </DialogTitle>
          <DialogDescription className="sr-only">Изменение параметров финансовой операции</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 md:space-y-4 pt-3 md:pt-4">
          <div className="grid grid-cols-2 gap-2">
            {(['income', 'expense'] as const).map((t) => (
              <button
                key={t}
                type="button"
                disabled={isDealCommission}
                onClick={() => {
                  setType(t);
                  setCategory('');
                  setSelectedBranchId('');
                  setSelectedTeamId('');
                  setSelectedUserId('');
                }}
                className={`py-2 rounded-xl text-sm font-semibold transition-all border ${
                  isDealCommission ? 'opacity-50 cursor-not-allowed' : ''
                } ${
                  type === t
                    ? t === 'income'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-red-500/20 text-red-400 border-red-500/30'
                    : 'bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10'
                }`}
              >
                {t === 'income' ? 'Доход' : 'Расход'}
              </button>
            ))}
          </div>

          <div className="space-y-1.5 md:space-y-2">
            <Label className="text-xs md:text-sm">Счёт</Label>
            <Tabs value={accountType} onValueChange={(v) => setAccountType(v as 'cash' | 'account')} className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-9 md:h-10">
                <TabsTrigger value="cash" className="flex items-center gap-1.5 text-xs md:text-sm">
                  <Wallet className="h-3.5 w-3.5" /> Наличные
                </TabsTrigger>
                <TabsTrigger value="account" className="flex items-center gap-1.5 text-xs md:text-sm">
                  <CreditCard className="h-3.5 w-3.5" /> Р/Счёт
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-1.5 md:space-y-2">
            <Label className="text-xs md:text-sm">Категория</Label>
            <Select
              value={category}
              onValueChange={handleCategoryChange}
              disabled={isDealCommission}
            >
              <SelectTrigger className="h-9 md:h-10 text-xs md:text-sm">
                <SelectValue placeholder="Выберите категорию" />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {cascade && (
            <p className="text-[10px] text-muted-foreground leading-snug">
              Филиал → команда → сотрудник: сумма учитывается в выручке для мотивации и KPI.
            </p>
          )}

          {cascade && (
            <>
              <div className="space-y-1.5 md:space-y-2">
                <Label className="text-xs md:text-sm">Филиал</Label>
                <Select value={selectedBranchId} onValueChange={handleBranchChange}>
                  <SelectTrigger className="h-9 md:h-10 text-xs md:text-sm">
                    <SelectValue placeholder="Выберите филиал" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Array.isArray(branches) ? branches : []).map((branch: any) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedBranchId && (
                <div className="space-y-1.5 md:space-y-2">
                  <Label className="text-xs md:text-sm">Команда</Label>
                  <Select value={selectedTeamId} onValueChange={handleTeamChange}>
                    <SelectTrigger className="h-9 md:h-10 text-xs md:text-sm">
                      <SelectValue placeholder="Выберите команду" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no-team">Без команды</SelectItem>
                      {(Array.isArray(teams) ? teams : []).map((team: any) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedBranchId && (
                <div className="space-y-1.5 md:space-y-2">
                  <Label className="text-xs md:text-sm">Сотрудник</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger className="h-9 md:h-10 text-xs md:text-sm">
                      <SelectValue placeholder="Выберите сотрудника" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(employees) ? employees : []).map((emp: any) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {!cascade && !isDealCommission && (
            <div className="space-y-1.5 md:space-y-2">
              <Label className="text-xs md:text-sm">Описание</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Краткое описание"
                className="h-9 md:h-10 text-xs md:text-sm"
              />
            </div>
          )}

          {isDealCommission && (
            <div className="space-y-1.5 md:space-y-2">
              <Label className="text-xs md:text-sm">Описание</Label>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white/85 leading-snug">
                {description || '—'}
              </div>
            </div>
          )}

          <div className="space-y-1.5 md:space-y-2">
            <Label className="text-xs md:text-sm">
              {isDealCommission ? 'Период сделки (месяц учёта в таблице сделок)' : 'Дата операции (день / месяц / год)'}
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <Select value={bookDay} onValueChange={setBookDay}>
                <SelectTrigger className="h-9 md:h-10 text-xs md:text-sm">
                  <SelectValue placeholder="День" />
                </SelectTrigger>
                <SelectContent className="max-h-48">
                  {dayOptions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={bookMonth} onValueChange={setBookMonth}>
                <SelectTrigger className="h-9 md:h-10 text-xs md:text-sm">
                  <SelectValue placeholder="Месяц" />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_OPTIONS.map((m) => (
                    <SelectItem key={m.v} value={m.v}>
                      {m.l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={bookYear} onValueChange={setBookYear}>
                <SelectTrigger className="h-9 md:h-10 text-xs md:text-sm">
                  <SelectValue placeholder="Год" />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5 md:space-y-2">
            <Label className="text-xs md:text-sm">Сумма (₽)</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={amount ? formatInteger(Number(amount)) : ''}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className="h-9 md:h-10 text-xs md:text-sm tabular-nums"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 md:gap-3 pt-2 md:pt-4">
            <Button variant="outline" className="flex-1 h-9 md:h-10 text-xs md:text-sm" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            {isDealCommission && (
              <Button asChild variant="outline" className="flex-1 h-9 md:h-10 text-xs md:text-sm">
                <Link to="/deals" onClick={() => onOpenChange(false)}>
                  К сделкам
                </Link>
              </Button>
            )}
            <Button className="flex-1 h-9 md:h-10 text-xs md:text-sm" onClick={handleSave} disabled={submitDisabled}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2 inline" />
                  Сохранить
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
