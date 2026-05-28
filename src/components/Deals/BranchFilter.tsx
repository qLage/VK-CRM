import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface BranchFilterProps {
  accessLevel: number;
  selectedBranch?: string;
  onBranchChange: (branchId: string | undefined) => void;
  branches?: Array<{ id: string; name: string }>;
  isLoading?: boolean;
}

export function BranchFilter({
  accessLevel,
  selectedBranch,
  onBranchChange,
  branches = [],
  isLoading = false,
}: BranchFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Only show for Directors (accessLevel >= 90)
  if (accessLevel < 90) {
    return null;
  }

  if (!branches.length) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative"
    >
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-white/60" />
        <Select
          value={selectedBranch || 'all'}
          onValueChange={(val) => {
            onBranchChange(val === 'all' ? undefined : val);
            setIsOpen(false);
          }}
          open={isOpen}
          onOpenChange={setIsOpen}
        >
          <SelectTrigger className="w-56 sm:w-64 bg-zinc-900/60 border-white/10 text-white">
            <SelectValue placeholder="Выберите филиал" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <Building2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary/60 shrink-0" />
                <span className="truncate">Все филиалы</span>
              </div>
            </SelectItem>
            {(Array.isArray(branches) ? branches : []).map((branch) => (
              <SelectItem key={branch.id} value={branch.id}>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <Building2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary/60 shrink-0" />
                  <span className="truncate">{branch.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedBranch && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onBranchChange(undefined)}
            className="text-white/60 hover:text-white hover:bg-white/5 h-8 w-8 p-0"
          >
            ✕
          </Button>
        )}
      </div>
    </motion.div>
  );
}
