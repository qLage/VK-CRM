import { useState, useEffect } from 'react';
import { useUIConfig, DASHBOARD_WIDGET_LABELS, NAV_ITEMS_REGISTRY, type DashboardWidgetConfig, type MobileNavConfig, type FabMenuConfig, type SidebarConfig } from '@/hooks/useUIConfig';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Save, RotateCcw, GripVertical, Smartphone, Menu, EyeOff, Plus, Check, LayoutTemplate } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const roleLabels: Record<string, string> = {
  director: 'Директор',
  admin: 'Администратор',
  commercial: 'Коммерческий Директор',
  head_sales: 'Руководитель Отдела Продаж',
  sales_manager: 'Менеджер Отдела Продаж',
  mortgage_broker: 'Ипотечный Брокер',
  realtor: 'Риелтор',
};

type ActiveRole = keyof typeof roleLabels;

export function InterfaceSettings() {
  const {
    dashboardConfig,
    navConfig,
    fabConfig,
    sidebarConfig,
    updateInterfaceConfig,
    isUpdating
  } = useUIConfig();

  const [editedDashboard, setEditedDashboard] = useState<DashboardWidgetConfig>(() => dashboardConfig);
  const [editedNav, setEditedNav] = useState<MobileNavConfig>(() => navConfig);
  const [editedFab, setEditedFab] = useState<FabMenuConfig>(() => fabConfig);
  const [editedSidebar, setEditedSidebar] = useState<SidebarConfig>(() => sidebarConfig || {
    realtor: [], head_sales: [], admin: [], director: [], commercial: [], mortgage_broker: [], sales_manager: [], manager: []
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [activeRole, setActiveRole] = useState<ActiveRole>('director');

  // Unified "Active Items" State for Mobile (Derived from Nav + Fab)
  const [activeMobileItems, setActiveMobileItems] = useState<string[]>([]);

  // Sync local state when role changes or config updates
  useEffect(() => {
    const nav = editedNav[activeRole] || [];
    const fab = editedFab[activeRole] || [];
    setActiveMobileItems([...nav, ...fab]);
  }, [activeRole, editedNav, editedFab]);

  const handleSave = () => {
    const newNav = activeMobileItems.slice(0, 5);
    const newFab = activeMobileItems.slice(5);

    const finalNav = { ...editedNav, [activeRole]: newNav };
    const finalFab = { ...editedFab, [activeRole]: newFab };

    updateInterfaceConfig(editedDashboard, finalNav, finalFab, editedSidebar);
    setHasChanges(false);
  };

  const handleReset = () => {
    if (window.confirm('Сбросить все настройки интерфейса?')) {
      localStorage.removeItem('crm_ui_config_v40');
      localStorage.removeItem('crm_ui_config_v39');
      window.location.reload();
    }
  };

  const onDragEndMobile = (result: any) => {
    const { source, destination } = result;
    if (!destination) return;

    if (source.droppableId === 'mobile-active' && destination.droppableId === 'mobile-active') {
      const items = Array.from(activeMobileItems);
      const [reorderedItem] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, reorderedItem);
      setActiveMobileItems(items);
      setHasChanges(true);
    } else if (source.droppableId === 'mobile-active' && destination.droppableId === 'mobile-hidden') {
      const items = Array.from(activeMobileItems);
      items.splice(result.source.index, 1);
      setActiveMobileItems(items);
      setHasChanges(true);
    } else if (source.droppableId === 'mobile-hidden' && destination.droppableId === 'mobile-active') {
      const hidden = getHiddenItems();
      const itemToAdd = hidden[source.index];
      const items = Array.from(activeMobileItems);
      items.splice(destination.index, 0, itemToAdd);
      setActiveMobileItems(items);
      setHasChanges(true);
    }
  };

  const toggleMobileItem = (key: string) => {
    if (activeMobileItems.includes(key)) {
      setActiveMobileItems(prev => prev.filter(k => k !== key));
    } else {
      setActiveMobileItems(prev => [...prev, key]);
    }
    setHasChanges(true);
  };

  const getHiddenItems = () => Object.keys(NAV_ITEMS_REGISTRY).filter(k => !activeMobileItems.includes(k));

  return (
    <div className="flex flex-col h-auto md:h-[calc(100vh-140px)] md:min-h-[600px] gap-4 md:gap-6 font-sans">

      {/* Header / Role Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-0 shrink-0 bg-[#18181b] border border-white/5 p-3 md:p-4 rounded-xl md:rounded-2xl shadow-lg">
        <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto scrollbar-hide pb-1">
          {Object.keys(roleLabels).map((r) => (
            <button
              key={r}
              onClick={() => setActiveRole(r as ActiveRole)}
              className={cn(
                "px-3 md:px-4 lg:px-5 py-2 md:py-2.5 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                activeRole === r
                  ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 scale-105"
                  : "bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              )}
            >
              {roleLabels[r]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-zinc-500 hover:text-white h-8 md:h-9 text-xs md:text-sm px-2 md:px-3"
          >
            <RotateCcw className="h-3 w-3 md:h-4 md:w-4 mr-1.5 md:mr-2" /> Сброс
          </Button>
          <Button
            onClick={handleSave}
            className={cn(
              "transition-all min-w-[100px] md:min-w-[140px] font-medium h-8 md:h-9 text-xs md:text-sm",
              hasChanges
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
            )}
            disabled={!hasChanges || isUpdating}
          >
            {isUpdating ? <span className="animate-pulse">Сохранение...</span> : (
              <>
                <Save className="h-3 w-3 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                Сохранить
              </>
            )}
          </Button>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEndMobile}>
        <div className="flex-1 grid lg:grid-cols-2 gap-4 md:gap-6 lg:gap-8 min-h-0">

          {/* Active Items Column */}
          <div className="flex flex-col bg-[#111] border border-white/5 rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl relative group">
            <div className="p-4 md:p-6 border-b border-white/5 bg-[#18181b]/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 md:gap-3 lg:gap-4">
                  <div className="h-10 w-10 md:h-12 md:w-12 rounded-lg md:rounded-xl bg-[#18181b] border border-white/5 flex items-center justify-center">
                    <Smartphone className="h-5 w-5 md:h-6 md:w-6 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-base md:text-lg font-bold text-white tracking-tight">Активное меню</h3>
                    <p className="text-[10px] md:text-xs text-zinc-500 font-medium mt-0.5 md:mt-1">Нижняя панель (5) + Меню "Еще"</p>
                  </div>
                </div>
                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] md:text-xs">{activeMobileItems.length} элементов</Badge>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-4 lg:p-6 bg-transparent">
              <Droppable droppableId="mobile-active">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2 md:space-y-3">
                    {activeMobileItems.map((key, index) => {
                      const item = NAV_ITEMS_REGISTRY[key];
                      if (!item) return null;
                      const Icon = item.icon;
                      const isBottomBar = index < 5;

                      return (
                        <div key={key}>
                          {index === 5 && (
                            <div className="flex items-center gap-2 md:gap-3 lg:gap-4 py-4 md:py-5 lg:py-6">
                              <div className="h-px bg-white/5 flex-1" />
                              <span className="text-[9px] md:text-[10px] uppercase font-bold tracking-wider md:tracking-widest text-zinc-600 flex items-center gap-1.5 md:gap-2 px-1.5 md:px-2 py-0.5 md:py-1 rounded-full bg-zinc-900 border border-white/5">
                                <Menu className="h-2.5 w-2.5 md:h-3 md:w-3" /> Остальное в меню "Еще"
                              </span>
                              <div className="h-px bg-white/5 flex-1" />
                            </div>
                          )}
                          <Draggable key={key} draggableId={key} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={cn(
                                  "flex items-center justify-between p-3 md:p-4 rounded-lg md:rounded-xl border transition-all select-none group/item",
                                  snapshot.isDragging
                                    ? "bg-[#18181b] border-emerald-500/50 shadow-2xl z-50 scale-105"
                                    : "bg-[#18181b] border-white/5 hover:border-white/10",
                                  isBottomBar && !snapshot.isDragging && "border-l-2 md:border-l-4 border-l-emerald-500"
                                )}
                              >
                                <div className="flex items-center gap-2 md:gap-3 lg:gap-4 flex-1 min-w-0">
                                  <div {...provided.dragHandleProps} className="text-zinc-700 hover:text-zinc-400 cursor-grab active:cursor-grabbing p-0.5 md:p-1 flex-shrink-0">
                                    <GripVertical className="h-4 w-4 md:h-5 md:w-5" />
                                  </div>
                                  <div className={cn(
                                    "h-8 w-8 md:h-9 md:w-9 lg:h-10 lg:w-10 rounded-lg flex items-center justify-center transition-colors flex-shrink-0",
                                    isBottomBar ? "bg-emerald-500/10 text-emerald-500" : "bg-zinc-900 text-zinc-500"
                                  )}>
                                    <Icon className="h-4 w-4 md:h-4.5 md:w-4.5 lg:h-5 lg:w-5" />
                                  </div>
                                  <span className={cn("font-bold text-xs md:text-sm truncate", isBottomBar ? "text-white" : "text-zinc-400")}>{item.label}</span>

                                  {isBottomBar && (
                                    <span className="hidden md:inline text-[10px] font-bold uppercase tracking-wider text-emerald-500/50 ml-auto mr-4 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                      Навигация
                                    </span>
                                  )}
                                </div>

                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 md:h-8 md:w-8 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover/item:opacity-100 transition-all flex-shrink-0"
                                  onClick={() => toggleMobileItem(key)}
                                >
                                  <EyeOff className="h-3.5 w-3.5 md:h-4 md:w-4" />
                                </Button>
                              </div>
                            )}
                          </Draggable>
                        </div>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          </div>

          {/* Hidden Items Column */}
          <div className="flex flex-col bg-[#111] border border-white/5 rounded-2xl md:rounded-3xl overflow-hidden shadow-xl relative opacity-80 hover:opacity-100 transition-opacity">
            <div className="p-4 md:p-6 border-b border-white/5 bg-[#18181b]/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 md:gap-3 lg:gap-4">
                  <div className="h-10 w-10 md:h-12 md:w-12 rounded-lg md:rounded-xl bg-[#18181b] border border-white/5 flex items-center justify-center">
                    <EyeOff className="h-5 w-5 md:h-6 md:w-6 text-zinc-500" />
                  </div>
                  <div>
                    <h3 className="text-base md:text-lg font-bold text-zinc-400 tracking-tight">Скрытые разделы</h3>
                    <p className="text-[10px] md:text-xs text-zinc-600 font-medium mt-0.5 md:mt-1">Нажмите +, чтобы добавить</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-zinc-500 border-zinc-800 text-[10px] md:text-xs">{getHiddenItems().length} скрыто</Badge>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-4 lg:p-6 bg-transparent">
              <Droppable droppableId="mobile-hidden">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2 md:space-y-3">
                    {getHiddenItems().map((key, index) => {
                      const item = NAV_ITEMS_REGISTRY[key];
                      if (!item) return null;
                      const Icon = item.icon;
                      return (
                        <Draggable key={key} draggableId={key} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={cn(
                                "flex items-center justify-between p-3 md:p-4 rounded-lg md:rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 transition-all group",
                                snapshot.isDragging && "opacity-100 shadow-xl border-solid border-emerald-500 bg-[#18181b]"
                              )}
                            >
                              <div className="flex items-center gap-2 md:gap-3 lg:gap-4 opacity-50 group-hover:opacity-100 transition-opacity min-w-0">
                                <div className="h-8 w-8 md:h-9 md:w-9 lg:h-10 lg:w-10 rounded-lg bg-zinc-900/50 flex items-center justify-center text-zinc-600 flex-shrink-0">
                                  <Icon className="h-4 w-4 md:h-4.5 md:w-4.5 lg:h-5 lg:w-5" />
                                </div>
                                <span className="font-bold text-xs md:text-sm text-zinc-500 group-hover:text-zinc-300 truncate">{item.label}</span>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 md:h-8 md:w-8 p-0 text-emerald-600 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-full flex-shrink-0"
                                onClick={() => toggleMobileItem(key)}
                              >
                                <Plus className="h-4 w-4 md:h-5 md:w-5" />
                              </Button>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                    {getHiddenItems().length === 0 && (
                      <div className="flex flex-col items-center justify-center h-40 text-zinc-700">
                        <Check className="h-8 w-8 mb-2 opacity-20" />
                        <span className="text-xs uppercase font-bold tracking-widest">Все разделы активны</span>
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          </div>

        </div>
      </DragDropContext>
    </div>
  );
}
