import { useState, useMemo } from 'react';
import { UserPlus, Loader2, Eye, EyeOff, User, Mail, Phone, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { localAPI } from '@/integrations/localAPI';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatPhoneRu } from '@/lib/phone-utils';
import { INPUT_WITH_LEADING_ICON } from '@/lib/inputClassNames';
import { cn } from '@/lib/utils';


interface AddEmployeeDialogProps {
  defaultBranchId?: string;
  defaultTeamId?: string;
}

export function AddEmployeeDialog({ defaultBranchId, defaultTeamId }: AddEmployeeDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    email: '',
    password: '',
    lastName: '',
    firstName: '',
    middleName: '',
    phone: '',
    position_id: '',
    has_salary: false,
    salary_amount: '',
    commission_percent: '40',
    branch_id: defaultBranchId || '',
    team_id: defaultTeamId || '',
    is_new_building: false,
    realtor_type: 'universal' as 'universal' | 'secondary' | 'newbuildings',
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches-list'],
    queryFn: async () => {
      const { data } = await localAPI.request('/branches');
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data)) return data;
      return [];
    },
    enabled: open,
  });

  const { data: positions = [] } = useQuery({
    queryKey: ['positions-list'],
    queryFn: async () => {
      const { data } = await localAPI.request('/positions');
      if (Array.isArray((data as any)?.data)) return (data as any).data;
      if (Array.isArray(data)) return data;
      return [];
    },
    enabled: open,
  });

  const sortedPositions = useMemo(() => {
    return [...positions].sort((a: any, b: any) => {
      const orderA = a?.sort_order ?? 999;
      const orderB = b?.sort_order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    });
  }, [positions]);

  const handlePhoneChange = (value: string) => {
    setForm(prev => ({ ...prev, phone: formatPhoneRu(value) }));
  };

  const handleEmailChange = (value: string) => {
    const filtered = value.replace(/[^a-zA-Z0-9@._+\-]/g, '');
    setForm(prev => ({ ...prev, email: filtered }));
  };

  const handleSubmit = async () => {
    const fullName = [form.lastName, form.firstName, form.middleName].filter(Boolean).join(' ');
    if (!fullName || !form.password) {
      toast.error('Заполните обязательные поля (Фамилия, Имя и Пароль)');
      return;
    }

    if (form.password.length < 6) {
      toast.error('Пароль должен быть не менее 6 символов');
      return;
    }

    if (form.phone) {
      const phoneDigits = form.phone.replace(/\D/g, '');
      if (phoneDigits.length !== 11) {
        toast.error('Введите полный номер телефона');
        return;
      }
    }

    setLoading(true);
    try {
      const { data, error } = await localAPI.request('/users', {
        method: 'POST',
        body: {
          email: form.email || null,
          password: form.password,
          full_name: fullName,
          phone: form.phone,
          branch_id: form.branch_id || null,
          position_id: form.position_id || null,
          realtor_type: form.realtor_type,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Сотрудник ${fullName} добавлен`);
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employees'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['shared-employees'] });
      queryClient.invalidateQueries({ queryKey: ['team-employees'] });
      setOpen(false);
      setForm({
        email: '',
        password: '',
        lastName: '',
        firstName: '',
        middleName: '',
        phone: '',
        position_id: '',
        has_salary: false,
        salary_amount: '',
        commission_percent: '40',
        branch_id: defaultBranchId || '',
        team_id: defaultTeamId || '',
        is_new_building: false,
        realtor_type: 'universal' as const,
      });
    } catch (error: any) {
      toast.error(error.message || 'Ошибка при добавлении сотрудника');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gradient-accent text-primary-foreground gap-2 w-full sm:w-auto">
          <UserPlus className="h-4 w-4" />
          Добавить сотрудника
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle>Новый сотрудник</DialogTitle>
          <DialogDescription className="sr-only">
            Добавление нового сотрудника: должность задаёт права доступа в системе
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2 overflow-y-auto flex-1 pr-1 -mr-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Фамилия *</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  placeholder="Иванов"
                  className={cn(INPUT_WITH_LEADING_ICON, 'text-base normal-case font-medium tracking-normal')}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Имя *</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  placeholder="Иван"
                  className={cn(INPUT_WITH_LEADING_ICON, 'text-base normal-case font-medium tracking-normal')}
                />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Отчество (необязательно)</Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={form.middleName}
                onChange={(e) => setForm({ ...form, middleName: e.target.value })}
                placeholder="Иванович"
                className={cn(INPUT_WITH_LEADING_ICON, 'text-base normal-case font-medium tracking-normal')}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Филиал</Label>
            <Select value={form.branch_id || 'none'} onValueChange={(v) => setForm({ ...form, branch_id: v === 'none' ? '' : v })}>
              <SelectTrigger className="normal-case font-medium tracking-normal"><SelectValue placeholder="Без филиала" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="normal-case font-medium">Не выбран</SelectItem>
                {(Array.isArray(branches) ? branches : []).map((b: any) => (<SelectItem key={b.id} value={b.id} className="normal-case font-medium">{b.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Должность</Label>
            <Select value={form.position_id || 'none'} onValueChange={(v) => setForm({ ...form, position_id: v === 'none' ? '' : v })}>
              <SelectTrigger className="normal-case font-medium tracking-normal">
                <SelectValue placeholder="Не выбрана" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="normal-case font-medium">Не выбрана</SelectItem>
                {sortedPositions.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)} className="normal-case font-medium">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Телефон</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="tel"
                  inputMode="numeric"
                  value={form.phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="+7 (999) 999-99-99"
                  className={cn(INPUT_WITH_LEADING_ICON, 'text-[16px] normal-case font-medium tracking-normal')}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email (необязательно)</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder="employee@company.com (необязательно)"
                  className={cn(INPUT_WITH_LEADING_ICON, 'text-[16px] normal-case font-medium tracking-normal')}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Пароль *</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Минимум 6 символов"
                className="pr-10 pl-4 text-[16px] normal-case font-medium tracking-normal"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Специализация</Label>
            <div className="relative">
              <Target className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Select
                value={form.realtor_type}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    realtor_type: v as 'universal' | 'secondary' | 'newbuildings',
                  })
                }
              >
                <SelectTrigger className={cn(INPUT_WITH_LEADING_ICON, 'normal-case font-medium tracking-normal')}>
                  <SelectValue placeholder="Выберите специализацию" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="universal" className="normal-case font-medium">Универсальный боец</SelectItem>
                  <SelectItem value="secondary" className="normal-case font-medium">Вторичка</SelectItem>
                  <SelectItem value="newbuildings" className="normal-case font-medium">Новостройки</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-4 border-t border-border/50">
          <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button
            className="flex-1 gradient-accent text-primary-foreground"
            onClick={handleSubmit}
            disabled={loading || !form.password || !form.lastName || !form.firstName}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Создать'}
          </Button>
        </div>
      </DialogContent>
    </Dialog >
  );
}
