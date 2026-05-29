import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Loader2, Wallet, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
  MONTH_OPTIONS,
  needsKpiCascade,
} from '@/components/finances/transactionFormConfig';
import { formatInteger } from '@/utils/formatters';

const categories = {
  income: [...INCOME_CATEGORIES],
  expense: [...EXPENSE_CATEGORIES],
};

interface AddTransactionDialogProps {
  type: 'income' | 'expense';
  onAdd: (data: any) => void;
  isAdding: boolean;
  initialValues?: {
    category?: string;
    amount?: string | number;
    description?: string;
    related_user_id?: string;
  };
  trigger?: React.ReactNode;
}

function digitsFromPresetAmount(v?: string | number): string {
  if (v === undefined || v === '') return '';
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(n).replace(/\D/g, '');
}

export function AddTransactionDialog({ type, onAdd, isAdding, initialValues, trigger }: AddTransactionDialogProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(initialValues?.category || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [amount, setAmount] = useState(() => digitsFromPresetAmount(initialValues?.amount));
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(initialValues?.related_user_id || '');
  const [accountType, setAccountType] = useState<'cash' | 'account'>('cash');
  const [bookDay, setBookDay] = useState('1');
  const [bookMonth, setBookMonth] = useState('1');
  const [bookYear, setBookYear] = useState(String(new Date().getFullYear()));

  const cascade = needsKpiCascade(type, category);

  useEffect(() => {
    if (!open) return;
    const t = new Date();
    setBookDay(String(t.getDate()));
    setBookMonth(String(t.getMonth() + 1));
    setBookYear(String(t.getFullYear()));
    if (initialValues?.amount != null && initialValues.amount !== '') {
      setAmount(digitsFromPresetAmount(initialValues.amount));
    } else {
      setAmount('');
    }
  }, [open, initialValues?.amount]);

  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/branches');
      if (error) throw error;
      const branchesData = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      return branchesData;
    },
    enabled: open && cascade,
  });

  const { data: allTeams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/teams');
      if (error) throw error;
      const teamsData = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      return teamsData;
    },
    enabled: open && cascade && !!selectedBranchId,
  });

  const teams = allTeams.filter((team: any) =>
    String(team.branch_id) === String(selectedBranchId)
  );

  const { data: allEmployees = [] } = useQuery({
    queryKey: ['employees-for-transaction'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/employees');
      if (error) throw error;
      const employeesArray = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      return employeesArray.filter((e: any) => e.is_active);
    },
    enabled: open && cascade && !!selectedBranchId,
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
    const now = new Date();
    return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).toISOString();
  };

  const handleSubmit = () => {
    if (!category || !amount) return;
    if (cascade && !selectedUserId) return;

    const selectedEmployee = employees.find(e => e.id === selectedUserId);
    const name = selectedEmployee?.full_name || 'Сотрудник';

    let desc = description.trim();
    if (cascade) {
      if (category === 'premium') desc = `Премия — ${name}`;
      else if (category === 'salary') desc = `Зарплата — ${name}`;
      else if (category === 'commission') desc = `Комиссия — ${name}`;
      else if (category === 'bonus') desc = `Бонус — ${name}`;
    }

    if (!cascade && !desc) return;

    const booked_at = buildBookedAtIso();

    onAdd({
      type,
      category,
      description: desc,
      amount: Number(amount),
      account_type: accountType,
      ...(selectedUserId && { related_user_id: selectedUserId }),
      ...(booked_at && { booked_at }),
    });

    setOpen(false);
    setCategory('');
    setDescription('');
    setAmount('');
    setSelectedBranchId('');
    setSelectedTeamId('');
    setSelectedUserId('');
    setAccountType('cash');
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
  const dayInMonth = parseInt(bookMonth, 10) && parseInt(bookYear, 10)
    ? new Date(parseInt(bookYear, 10), parseInt(bookMonth, 10), 0).getDate()
    : 31;
  const dayOptions = Array.from({ length: dayInMonth }, (_, i) => String(i + 1));

  const submitDisabled =
    isAdding ||
    !category ||
    !amount ||
    Number(amount) <= 0 ||
    (cascade && !selectedUserId) ||
    (!cascade && !description.trim());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ? trigger : (
          <Button variant="outline" className="gap-2">
            {type === 'income' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {type === 'income' ? 'Добавить доход' : 'Добавить расход'}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base md:text-lg">{type === 'income' ? 'Новый доход' : 'Новый расход'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 md:space-y-4 pt-3 md:pt-4">

          <div className="space-y-1.5 md:space-y-2">
            <Label className="text-xs md:text-sm">Счет</Label>
            <Tabs value={accountType} onValueChange={(v) => setAccountType(v as 'cash' | 'account')} className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-9 md:h-10">
                <TabsTrigger value="cash" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm">
                  <Wallet className="h-3.5 w-3.5 md:h-4 md:w-4" /> Наличные
                </TabsTrigger>
                <TabsTrigger value="account" className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm">
                  <CreditCard className="h-3.5 w-3.5 md:h-4 md:w-4" /> Р/Счет
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-1.5 md:space-y-2">
            <Label className="text-xs md:text-sm">Категория</Label>
            <Select value={category} onValueChange={handleCategoryChange}>
              <SelectTrigger className="h-9 md:h-10 text-xs md:text-sm">
                <SelectValue placeholder="Выберите категорию" />
              </SelectTrigger>
              <SelectContent>
                {categories[type].map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {cascade && (
            <p className="text-[10px] text-muted-foreground leading-snug">
              Филиал → команда → сотрудник: сумма учитывается в выручке для мотивации и KPI (рейтинг), не меняет расчёт оклада в других модулях.
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
                      <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
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
                        <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
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
                        <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {!cascade && (
            <div className="space-y-1.5 md:space-y-2">
              <Label className="text-xs md:text-sm">Описание</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Например: Комиссия за сделку — Петров А."
                className="h-9 md:h-10 text-xs md:text-sm"
              />
            </div>
          )}

          <div className="space-y-1.5 md:space-y-2">
            <Label className="text-xs md:text-sm">Дата операции (день / месяц / год)</Label>
            <div className="grid grid-cols-3 gap-2">
              <Select value={bookDay} onValueChange={setBookDay}>
                <SelectTrigger className="h-9 md:h-10 text-xs md:text-sm"><SelectValue placeholder="День" /></SelectTrigger>
                <SelectContent className="max-h-48">
                  {dayOptions.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={bookMonth} onValueChange={setBookMonth}>
                <SelectTrigger className="h-9 md:h-10 text-xs md:text-sm"><SelectValue placeholder="Месяц" /></SelectTrigger>
                <SelectContent>
                  {MONTH_OPTIONS.map((m) => (
                    <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={bookYear} onValueChange={setBookYear}>
                <SelectTrigger className="h-9 md:h-10 text-xs md:text-sm"><SelectValue placeholder="Год" /></SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
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
              placeholder="100 000"
              className="h-9 md:h-10 text-xs md:text-sm tabular-nums"
            />
          </div>

          <div className="flex gap-2 md:gap-3 pt-2 md:pt-4">
            <Button variant="outline" className="flex-1 h-9 md:h-10 text-xs md:text-sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              className="flex-1 gradient-accent text-primary-foreground h-9 md:h-10 text-xs md:text-sm"
              onClick={handleSubmit}
              disabled={submitDisabled}
            >
              {isAdding ? <Loader2 className="h-3.5 w-3.5 md:h-4 md:w-4 animate-spin" /> : 'Добавить'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
