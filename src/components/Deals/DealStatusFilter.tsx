import { motion } from 'framer-motion';
import { CheckCircle2, Clock, XCircle, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DealStatusFilterProps {
  accessLevel: number;
  selectedStatus: 'all' | 'pending' | 'approved' | 'rejected';
  onStatusChange: (status: 'all' | 'pending' | 'approved' | 'rejected') => void;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Все', icon: Filter, color: 'text-white/60' },
  { value: 'pending', label: 'На рассмотрении', icon: Clock, color: 'text-amber-400' },
  {
    value: 'approved',
    label: 'Одобрено',
    icon: CheckCircle2,
    color: 'text-emerald-400',
  },
  {
    value: 'rejected',
    label: 'Отклонено',
    icon: XCircle,
    color: 'text-red-400',
  },
];

export function DealStatusFilter({
  accessLevel,
  selectedStatus,
  onStatusChange,
}: DealStatusFilterProps) {
  const isMop = accessLevel >= 50 && accessLevel < 90;
  const isDirector = accessLevel >= 90;

  // Only show for МОП and Directors
  if (!isMop && !isDirector) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex gap-2 p-1 bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-lg w-fit flex-wrap"
    >
      {STATUS_OPTIONS.map(({ value, label, icon: Icon, color }) => (
        <Button
          key={value}
          variant="ghost"
          size="sm"
          onClick={() =>
            onStatusChange(value as 'all' | 'pending' | 'approved' | 'rejected')
          }
          className={cn(
            'gap-2 transition-all',
            selectedStatus === value
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          )}
        >
          <Icon className={cn('h-4 w-4', selectedStatus === value ? '' : color)} />
          <span className="text-xs font-bold uppercase">{label}</span>
        </Button>
      ))}
    </motion.div>
  );
}
