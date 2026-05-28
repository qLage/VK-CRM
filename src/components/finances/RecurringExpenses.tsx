import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Loader2, Trash2, Edit, CalendarClock, AlertCircle, Check, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatInteger } from '@/utils/formatters';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useAuth } from '@/hooks/useAuth';
import { useFinances } from '@/hooks/useFinances';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from 'sonner';

const expenseCategories = [
  { value: 'rent', label: 'Аренда офиса' },
  { value: 'salary', label: 'Зарплата (оклад)' },
  { value: 'utilities', label: 'Коммунальные услуги' },
  { value: 'marketing', label: 'Маркетинг' },
  { value: 'subscription', label: 'Подписки/Сервисы' },
  { value: 'other_expense', label: 'Прочий расход' },
];

const categoryLabels: Record<string, string> = {
  rent: 'Аренда',
  salary: 'Зарплата',
  utilities: 'Коммунальные',
  marketing: 'Маркетинг',
  subscription: 'Подписки',
  other_expense: 'Прочее',
};

interface RecurringExpense {
  id: string;
  name: string;
  category: string;
  amount: number;
  payment_days: number[];
  is_active: boolean;
  related_user_id: string | null;
  created_at: string;
}

export function RecurringExpenses() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editItem, setEditItem] = useState<RecurringExpense | null>(null);
  const { transactions = [], addTransaction, isAdding: isPaying } = useFinances();
  const [payoutItem, setPayoutItem] = useState<RecurringExpense | null>(null);

  const handleConfirmPay = (amount: number, accountType: 'cash' | 'account') => {
    if (!payoutItem) return;
    
    addTransaction({
      type: 'expense',
      category: payoutItem.category,
      description: `${payoutItem.name} (Регулярный платёж)`,
      amount: amount,
      account_type: accountType,
      related_user_id: payoutItem.related_user_id || undefined
    });
    setPayoutItem(null);
  };

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['recurring-expenses'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/recurring-expenses');
      if (error) throw error;

      // API may return either an array or an envelope object; normalize to array
      const arr = Array.isArray(data)
        ? data
        : (Array.isArray((data as any)?.data) ? (data as any).data : []);

      return arr as RecurringExpense[];
    },
    staleTime: 180000, // Cache for 3 minutes
    gcTime: 900000,
    refetchOnWindowFocus: false,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-list-short'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/employees');
      if (error) throw error;
      const employeesArray = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      return employeesArray.filter((e: any) => e.is_active);
    },
    staleTime: 120000, // Cache for 2 minutes
  });

  const createMutation = useMutation({
    mutationFn: async (expense: Omit<RecurringExpense, 'id' | 'created_at'>) => {
      const { error } = await localAPI.request('/recurring-expenses', {
        method: 'POST',
        body: { ...expense, created_by: user!.id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] });
      toast.success('Регулярный расход добавлен');
      setIsAdding(false);
    },
    onError: () => toast.error('Ошибка при добавлении'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<RecurringExpense> & { id: string }) => {
      const { error } = await localAPI.request(`/recurring-expenses/${id}`, {
        method: 'PUT',
        body: updates,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] });
      toast.success('Обновлено');
      setEditItem(null);
      setIsAdding(false);
    },
    onError: () => toast.error('Ошибка при обновлении'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await localAPI.request(`/recurring-expenses/${id}`, {
        method: 'DELETE',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] });
      toast.success('Удалено');
    },
    onError: () => toast.error('Ошибка при удалении'),
  });

  // Calculate smart reminders - which expenses have unpaid slots
  const today = new Date().getDate();
  const currentMonthTransactions = transactions.filter((tx: any) => {
    const txDate = new Date(tx.created_at);
    const now = new Date();
    return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
  });

  const getUnpaidDays = (expense: RecurringExpense) => {
    if (!expense.is_active) return [];
    
    // Count how many times this expense was paid this month
    const paidCount = currentMonthTransactions.filter((tx: any) => 
      tx.type === 'expense' && 
      tx.description?.toLowerCase().includes(expense.name.toLowerCase())
    ).length;

    // Sort payment days and skip the ones already covered by payments
    const sortedDays = [...expense.payment_days].sort((a, b) => a - b);
    return sortedDays.slice(paidCount);
  };

  const dueExpenses = expenses.flatMap(e => {
    const unpaidDays = getUnpaidDays(e);
    return unpaidDays
      .filter(day => {
        const diff = day - today;
        return diff >= 0 && diff <= 3;
      })
      .map(day => ({ ...e, reminder_day: day }));
  });

  const overdueExpenses = expenses.flatMap(e => {
    const unpaidDays = getUnpaidDays(e);
    return unpaidDays
      .filter(day => {
        const diff = today - day;
        return diff > 0 && diff <= 10; // Show overdue for up to 10 days
      })
      .map(day => ({ ...e, reminder_day: day }));
  });

  const totalMonthly = expenses.filter(e => e.is_active).reduce((sum, e) => sum + Number(e.amount) * e.payment_days.length, 0);

  return (
    <div className="space-y-6">
      {/* Reminders */}
      {(dueExpenses.length > 0 || overdueExpenses.length > 0) && (
        <Card className="glass-card border-warning/30 bg-warning/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-5 w-5 text-warning" />
              Напоминания о платежах
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdueExpenses.map(exp => (
              <div key={`overdue-${exp.id}-${exp.reminder_day}`} className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <div>
                    <p className="font-medium text-sm">{exp.name}</p>
                    <p className="text-xs text-muted-foreground">Просрочено ({exp.reminder_day} число) • {categoryLabels[exp.category] || exp.category}</p>
                  </div>
                </div>
                <p className="font-bold text-destructive">{Number(exp.amount).toLocaleString('ru-RU')} ₽</p>
              </div>
            ))}
            {dueExpenses.map(exp => (
              <div key={`due-${exp.id}-${exp.reminder_day}`} className="flex items-center justify-between p-3 rounded-lg bg-warning/10 border border-warning/20">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-warning" />
                  <div>
                    <p className="font-medium text-sm">{exp.name}</p>
                    <p className="text-xs text-muted-foreground">Скоро к оплате ({exp.reminder_day} число) • Ожидается выплата</p>
                  </div>
                </div>
                <p className="font-bold text-warning">{Number(exp.amount).toLocaleString('ru-RU')} ₽</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="glass-card border-border/50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Регулярных расходов</p>
            <p className="text-xl font-bold">{expenses.filter(e => e.is_active).length}</p>
          </div>
        </Card>
        <Card className="glass-card border-border/50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Сумма в месяц</p>
            <p className="text-xl font-bold text-destructive">{totalMonthly.toLocaleString('ru-RU')} ₽</p>
          </div>
        </Card>
      </div>

      {/* List */}
      <Card className="glass-card border-border/50">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-5 w-5 text-primary" />
              Регулярные расходы
            </CardTitle>
            <CardDescription>Аренда, зарплаты, подписки и другие повторяющиеся платежи</CardDescription>
          </div>
          <ExpenseFormDialog
            open={isAdding}
            onOpenChange={(open) => {
              setIsAdding(open);
              if (!open) setEditItem(null);
            }}
            onSubmit={(data) => {
              if (editItem) {
                updateMutation.mutate({ id: editItem.id, ...data });
              } else {
                createMutation.mutate(data);
              }
            }}
            isPending={createMutation.isPending || updateMutation.isPending}
            employees={employees}
            initialData={editItem || undefined}
            trigger={
              <Button size="sm" className="gradient-accent text-primary-foreground gap-1" onClick={() => setEditItem(null)}>
                <Plus className="h-4 w-4" /> Добавить
              </Button>
            }
          />
        </CardHeader>
        <CardContent className="space-y-3">
          {expenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Нет регулярных расходов</p>
              <p className="text-xs mt-1">Добавьте аренду, зарплаты и другие постоянные платежи</p>
            </div>
          ) : (
            expenses.map((expense, index) => (
              <motion.div
                key={expense.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className={cn(
                  "flex items-center justify-between gap-3 p-4 rounded-xl border border-border/30",
                  expense.is_active ? "bg-secondary/30" : "bg-secondary/10 opacity-60"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{expense.name}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {categoryLabels[expense.category] || expense.category}
                    </Badge>
                    {!expense.is_active && (
                      <Badge variant="secondary" className="text-[10px]">Неактивно</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Оплата: {expense.payment_days.sort((a, b) => a - b).join(', ')} числа каждого месяца
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <p className="font-bold text-destructive">{Number(expense.amount).toLocaleString('ru-RU')} ₽</p>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-white"
                      onClick={() => {
                        setEditItem(expense);
                        setIsAdding(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Switch
                      checked={expense.is_active}
                      onCheckedChange={(checked) => updateMutation.mutate({ id: expense.id, is_active: checked })}
                      className="scale-75"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                      disabled={isPaying}
                      onClick={() => setPayoutItem(expense)}
                      title="Выплатить сейчас"
                    >
                      <Wallet className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="sm:rounded-2xl">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Удалить расход?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Вы собираетесь удалить регулярный расход "{expense.name}". 
                            Это действие нельзя отменить.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-xl">Отмена</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => deleteMutation.mutate(expense.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
                          >
                            Удалить
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </CardContent>
      </Card>

      <ConfirmPayoutDialog
        expense={payoutItem}
        open={!!payoutItem}
        onOpenChange={(open) => !open && setPayoutItem(null)}
        onConfirm={handleConfirmPay}
        isPending={isPaying}
      />
    </div>
  );
}

function recurringAmountDigits(v?: number | string | null): string {
  if (v == null || v === '') return '';
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(n).replace(/\D/g, '');
}

function ExpenseFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  employees,
  trigger,
  initialData,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
  employees: { id: string; full_name: string; has_salary: boolean | null }[];
  trigger: React.ReactNode;
  initialData?: RecurringExpense;
}) {
  const [name, setName] = useState(initialData?.name || '');
  const [category, setCategory] = useState(initialData?.category || '');
  const [amount, setAmount] = useState(recurringAmountDigits(initialData?.amount));
  const [paymentDaysStr, setPaymentDaysStr] = useState(initialData?.payment_days?.join(', ') || '1');
  const [relatedUserId, setRelatedUserId] = useState(initialData?.related_user_id || '');

  // Update state when initialData changes
  useEffect(() => {
    if (open) { // Only update when opening
      setName(initialData?.name || '');
      setCategory(initialData?.category || '');
      setAmount(recurringAmountDigits(initialData?.amount));
      setPaymentDaysStr(initialData?.payment_days?.join(', ') || '1');
      setRelatedUserId(initialData?.related_user_id || '');
    }
  }, [initialData, open]);

  const handleSubmit = () => {
    if (!name || !category || !amount) return;
    const paymentDays = paymentDaysStr
      .split(',')
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n >= 1 && n <= 31);

    if (paymentDays.length === 0) return;

    onSubmit({
      name,
      category,
      amount: Number(amount),
      payment_days: paymentDays,
      is_active: true,
      related_user_id: relatedUserId || null,
    });

    setName('');
    setCategory('');
    setAmount('');
    setPaymentDaysStr('1');
    setRelatedUserId('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Редактировать расход' : 'Новый регулярный расход'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Аренда офиса" />
          </div>
          <div className="space-y-2">
            <Label>Категория</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
              <SelectContent>
                {expenseCategories.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {category === 'salary' && (
            <div className="space-y-2">
              <Label>Сотрудник (необязательно)</Label>
              <Select value={relatedUserId} onValueChange={setRelatedUserId}>
                <SelectTrigger><SelectValue placeholder="Для всех с окладом" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все сотрудники с окладом</SelectItem>
                  {Array.isArray(employees) && employees.filter(e => e.has_salary).map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Сумма (₽)</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={amount ? formatInteger(Number(amount)) : ''}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
              placeholder="50 000"
              className="tabular-nums"
            />
          </div>
          <div className="space-y-2">
            <Label>Дни оплаты в месяце</Label>
            <Input
              value={paymentDaysStr}
              onChange={(e) => setPaymentDaysStr(e.target.value)}
              placeholder="1, 15"
            />
            <p className="text-xs text-muted-foreground">Числа через запятую (например: 1, 15 — два раза в месяц)</p>
          </div>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button
              className="flex-1 gradient-accent text-primary-foreground"
              onClick={handleSubmit}
              disabled={isPending || !name || !category || !amount}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (initialData ? 'Сохранить' : 'Добавить')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmPayoutDialog({
  expense,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  expense: RecurringExpense | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (amount: number, accountType: 'cash' | 'account') => void;
  isPending: boolean;
}) {
  const [amount, setAmount] = useState('');
  const [accountType, setAccountType] = useState<'cash' | 'account'>('cash');

  useEffect(() => {
    if (open && expense) {
      setAmount(recurringAmountDigits(expense.amount));
      setAccountType('cash');
    }
  }, [open, expense]);

  if (!expense) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle>Подтверждение выплаты</DialogTitle>
          <CardDescription>
            Вы собираетесь зафиксировать выплату по расходу «{expense.name}»
          </CardDescription>
        </DialogHeader>
        <div className="space-y-6 pt-4">
          <div className="space-y-2">
            <Label>Сумма выплаты (₽)</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={amount ? formatInteger(Number(amount)) : ''}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className="tabular-nums"
            />
          </div>
          
          <div className="space-y-3">
            <Label>Способ оплаты</Label>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant={accountType === 'cash' ? 'default' : 'outline'}
                className={cn("rounded-xl h-12", accountType === 'cash' && "gradient-accent text-primary-foreground border-none")}
                onClick={() => setAccountType('cash')}
              >
                Наличные
              </Button>
              <Button
                type="button"
                variant={accountType === 'account' ? 'default' : 'outline'}
                className={cn("rounded-xl h-12", accountType === 'account' && "gradient-accent text-primary-foreground border-none")}
                onClick={() => setAccountType('account')}
              >
                Р/Счет
              </Button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button
              className="flex-1 gradient-accent text-primary-foreground rounded-xl"
              onClick={() => onConfirm(Number(amount), accountType)}
              disabled={isPending || !amount || Number(amount) <= 0}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Подтвердить'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
