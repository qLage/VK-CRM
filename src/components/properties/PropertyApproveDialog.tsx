import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Property } from '@/hooks/useProperties';
import { Check, X, Loader2, MapPin, Building2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Property;
  mode: 'approve' | 'reject';
  onAction: (action: 'approve' | 'reject', reason?: string) => Promise<void>;
  isPending: boolean;
}

export function PropertyApproveDialog({ open, onOpenChange, property, mode, onAction, isPending }: Props) {
  const [reason, setReason] = useState('');

  const handleAction = () => {
    if (mode === 'approve') {
      onAction('approve');
    } else {
      onAction('reject', reason);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl bg-zinc-950 border-white/10 p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${mode === 'approve' ? 'bg-emerald-500/10 border-emerald-500/10' : 'bg-red-500/10 border-red-500/10'}`}>
              {mode === 'approve' ? <Check className="h-4 w-4 text-emerald-400" /> : <X className="h-4 w-4 text-red-400" />}
            </div>
            <DialogTitle className="text-white font-black uppercase tracking-widest text-base">
              {mode === 'approve' ? 'Одобрение объекта' : 'Отклонение объекта'}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-5">
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/5 space-y-2">
            <p className="text-2xl font-black text-white tracking-tighter tabular-nums">
              {Number(property.price).toLocaleString('ru-RU')} <span className="text-white/40 text-base">₽</span>
            </p>
            <div className="flex items-center gap-1.5 text-xs text-white/60">
              <MapPin className="h-3.5 w-3.5 text-white/40" />
              <span className="truncate">{property.address || property.city || 'Без адреса'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-white/40 uppercase tracking-wider pt-1 border-t border-white/5">
              <Building2 className="h-3 w-3" />
              <span>Владелец: {property.owner_name}</span>
            </div>
          </div>

          {mode === 'reject' && (
            <div>
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">
                Причина отклонения
              </label>
              <Textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Опишите что нужно исправить..."
                className="rounded-xl bg-zinc-900/60 border-white/5 min-h-[80px] resize-none"
              />
            </div>
          )}

          {mode === 'approve' ? (
            <div className="pt-2">
              <p className="text-xs text-white/50 mb-4">
                Вы уверены, что хотите одобрить этот объект? После одобрения он станет доступен для публикации.
              </p>
              <Button
                onClick={handleAction}
                disabled={isPending}
                className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-emerald-500/20"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                Одобрить
              </Button>
            </div>
          ) : (
            <div className="pt-2">
              <Button
                onClick={handleAction}
                disabled={isPending || !reason.trim()}
                variant="outline"
                className="w-full h-11 rounded-xl text-red-300 border-red-500/30 hover:bg-red-500/10 hover:text-red-200 font-black uppercase tracking-widest text-[10px]"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 mr-1.5" />}
                Отклонить
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
