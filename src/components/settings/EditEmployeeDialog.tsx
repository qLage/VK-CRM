import { useState, useEffect, useMemo } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { localAPI } from '@/integrations/localAPI';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatPhoneRu } from '@/lib/phone-utils';

interface EditEmployeeDialogProps {
  employee: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditEmployeeDialog({ employee, open, onOpenChange }: EditEmployeeDialogProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    position_id: 'none' as string,
    is_active: true,
    branch_id: '',
  });

  useEffect(() => {
    if (employee) {
      setForm({
        full_name: employee.full_name || '',
        phone: employee.phone ? formatPhoneRu(employee.phone) : '',
        email: employee.email || '',
        position_id: employee.position_id || 'none',
        is_active: employee.is_active,
        branch_id: employee.branch_id || '',
      });
    } else {
      setForm({
        full_name: '',
        phone: '',
        email: '',
        position_id: 'none',
        is_active: true,
        branch_id: '',
      });
    }
  }, [employee]);

  const { data: branches = [] } = useQuery({
    queryKey: ['branches-list'],
    queryFn: async () => {
      const { data } = await localAPI.request('/branches');
      if (Array.isArray((data as any)?.data)) return (data as any).data;
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

  const selectedPositionName =
    form.position_id !== 'none'
      ? (sortedPositions.find((p: any) => String(p.id) === String(form.position_id))?.name || '')
      : '';

  const handleSubmit = async () => {
    if (!form.full_name) {
      toast.error('ФИО обязательно');
      return;
    }

    if (!employee?.id) {
      toast.error('Не найден сотрудник');
      return;
    }

    setLoading(true);
    try {
      const { error } = await localAPI.request(`/employees/${employee.id}`, {
        method: 'PATCH',
        body: {
          full_name: form.full_name,
          phone: form.phone,
          email: form.email || null,
          branch_id: form.branch_id || null,
          position_id: form.position_id === 'none' ? null : form.position_id,
          is_active: form.is_active,
        },
      });

      if (error) throw error;

      toast.success('Сотрудник обновлен');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || 'Ошибка при обновлении');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle>Редактирование сотрудника</DialogTitle>
          <DialogDescription className="sr-only">
            Изменение личных данных, должности и доступа к объектам
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2 overflow-y-auto flex-1 pr-1">
          <div className="space-y-2">
            <Label>Должность</Label>
            <Select value={String(form.position_id)} onValueChange={(v) => setForm({ ...form, position_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Не выбрана" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не выбрана</SelectItem>
                {sortedPositions.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              {selectedPositionName ? `Должность: ${selectedPositionName}` : 'Должность не выбрана'}
            </div>
          </div>

          <div className="space-y-2">
            <Label>ФИО</Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="normal-case font-medium tracking-normal"
            />
          </div>

          <div className="space-y-2">
            <Label>Email (необязательно)</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="employee@company.com (необязательно)"
              className="normal-case font-medium tracking-normal"
            />
          </div>

          <div className="space-y-2">
            <Label>Телефон</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: formatPhoneRu(e.target.value) })}
              placeholder="+7 (999) 999-99-99"
              className="normal-case font-medium tracking-normal"
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30">
            <Label className="cursor-pointer">Активен</Label>
            <Switch checked={Boolean(form.is_active)} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
          </div>

          <div className="space-y-2 pt-2 border-t border-border/50">
            <Label>Филиал</Label>
            <Select
              value={form.branch_id || 'none'}
              onValueChange={(v) => setForm({ ...form, branch_id: v === 'none' ? '' : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Без филиала" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не выбран</SelectItem>
                {(Array.isArray(branches) ? branches : []).map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-border/50">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            className="flex-1 gradient-accent text-primary-foreground"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" /> Сохранить
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
