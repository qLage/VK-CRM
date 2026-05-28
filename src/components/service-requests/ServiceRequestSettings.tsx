import { useState, useEffect, useRef } from 'react';
import {
    Plus, Settings2, Save, RotateCcw, Trash2, X,
    DollarSign, Scale, Home, MapPin, TrendingUp, TrendingDown, Users, Key,
    ClipboardList, FileText, Check, LayoutTemplate, Target
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { localAPI } from '@/integrations/localAPI';
import { FormBuilder, type FieldConfig } from '@/components/settings/FormBuilder';
import { useDailyReportConfig } from '@/components/settings/DailyReportSettings';
import { useDailyPlanConfig } from '@/components/settings/DailyPlanSettings';
import { TEMPLATES, REQUEST_TYPES, REQUEST_TYPE_LABELS } from '@/components/service-requests/constants';

// Hook for Service Types
export function useServiceRequestConfig() {
    const [types, setTypes] = useState<Array<{ id: string, name: string }>>([]);
    const [templates, setTemplates] = useState<Record<string, { title: string; fields: FieldConfig[] }>>({});
    const [isLoading, setIsLoading] = useState(true);

    const loadConfig = async () => {
        try {
            const { data: settings } = await localAPI.request('/settings');
            const config = settings?.service_request_config;

            if (config) {
                setTypes(config.types || []);
                setTemplates(config.templates || {});
            } else {
                // No config in DB - use defaults from constants.ts
                // Clear old localStorage to ensure fresh start
                localStorage.removeItem('crm_service_request_types');
                localStorage.removeItem('crm_service_request_templates');

                setTypes([
                    { id: 'deposit', name: 'Задаток' },
                    { id: 'deal', name: 'Сделка' },
                    { id: 'listing', name: 'Взятие объекта' },
                    { id: 'showing', name: 'Показ' },
                    { id: 'sale', name: 'Продажа (Отчёт)' },
                    { id: 'purchase', name: 'Покупка (Запрос)' },
                    { id: 'meeting', name: 'Встреча в офисе' },
                    { id: 'booking_new', name: 'Бронирование (Новостройки)' },
                    { id: 'deal_new_after', name: 'После сделки (Новостройки)' }
                ]);
                setTemplates(TEMPLATES as any);
            }
        } catch (error) {
            console.error('Failed to load service request config:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadConfig();
    }, []);

    const updateTypes = async (newTypes: Array<{ id: string, name: string }>) => {
        setTypes(newTypes);
        try {
            await localAPI.request('/settings', {
                method: 'POST',
                body: {
                    key: 'service_request_config',
                    value: { types: newTypes, templates }
                }
            });
            localStorage.setItem('crm_service_request_types', JSON.stringify(newTypes));
        } catch (error) {
            toast.error('Ошибка сохранения типов');
        }
    };

    const updateTemplate = async (typeId: string, fields: FieldConfig[]) => {
        const updated = {
            ...templates,
            [typeId]: {
                ...templates[typeId],
                title: templates[typeId]?.title || '',
                fields: fields
            }
        };
        setTemplates(updated);
        try {
            await localAPI.request('/settings', {
                method: 'POST',
                body: {
                    key: 'service_request_config',
                    value: { types, templates: updated }
                }
            });
            localStorage.setItem('crm_service_request_templates', JSON.stringify(updated));
        } catch (error) {
            toast.error('Ошибка сохранения шаблона');
        }
    };

    // Ensure templates exist for types and default title
    useEffect(() => {
        if (isLoading || types.length === 0) return;

        let changed = false;
        const newTemplates = { ...templates };

        types.forEach(t => {
            if (!newTemplates[t.id]) {
                newTemplates[t.id] = TEMPLATES[t.id] || { title: t.name, fields: [] };
                changed = true;
            } else if (!newTemplates[t.id].title) {
                newTemplates[t.id].title = t.name;
                changed = true;
            }
        });

        if (changed) {
            setTemplates(newTemplates);
            // We don't auto-save to DB here to avoid loops, 
            // but we update local state so UI is correct.
        }
    }, [types, isLoading]);

    return { types, updateTypes, templates, updateTemplate, isLoading };
}

export function ServiceRequestSettings() {
    // Service Requests
    const { types, updateTypes, templates, updateTemplate } = useServiceRequestConfig();

    // Daily Reports & Plans
    const { fields: dailyFields, updateFields: updateDailyFields } = useDailyReportConfig();
    const { fields: planFields, updateFields: updatePlanFields } = useDailyPlanConfig();
    const [selectedId, setSelectedId] = useState<string>('daily');
    const [isAdding, setIsAdding] = useState(false);
    const [newType, setNewType] = useState('');
    const [hasChanges, setHasChanges] = useState(false); // To mock "Save" state behavior
    const scrollRef = useRef<HTMLDivElement>(null);

    // Enable horizontal scroll with mouse wheel
    useEffect(() => {
        const el = scrollRef.current;
        if (el) {
            const onWheel = (e: WheelEvent) => {
                if (e.deltaY === 0) return;
                e.preventDefault();
                el.scrollLeft += e.deltaY;
            };
            el.addEventListener('wheel', onWheel, { passive: false });
            return () => el.removeEventListener('wheel', onWheel);
        }
    }, []);

    const handleAdd = () => {
        if (!newType.trim()) return;
        const id = newType.trim().toLowerCase().replace(/\s+/g, '_');
        if (types.some(t => t.id === id)) {
            toast.error('Существует');
            return;
        }
        updateTypes([...types, { id, name: newType.trim() }]);
        setNewType('');
        setIsAdding(false);
        setSelectedId(id);
    };

    // Determine config
    const isDaily = selectedId === 'daily';
    const isPlan = selectedId === 'daily_plan';

    const activeTemplate = isDaily
        ? { title: 'Ежедневный отчёт', fields: dailyFields }
        : isPlan
            ? { title: 'План на день', fields: planFields }
            : templates[selectedId];

    const activeFields = activeTemplate?.fields || [];

    const handleFieldsChange = (newFields: FieldConfig[]) => {
        setHasChanges(true);
        if (isDaily) {
            updateDailyFields(newFields);
        } else if (isPlan) {
            updatePlanFields(newFields);
        } else {
            updateTemplate(selectedId, newFields);
        }
    };

    // Icon Logic
    const getIcon = (id: string) => {
        if (id === 'daily') return ClipboardList;
        if (id === 'daily_plan') return Target;
        if (id === 'deposit') return DollarSign;
        if (id === 'deal') return Scale;
        if (id === 'object') return Home;
        if (id === 'showing') return MapPin;
        if (id === 'sale') return TrendingUp;
        if (id === 'purchase') return TrendingDown;
        if (id === 'meeting') return Users;
        if (id === 'booking') return Key;
        return FileText;
    };

    const ActiveIcon = getIcon(selectedId);

    const handleTriggerAdd = () => {
        document.getElementById('form-builder-add-trigger')?.click();
    };

    return (
        <div className="flex flex-col h-auto md:h-[calc(100vh-140px)] md:min-h-[600px] gap-4 md:gap-6 font-sans">

            {/* Header / Type Selector - Matching InterfaceSettings */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-0 shrink-0 bg-[#18181b] border border-white/5 p-3 md:p-4 rounded-xl md:rounded-2xl shadow-lg">
                <style>{`
                    .no-scrollbar::-webkit-scrollbar {
                        display: none;
                    }
                    .no-scrollbar {
                        -ms-overflow-style: none;
                        scrollbar-width: none;
                    }
                `}</style>
                <div
                    ref={scrollRef}
                    className="flex items-center gap-1.5 md:gap-2 overflow-x-auto pb-0 mb-0 max-w-full sm:max-w-[calc(100%-200px)] md:max-w-[calc(100%-250px)] no-scrollbar"
                >
                    {/* Daily Button */}
                    <button
                        onClick={() => setSelectedId('daily')}
                        className={cn(
                            "px-3 md:px-4 lg:px-5 py-2 md:py-2.5 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 md:gap-2 shrink-0 border border-transparent",
                            selectedId === 'daily'
                                ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20 scale-105"
                                : "bg-zinc-900/50 border-white/5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                        )}
                    >
                        <ClipboardList className="h-3 w-3 md:h-4 md:w-4" />
                        <span className="hidden sm:inline">Ежедневный</span>
                        <span className="sm:hidden">Отчёт</span>
                    </button>

                    {/* Daily Plan Button */}
                    <button
                        onClick={() => setSelectedId('daily_plan')}
                        className={cn(
                            "px-3 md:px-4 lg:px-5 py-2 md:py-2.5 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 md:gap-2 shrink-0 border border-transparent",
                            selectedId === 'daily_plan'
                                ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20 scale-105"
                                : "bg-zinc-900/50 border-white/5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                        )}
                    >
                        <Target className="h-3 w-3 md:h-4 md:w-4" />
                        <span className="hidden sm:inline">План на день</span>
                        <span className="sm:hidden">План</span>
                    </button>

                    <div className="w-px h-5 md:h-6 bg-white/10 mx-1 md:mx-2 shrink-0" />

                    {/* Service Types */}
                    {types.map((type) => {
                        const Icon = getIcon(type.id);
                        return (
                            <div
                                key={type.id}
                                onClick={() => setSelectedId(type.id)}
                                className={cn(
                                    "group relative px-3 md:px-4 lg:px-5 py-2 md:py-2.5 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 md:gap-2 shrink-0 cursor-pointer select-none border border-transparent",
                                    selectedId === type.id
                                        ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 scale-105"
                                        : "bg-zinc-900/50 border-white/5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                                )}
                            >
                                <Icon className="h-3 w-3 md:h-4 md:w-4" />
                                {type.name}

                                <div
                                    role="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`Удалить "${type.name}"?`)) {
                                            if (type.id === selectedId) setSelectedId('daily');
                                            updateTypes(types.filter(t => t.id !== type.id));
                                        }
                                    }}
                                    className={cn(
                                        "ml-0.5 md:ml-1 p-0.5 md:p-1 rounded-md transition-all",
                                        selectedId === type.id
                                            ? "text-red-400 hover:text-red-300 hover:bg-white/20"
                                            : "text-red-500/50 hover:text-red-500 hover:bg-white/5"
                                    )}
                                    title="Удалить"
                                >
                                    <Trash2 className="h-3 w-3 md:h-3.5 md:w-3.5" />
                                </div>
                            </div>
                        );
                    })}

                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setIsAdding(true)}
                        className="h-8 w-8 md:h-9 md:w-9 bg-zinc-900/50 border border-white/5 rounded-lg md:rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 shrink-0 ml-1 md:ml-2"
                    >
                        <Plus className="h-4 w-4 md:h-5 md:w-5" />
                    </Button>
                </div>

                {isAdding && (
                    <div className="absolute top-16 md:top-20 left-3 md:left-4 right-3 sm:right-auto z-50 bg-[#18181b] border border-white/10 p-2 rounded-lg md:rounded-xl shadow-2xl animate-in fade-in slide-in-from-top-2 flex gap-2">
                        <Input
                            autoFocus
                            value={newType}
                            onChange={(e) => setNewType(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                            placeholder="Название..."
                            className="h-8 md:h-9 w-full sm:w-48 text-xs bg-zinc-900 border-zinc-800"
                        />
                        <Button size="sm" onClick={handleAdd} className="bg-emerald-600 hover:bg-emerald-500 h-8 md:h-9 px-2 md:px-3"><Check className="h-3.5 w-3.5 md:h-4 md:w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setIsAdding(false)} className="text-zinc-500 hover:text-white h-8 md:h-9 px-2 md:px-3"><X className="h-3.5 w-3.5 md:h-4 md:w-4" /></Button>
                    </div>
                )}

                <div className="flex items-center gap-2 md:gap-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.location.reload()}
                        className="text-zinc-500 hover:text-white h-8 md:h-9 text-xs md:text-sm px-2 md:px-3"
                    >
                        <RotateCcw className="h-3 w-3 md:h-4 md:w-4 mr-1.5 md:mr-2" /> Сброс
                    </Button>
                    <Button
                        className={cn(
                            "transition-all min-w-[100px] md:min-w-[140px] font-medium h-8 md:h-9 text-xs md:text-sm",
                            "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                        )}
                        onClick={() => { setHasChanges(false); toast.success('Сохранено'); }}
                    >
                        <Save className="h-3 w-3 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                        Сохранить
                    </Button>
                </div>
            </div>

            {/* Main Content Area - Card Style like InterfaceSettings */}
            <div className="flex-1 bg-[#111] border border-white/5 rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl relative flex flex-col group">
                {/* Card Header */}
                <div className="p-4 md:p-6 border-b border-white/5 bg-[#18181b]/50 shrink-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-0">
                        <div className="flex items-center gap-2.5 md:gap-3 lg:gap-4">
                            <div className="h-10 w-10 md:h-12 md:w-12 rounded-lg md:rounded-xl bg-[#18181b] border border-white/5 flex items-center justify-center shadow-inner">
                                <ActiveIcon className="h-5 w-5 md:h-6 md:w-6 text-emerald-500" />
                            </div>
                            <div>
                                <h3 className="text-base md:text-lg lg:text-xl font-bold text-white tracking-tight">
                                    {activeTemplate?.title || 'Настройки'}
                                </h3>
                                <p className="text-[10px] md:text-xs text-zinc-500 font-medium mt-0.5 md:mt-1">
                                    Настройте поля и параметры для этого типа отчёта
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 md:gap-3">
                            <Button
                                onClick={handleTriggerAdd}
                                className="bg-[#18181b] hover:bg-zinc-800 text-white gap-1.5 md:gap-2 h-8 md:h-9 lg:h-10 px-3 md:px-4 lg:px-6 rounded-lg md:rounded-xl border border-white/10 hover:border-emerald-500/50 shadow-lg transition-all text-xs md:text-sm w-full sm:w-auto"
                            >
                                <Plus className="h-3.5 w-3.5 md:h-4 md:w-4" />
                                Добавить поле
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Card Content (Form Builder) */}
                <div className="flex-1 overflow-hidden p-3 md:p-4 lg:p-6 bg-[#111]">
                    {activeTemplate ? (
                        <FormBuilder
                            key={selectedId}
                            fields={activeFields}
                            onFieldsChange={handleFieldsChange}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-zinc-500 text-sm md:text-base">
                            Выберите тип
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

