import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Loader2, Save } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { toast } from 'sonner';

interface EditEmployeePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: {
    user_id: string;
    full_name: string;
    target_revenue: number;
    target_deals: number;
    target_deposits: number;
    target_objects: number;
    target_newbuildings: number;
    target_mortgage: number;
  };
  year: number;
  quarter: number;
}

export function EditEmployeePlanDialog({
  open,
  onOpenChange,
  employee,
  year,
  quarter,
}: EditEmployeePlanDialogProps) {
  const queryClient = useQueryClient();
  const [targets, setTargets] = useState({
    revenue: employee.target_revenue,
    deals: employee.target_deals,
    deposits: employee.target_deposits,
    objects: employee.target_objects,
    newbuildings: employee.target_newbuildings,
    mortgage: employee.target_mortgage,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        year,
        quarter,
        target_revenue: targets.revenue,
        target_deals: targets.deals,
        target_deposits: targets.deposits,
        target_objects: targets.objects,
        target_newbuildings: targets.newbuildings,
        target_mortgage: targets.mortgage,
      };
      const { data, error } = await localAPI.request(
        `/plans/employee/${employee.user_id}`,
        { method: 'PUT', body: payload }
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('План сотрудника успешно обновлен');
      queryClient.invalidateQueries({ queryKey: ['plan-allocations', year, quarter] });
      queryClient.invalidateQueries({ queryKey: ['quarterly-plan', year, quarter] });
      // Comprehensive invalidation for all plan-related queries
      queryClient.invalidateQueries({ queryKey: ['rating-all-user-plans'] });
      queryClient.invalidateQueries({ queryKey: ['analytics-targets'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpi-stats-detailed', employee.user_id] });
      queryClient.invalidateQueries({ queryKey: ['dual-kpi', employee.user_id] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(`Ошибка обновления: ${err.message || 'Неизвестная ошибка'}`);
    },
  });

  const handleTargetChange = (key: keyof typeof targets, value: number) => {
    setTargets((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-black text-white uppercase tracking-tight">
            Редактировать план: {employee.full_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Revenue */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-xs font-black text-white/60 uppercase tracking-wider">
                Выручка
              </Label>
              <div className="text-lg font-black text-white">
                {targets.revenue.toLocaleString()} ₽
              </div>
            </div>
            <Slider
              value={[targets.revenue]}
              min={0}
              max={10000000}
              step={100000}
              onValueChange={(v) => handleTargetChange('revenue', v[0])}
            />
          </div>

          {/* Deals */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-xs font-black text-white/60 uppercase tracking-wider">
                Сделки
              </Label>
              <div className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 font-black text-white text-sm">
                {targets.deals}
              </div>
            </div>
            <Slider
              value={[targets.deals]}
              min={0}
              max={50}
              step={1}
              onValueChange={(v) => handleTargetChange('deals', v[0])}
            />
          </div>

          {/* Deposits */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-xs font-black text-white/60 uppercase tracking-wider">
                Задатки
              </Label>
              <div className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 font-black text-white text-sm">
                {targets.deposits}
              </div>
            </div>
            <Slider
              value={[targets.deposits]}
              min={0}
              max={30}
              step={1}
              onValueChange={(v) => handleTargetChange('deposits', v[0])}
            />
          </div>

          {/* Objects */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-xs font-black text-white/60 uppercase tracking-wider">
                Объекты
              </Label>
              <div className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 font-black text-white text-sm">
                {targets.objects}
              </div>
            </div>
            <Slider
              value={[targets.objects]}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) => handleTargetChange('objects', v[0])}
            />
          </div>

          {/* Newbuildings */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-xs font-black text-white/60 uppercase tracking-wider">
                Новостройки
              </Label>
              <div className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 font-black text-white text-sm">
                {targets.newbuildings}
              </div>
            </div>
            <Slider
              value={[targets.newbuildings]}
              min={0}
              max={20}
              step={1}
              onValueChange={(v) => handleTargetChange('newbuildings', v[0])}
            />
          </div>

          {/* Mortgage */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-xs font-black text-white/60 uppercase tracking-wider">
                Ипотека
              </Label>
              <div className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 font-black text-white text-sm">
                {targets.mortgage}
              </div>
            </div>
            <Slider
              value={[targets.mortgage]}
              min={0}
              max={25}
              step={1}
              onValueChange={(v) => handleTargetChange('mortgage', v[0])}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-white/5 border-white/10 hover:bg-white/10 text-white"
          >
            Отмена
          </Button>
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            className="bg-primary hover:bg-primary/80 text-primary-foreground"
          >
            {updateMutation.isPending ? (
              <Loader2 className="animate-spin mr-2 h-4 w-4" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
