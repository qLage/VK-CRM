import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useAuth } from '@/hooks/useAuth';
import { Building2, Clock, CheckCircle2, AlertTriangle, ArrowRightLeft, Globe, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface PropertyLite {
  id: string;
  status: string;
  category: string;
  city: string | null;
  address: string | null;
  price: number;
  cover_url?: string | null;
  transfer_status?: string | null;
  rejection_reason?: string | null;
}

const STATUS_BADGES: Record<string, { label: string; cls: string; icon: any }> = {
  draft:            { label: 'Черновик',         cls: 'text-zinc-300 bg-zinc-500/15 border-zinc-500/20', icon: Clock },
  pending_approval: { label: 'На одобрении',     cls: 'text-yellow-300 bg-yellow-500/15 border-yellow-500/20', icon: Clock },
  rejected:         { label: 'Отклонён',         cls: 'text-red-300 bg-red-500/15 border-red-500/20', icon: AlertTriangle },
  avito_pending:    { label: 'Avito: ожидание',  cls: 'text-blue-300 bg-blue-500/15 border-blue-500/20', icon: Globe },
  archive_pending:  { label: 'Архив: ожидание',  cls: 'text-orange-300 bg-orange-500/15 border-orange-500/20', icon: Clock },
  transfer_pending: { label: 'Передача',         cls: 'text-violet-300 bg-violet-500/15 border-violet-500/20', icon: ArrowRightLeft },
};

export function MyPropertiesWidget({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: myProps, isLoading } = useQuery({
    queryKey: ['my-properties-widget', user?.id],
    queryFn: async () => {
      const { data } = await localAPI.request('/properties?view=my&limit=50');
      return ((data as any)?.data || []) as PropertyLite[];
    },
    enabled: !!user,
    staleTime: 30000,
  });

  // Count properties by group
  const stats = (myProps || []).reduce((acc, p) => {
    if (['draft', 'rejected'].includes(p.status)) acc.drafts++;
    if (['pending_approval', 'avito_pending', 'archive_pending'].includes(p.status)) acc.pending++;
    if (['approved', 'avito_approved'].includes(p.status)) acc.active++;
    if (p.status === 'published_avito' || p.status === 'in_feed') acc.published++;
    return acc;
  }, { drafts: 0, pending: 0, active: 0, published: 0 });

  // Pinned items: rejected (need fix) + transfer pending + recent pending
  const attention = (myProps || [])
    .filter(p => ['rejected', 'transfer_pending'].includes(p.status))
    .slice(0, 3);
  const recent = (myProps || []).slice(0, 5);
  const items = attention.length > 0 ? attention : recent;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 p-4 md:p-5 lg:p-6 group relative overflow-hidden shadow-2xl transition-all duration-700 hover:border-white/10 flex flex-col",
        className
      )}
    >
      <div className="absolute top-0 right-0 w-36 md:w-48 h-36 md:h-48 bg-emerald-500/10 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between mb-4 md:mb-5 shrink-0">
        <div className="flex items-center gap-2.5 md:gap-3">
          <div className="p-2 md:p-2.5 rounded-xl md:rounded-[1.5rem] bg-emerald-500/10 border border-emerald-500/10">
            <Building2 className="h-4 w-4 md:h-5 md:w-5 text-emerald-400" />
          </div>
          <h3 className="text-sm md:text-base font-black tracking-tighter text-white uppercase">МОИ ОБЪЕКТЫ</h3>
        </div>
        <button
          onClick={() => navigate('/properties')}
          className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-emerald-400 transition-colors flex items-center gap-1"
        >
          Все <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* Stats grid */}
      <div className="relative z-10 grid grid-cols-4 gap-1.5 md:gap-2 mb-3 md:mb-4 shrink-0">
        {[
          { label: 'Черн.', value: stats.drafts, color: 'text-zinc-300' },
          { label: 'В работе', value: stats.pending, color: 'text-amber-300' },
          { label: 'Готовы', value: stats.active, color: 'text-emerald-300' },
          { label: 'Avito', value: stats.published, color: 'text-indigo-300' },
        ].map(s => (
          <div key={s.label} className="p-2 md:p-2.5 rounded-lg md:rounded-xl bg-white/[0.02] border border-white/5 text-center">
            <p className={cn("text-base md:text-lg font-black tracking-tight tabular-nums", s.color)}>
              {isLoading ? '—' : s.value}
            </p>
            <p className="text-[8px] md:text-[9px] font-black text-white/30 uppercase tracking-widest mt-0.5 leading-tight">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* List */}
      <div className="relative z-10 flex-1 overflow-y-auto space-y-2 scrollbar-hide">
        {isLoading ? (
          [1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)
        ) : items.length === 0 ? (
          <div className="text-center py-8 md:py-12">
            <Building2 className="h-10 w-10 md:h-12 md:w-12 mx-auto text-white/10 mb-2" />
            <p className="text-[10px] md:text-[11px] font-black text-white/20 uppercase tracking-widest">Нет объектов</p>
            <button
              onClick={() => navigate('/properties')}
              className="mt-3 text-[10px] font-black text-emerald-400 uppercase tracking-widest hover:text-emerald-300"
            >
              Добавить объект →
            </button>
          </div>
        ) : (
          <>
            {attention.length > 0 && (
              <p className="text-[9px] font-black text-amber-300/60 uppercase tracking-widest mb-1">⚠ Требуют внимания</p>
            )}
            {items.map(prop => {
              const st = STATUS_BADGES[prop.status] || { label: prop.status, cls: 'text-white/40 bg-white/5 border-white/5', icon: Building2 };
              const StIcon = st.icon;
              return (
                <button
                  key={prop.id}
                  onClick={() => navigate('/properties')}
                  className="w-full flex items-center gap-2.5 md:gap-3 p-2.5 md:p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all text-left group/item"
                >
                  {prop.cover_url ? (
                    <img src={prop.cover_url} alt="" className="w-9 h-9 md:w-10 md:h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4 text-white/20" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs md:text-sm font-bold text-white truncate">
                      {prop.address || prop.city || 'Без адреса'}
                    </p>
                    <p className="text-[10px] text-white/40 font-bold tabular-nums truncate">
                      {Number(prop.price).toLocaleString('ru-RU')} ₽
                    </p>
                  </div>
                  <div className={cn("flex items-center gap-1 px-1.5 py-1 rounded-md border text-[8px] md:text-[9px] font-black uppercase tracking-wider whitespace-nowrap shrink-0", st.cls)}>
                    <StIcon className="h-2.5 w-2.5" />
                    <span className="hidden md:inline">{st.label}</span>
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>
    </motion.div>
  );
}
