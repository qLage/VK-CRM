import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function DealsMortgageToggle() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMortgage = location.pathname.includes('/deals/mortgage');

  return (
    <div className="flex shrink-0 gap-0.5 p-1 rounded-xl bg-zinc-900/60 border border-white/10">
      <button
        type="button"
        onClick={() => navigate('/deals')}
        className={cn(
          'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
          !isMortgage
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-white/50 hover:text-white hover:bg-white/5'
        )}
      >
        Сделки
      </button>
      <button
        type="button"
        onClick={() => navigate('/deals/mortgage')}
        className={cn(
          'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
          isMortgage
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-white/50 hover:text-white hover:bg-white/5'
        )}
      >
        Ипотека
      </button>
    </div>
  );
}
