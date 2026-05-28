import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  level: 'company' | 'branch' | 'team' | 'employee';
  id?: string;
}

interface HierarchyBreadcrumbProps {
  path: BreadcrumbItem[];
  onNavigate: (index: number) => void;
}

export function HierarchyBreadcrumb({ path, onNavigate }: HierarchyBreadcrumbProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        onClick={() => onNavigate(0)}
        className="flex items-center gap-1 text-white/60 hover:text-white transition-colors"
      >
        <Home className="h-4 w-4" />
        <span>Компания</span>
      </button>

      {path.slice(1).map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <ChevronRight className="h-4 w-4 text-white/40" />
          <button
            onClick={() => onNavigate(index + 1)}
            className={`transition-colors ${
              index === path.length - 2
                ? 'text-white font-semibold'
                : 'text-white/60 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
