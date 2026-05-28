import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Building2, Search, X, Check, MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { INPUT_WITH_LEADING_ICON } from '@/lib/inputClassNames';

interface PropertyLite {
  id: string;
  category: string;
  city: string | null;
  address: string | null;
  price: number;
  rooms: string | null;
  area_total: number | null;
  status: string;
  owner_name: string;
  cover_url?: string | null;
}

interface Props {
  value: string;                                  // selected property_id
  fallbackName: string;                           // free text property_name fallback
  onChange: (id: string, name: string) => void;
  onClear: () => void;
  className?: string;
}

const STATUS_LABEL: Record<string, string> = {
  approved: 'Одобрен',
  avito_pending: 'Avito ожидание',
  avito_approved: 'Avito одобрен',
  published_avito: 'Опубликован',
};

export function PropertyPicker({ value, fallbackName, onChange, onClear, className }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Search query — only fetch when popover open
  const { data, isFetching } = useQuery({
    queryKey: ['property-picker', search],
    queryFn: async () => {
      const params = new URLSearchParams();
      // Only show selectable (not draft/rejected/archived/transfer)
      params.set('view', 'team');
      if (search) params.set('search', search);
      const { data } = await localAPI.request(`/properties?${params.toString()}`);
      const list = (data?.data || []) as PropertyLite[];
      // Filter: only sellable statuses
      return list.filter(p => ['approved', 'avito_pending', 'avito_approved', 'published_avito', 'in_feed'].includes(p.status));
    },
    enabled: open,
    staleTime: 10000,
  });

  // Resolve current selected for badge display
  const { data: selected } = useQuery({
    queryKey: ['property-picker-current', value],
    queryFn: async () => {
      if (!value) return null;
      const { data } = await localAPI.request(`/properties/${value}`);
      return data as PropertyLite;
    },
    enabled: !!value,
    staleTime: 30000,
  });

  const display = useMemo(() => {
    if (selected) {
      return `${selected.address || selected.city || 'Без адреса'} · ${Number(selected.price).toLocaleString('ru-RU')} ₽`;
    }
    return fallbackName || '';
  }, [selected, fallbackName]);

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border text-left transition-all hover:border-primary/30 hover:bg-white/[0.05]",
              value ? "border-primary/40" : "border-white/5"
            )}
          >
            <div className={cn("p-2 rounded-xl border shrink-0",
              value ? "bg-primary/10 border-primary/20" : "bg-white/5 border-white/5")}>
              <Building2 className={cn("h-4 w-4", value ? "text-primary" : "text-white/40")} />
            </div>
            <div className="flex-1 min-w-0">
              {value && selected ? (
                <>
                  <p className="text-sm font-bold text-white truncate">{selected.address || selected.city || 'Без адреса'}</p>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider truncate">
                    {Number(selected.price).toLocaleString('ru-RU')} ₽
                    {selected.rooms ? ` · ${selected.rooms === 'Студия' ? 'Студия' : selected.rooms === 'Своб. планировка' ? 'Своб. планировка' : selected.rooms === '10 и более' ? '10+ комн.' : /^\d+$/.test(String(selected.rooms)) ? `${selected.rooms}-комн.` : selected.rooms}` : ''}
                    {selected.area_total ? ` · ${selected.area_total} м²` : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-white/60">
                    {display || 'Выберите объект из CRM или введите вручную'}
                  </p>
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">
                    Объект недвижимости
                  </p>
                </>
              )}
            </div>
            {value && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClear(); }}
                className="p-1.5 rounded-lg text-white/40 hover:text-red-300 hover:bg-red-500/10 transition-colors shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="w-[min(92vw,560px)] p-0 bg-zinc-950 border-white/10 rounded-2xl shadow-2xl"
        >
          <div className="p-3 border-b border-white/5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-white/30" aria-hidden />
              <Input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск по адресу, городу..."
                className={cn(INPUT_WITH_LEADING_ICON, 'h-10 rounded-xl bg-zinc-900/60 border-white/5')}
              />
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto p-2 space-y-1">
            {isFetching ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-white/30" />
              </div>
            ) : !data || data.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="h-10 w-10 mx-auto text-white/10 mb-2" />
                <p className="text-xs font-bold text-white/30 uppercase tracking-widest">
                  {search ? 'Ничего не найдено' : 'Нет одобренных объектов'}
                </p>
                <p className="text-[10px] text-white/20 mt-1">Подойдут объекты в статусе «Одобрен» и выше</p>
              </div>
            ) : (
              data.map(p => {
                const isSelected = value === p.id;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => {
                      onChange(p.id, p.address || p.city || '');
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border",
                      isSelected
                        ? "bg-primary/15 border-primary/40 shadow-lg shadow-primary/10"
                        : "border-transparent hover:bg-white/5 hover:border-white/10"
                    )}
                  >
                    <div className="w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
                      {p.cover_url ? (
                        <img src={p.cover_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Building2 className="h-5 w-5 text-white/20" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white truncate">
                        {Number(p.price).toLocaleString('ru-RU')} ₽
                      </p>
                      <div className="flex items-center gap-1 text-xs text-white/60 truncate">
                        <MapPin className="h-3 w-3 shrink-0 text-white/30" />
                        <span className="truncate">{p.address || p.city || 'Без адреса'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-white/30 uppercase tracking-wider mt-0.5">
                        {p.rooms && (
                          <span>
                            {p.rooms === 'Студия' ? 'Студия' :
                             p.rooms === 'Своб. планировка' ? 'Своб. планировка' :
                             p.rooms === '10 и более' ? '10+ комн.' :
                             /^\d+$/.test(String(p.rooms)) ? `${p.rooms}-комн.` :
                             p.rooms}
                          </span>
                        )}
                        {p.area_total && <span>· {p.area_total} м²</span>}
                        <span className="text-emerald-400/70">· {STATUS_LABEL[p.status] || p.status}</span>
                      </div>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Free-text fallback */}
          <div className="p-3 border-t border-white/5">
            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1.5">Объект не из CRM?</p>
            <Input
              value={fallbackName}
              onChange={e => onChange('', e.target.value)}
              placeholder="ЖК Одинцово, корпус 5"
              className="h-9 rounded-xl bg-zinc-900/60 border-white/5 text-sm"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
