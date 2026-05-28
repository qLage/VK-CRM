import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Property } from '@/hooks/useProperties';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useAuth } from '@/hooks/useAuth';
import { ArrowRightLeft, Loader2, Search, MapPin } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { INPUT_WITH_LEADING_ICON } from '@/lib/inputClassNames';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Property;
  onTransfer: (toUserId: string) => Promise<void>;
  isPending: boolean;
}

export function PropertyTransferDialog({ open, onOpenChange, property, onTransfer, isPending }: Props) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-branch', property.branch_id],
    queryFn: async () => {
      const { data } = await localAPI.request('/employees');
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      return list.filter((e: any) => e.branch_id === property.branch_id && e.id !== user?.id && e.is_active !== false);
    },
    enabled: open,
  });

  const filtered = (employees as any[]).filter((e: any) =>
    !search || e.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] rounded-2xl bg-zinc-950 border-white/10 p-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-6 pb-4 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/10 rounded-xl border border-violet-500/10">
              <ArrowRightLeft className="h-4 w-4 text-violet-400" />
            </div>
            <DialogTitle className="text-white font-black uppercase tracking-widest text-base">
              Передать объект
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="p-6 pb-3 space-y-4 flex-shrink-0">
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5">
            <p className="text-lg font-black text-white tracking-tighter tabular-nums">
              {Number(property.price).toLocaleString('ru-RU')} <span className="text-white/40 text-sm">₽</span>
            </p>
            <div className="flex items-center gap-1.5 text-xs text-white/60 mt-1">
              <MapPin className="h-3 w-3 text-white/40" />
              <span className="truncate">{property.address || property.city || 'Без адреса'}</span>
            </div>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-white/30" aria-hidden />
            <Input
              placeholder="Поиск сотрудника филиала..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={cn(INPUT_WITH_LEADING_ICON, 'h-11 rounded-xl bg-zinc-900/60 border-white/5')}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 space-y-1.5 min-h-[120px]">
          {filtered.map((emp: any) => (
            <button
              key={emp.id}
              onClick={() => setSelected(emp.id)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all",
                selected === emp.id
                  ? "bg-primary/15 ring-1 ring-primary/40 shadow-lg shadow-primary/10"
                  : "hover:bg-white/5 border border-transparent hover:border-white/10"
              )}
            >
              <Avatar className="h-10 w-10 border border-white/10 shrink-0">
                <AvatarImage src={emp.avatar_url} />
                <AvatarFallback className="bg-zinc-800 text-[10px] font-black">
                  {emp.full_name?.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{emp.full_name}</p>
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider truncate">
                  {emp.position_name || 'Сотрудник'}
                </p>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-white/30 text-xs py-8 font-bold uppercase tracking-widest">
              Нет сотрудников в филиале
            </p>
          )}
        </div>

        <div className="border-t border-white/5 p-4 flex-shrink-0">
          <Button
            onClick={() => selected && onTransfer(selected)}
            disabled={!selected || isPending}
            className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 disabled:opacity-40"
          >
            {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
            Передать объект
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
