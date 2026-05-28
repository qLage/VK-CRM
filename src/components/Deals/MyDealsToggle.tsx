import { motion } from 'framer-motion';
import { User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MyDealsToggleProps {
  isMyDealsOnly: boolean;
  onToggle: (isMyDealsOnly: boolean) => void;
  accessLevel: number;
  hasTeam?: boolean;
}

export function MyDealsToggle({
  isMyDealsOnly,
  onToggle,
  accessLevel,
  hasTeam = false,
}: MyDealsToggleProps) {
  const isMop = accessLevel >= 50 && accessLevel < 90;
  const isDirector = accessLevel >= 90;
  const isEmployee = accessLevel < 50;

  // Show for МОП, Directors, and Employees with team
  if ((!isMop && !isDirector) && (!isEmployee || !hasTeam)) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex gap-2 p-1 bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-lg w-fit"
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onToggle(true)}
        className={cn(
          'gap-2 transition-all',
          isMyDealsOnly
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'text-white/60 hover:text-white hover:bg-white/5'
        )}
      >
        <User className="h-4 w-4" />
        <span className="text-xs font-bold uppercase">Мои сделки</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onToggle(false)}
        className={cn(
          'gap-2 transition-all',
          !isMyDealsOnly
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'text-white/60 hover:text-white hover:bg-white/5'
        )}
      >
        <Users className="h-4 w-4" />
        <span className="text-xs font-bold uppercase">
          {isEmployee ? 'Моя команда' : isMop ? 'Сделки команды' : 'Все сделки'}
        </span>
      </Button>
    </motion.div>
  );
}
