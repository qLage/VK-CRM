import { useState } from 'react';
import { Reorder } from 'framer-motion';
import {
    Plus, GripVertical, Pencil, Check, X, Trash2,
    Calendar, Type, Hash, AlignLeft, List, ToggleRight,
    MoreVertical, GripHorizontal, Eye, EyeOff, LayoutGrid,
    PhoneOutgoing, PhoneIncoming, Users, ClipboardList, MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export interface FieldConfig {
    id: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'datetime-local' | 'select' | 'textarea' | 'boolean' | 'separator';
    required?: boolean;
    enabled?: boolean;
    placeholder?: string;
    options?: string[];
    condition?: { field: string; value: any };
}

interface FormBuilderProps {
    fields: FieldConfig[];
    onFieldsChange: (fields: FieldConfig[]) => void;
    title?: string;
}

const TYPE_ICONS: Record<string, any> = {
    text: Type,
    number: Hash,
    date: Calendar,
    'datetime-local': Calendar,
    select: List,
    textarea: AlignLeft,
    boolean: ToggleRight,
    separator: LayoutGrid,
};

const TYPE_LABELS: Record<string, string> = {
    text: 'Текст',
    number: 'Число',
    date: 'Дата',
    'datetime-local': 'Дата и время',
    select: 'Выбор',
    textarea: 'Многострочный',
    boolean: 'Да/Нет',
    separator: 'Разделитель',
};

export function FormBuilder({ fields, onFieldsChange }: FormBuilderProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editMode, setEditMode] = useState<'create' | 'edit'>('create');
    const [currentFieldId, setCurrentFieldId] = useState<string | null>(null);

    const [editState, setEditState] = useState<Partial<FieldConfig>>({
        label: '',
        type: 'text',
        required: false,
        enabled: true,
        placeholder: '',
        options: [],
    });
    const [editOptionsText, setEditOptionsText] = useState('');

    // Stats
    const totalFields = fields.length;
    const activeFields = fields.filter(f => f.enabled !== false).length;
    const requiredFields = fields.filter(f => f.required && f.enabled !== false).length;

    const handleOpenCreate = () => {
        setEditMode('create');
        setCurrentFieldId(null);
        setEditState({ label: '', type: 'text', required: false, enabled: true, placeholder: '' });
        setEditOptionsText('');
        setIsDialogOpen(true);
    };

    const handleOpenEdit = (field: FieldConfig) => {
        setEditMode('edit');
        setCurrentFieldId(field.id);
        setEditState({ ...field });
        setEditOptionsText(field.options?.join('\n') || '');
        setIsDialogOpen(true);
    };

    const handleSave = () => {
        if (!editState.label) return;
        const options = editState.type === 'select' ? editOptionsText.split('\n').filter(Boolean) : undefined;

        const newFieldData = {
            label: editState.label!,
            type: editState.type as any,
            required: editState.required,
            enabled: editState.enabled ?? true,
            placeholder: editState.placeholder,
            options
        };

        if (editMode === 'create') {
            const newField: FieldConfig = {
                id: `field_${Date.now()}`,
                ...newFieldData
            };
            onFieldsChange([...fields, newField]);
        } else {
            onFieldsChange(fields.map(f => f.id === currentFieldId ? { ...f, ...newFieldData } : f));
        }
        setIsDialogOpen(false);
    };

    const handleDelete = (id: string) => {
        if (confirm('Вы уверены, что хотите удалить это поле?')) {
            onFieldsChange(fields.filter(f => f.id !== id));
        }
    };

    const handleToggleEnabled = (id: string, current: boolean | undefined) => {
        const isEnabled = current !== false;
        onFieldsChange(fields.map(f => f.id === id ? { ...f, enabled: !isEnabled } : f));
    };

    return (
        <div className="flex flex-col h-full">

            {/* Legend Bar - Exactly like screenshot */}
            <div className="flex items-center gap-6 mb-4 text-[10px] sm:text-xs text-zinc-500 font-medium uppercase tracking-wider px-2">
                <span className="flex items-center gap-2">
                    <GripVertical className="h-3.5 w-3.5 opacity-50" />
                    Перетащить
                </span>
                <span className="flex items-center gap-2">
                    <Eye className="h-3.5 w-3.5 opacity-50" />
                    Включить/выключить поле
                </span>
                <span className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    Обязательное
                </span>
                <span className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-zinc-600" />
                    Необязательное
                </span>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-2 mb-2 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                <div className="col-span-5 pl-10">Название поля</div>
                <div className="col-span-3">Тип</div>
                <div className="col-span-3">Обязательное</div>
                <div className="col-span-1 text-right">Активно</div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar -mr-2 pr-2 space-y-2">
                <Reorder.Group axis="y" values={fields} onReorder={onFieldsChange} className="space-y-2">
                    {fields.map((field) => {
                        const isEnabled = field.enabled !== false;

                        // Dynamic Icon based on ID or Type
                        let SpecificIcon = TYPE_ICONS[field.type] || Type;
                        if (field.id === 'calls_out') SpecificIcon = PhoneOutgoing;
                        if (field.id === 'calls_in') SpecificIcon = PhoneIncoming;
                        if (field.id === 'meetings_fact') SpecificIcon = Users;
                        if (field.id === 'plan') SpecificIcon = ClipboardList;
                        if (field.id === 'problems') SpecificIcon = MessageSquare;

                        return (
                            <Reorder.Item
                                key={field.id}
                                value={field}
                                className={cn(
                                    "grid grid-cols-12 gap-4 items-center px-4 py-3.5 rounded-xl border transition-all group select-none",
                                    "bg-[#18181b] border-transparent hover:border-zinc-700",
                                    !isEnabled && "opacity-50 grayscale"
                                )}
                            >
                                {/* Drag + Name */}
                                <div className="col-span-5 flex items-center gap-4">
                                    <GripVertical className="h-4 w-4 text-zinc-600 cursor-grab active:cursor-grabbing hover:text-white transition-colors" />

                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
                                            "bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700 group-hover:text-zinc-200"
                                        )}>
                                            <SpecificIcon className="h-4 w-4" />
                                        </div>
                                        <div
                                            className="font-bold text-sm text-zinc-100 cursor-pointer hover:text-white transition-colors"
                                            onClick={() => handleOpenEdit(field)}
                                        >
                                            {field.label}
                                        </div>
                                    </div>
                                </div>

                                {/* Type */}
                                <div className="col-span-3">
                                    <div className={cn(
                                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-bold uppercase tracking-wider",
                                        field.type === 'number'
                                            ? "bg-blue-500/10 border-blue-500/20 text-blue-500"
                                            : (field.type === 'textarea' || field.type === 'text')
                                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                                                : "bg-zinc-800 border-white/5 text-zinc-400"
                                    )}>
                                        {field.type === 'number' && <Hash className="h-3 w-3" />}
                                        {(field.type === 'textarea' || field.type === 'text') && <AlignLeft className="h-3 w-3" />}
                                        {field.type === 'date' && <Calendar className="h-3 w-3" />}
                                        {field.type === 'select' && <List className="h-3 w-3" />}
                                        {field.type === 'boolean' && <ToggleRight className="h-3 w-3" />}

                                        <span>{TYPE_LABELS[field.type]}</span>
                                    </div>
                                </div>

                                {/* Required Badge */}
                                <div className="col-span-3">
                                    {field.required ? (
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                            <span className="text-[10px] uppercase font-bold text-emerald-500 tracking-wide">Обязательное</span>
                                        </div>
                                    ) : (
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-800/50 border border-zinc-700">
                                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                                            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wide">Опционально</span>
                                        </div>
                                    )}
                                </div>

                                {/* Active Toggle */}
                                <div className="col-span-1 flex justify-end items-center gap-2">
                                    <Switch
                                        checked={isEnabled}
                                        onCheckedChange={() => handleToggleEnabled(field.id, field.enabled)}
                                        className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-zinc-700 h-5 w-9 border-2 border-transparent data-[state=checked]:border-emerald-500/20"
                                    />
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => handleOpenEdit(field)}
                                        className="h-8 w-8 text-zinc-600 hover:text-white transition-colors"
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    <button onClick={() => handleDelete(field.id)} className="ml-2 text-zinc-600 hover:text-red-500 transition-colors opacity-100">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </Reorder.Item>
                        );
                    })}
                </Reorder.Group>
            </div>

            {/* Footer Stats - 3 Cards */}
            <div className="grid grid-cols-3 gap-4 mt-auto pt-6">
                <div className="bg-[#18181b] rounded-xl p-5 border border-white/5 flex flex-col justify-between h-24 relative overflow-hidden group hover:border-blue-500/30 transition-colors">
                    <span className="text-3xl font-black text-blue-500">{totalFields}</span>
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Всего полей</span>
                </div>

                <div className="bg-[#18181b] rounded-xl p-5 border border-white/5 flex flex-col justify-between h-24 relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
                    <span className="text-3xl font-black text-emerald-500">{activeFields}</span>
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Активных</span>
                </div>

                <div className="bg-[#18181b] rounded-xl p-5 border border-white/5 flex flex-col justify-between h-24 relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
                    <span className="text-3xl font-black text-emerald-400">{requiredFields}</span>
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Обязательных</span>
                </div>
            </div>

            {/* Hidden Create Button Trigger logic handled by parent or custom button in header */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[500px] text-zinc-100 p-0 overflow-hidden gap-0">
                    <DialogHeader className="p-6 bg-zinc-900 border-b border-white/5">
                        <DialogTitle>{editMode === 'create' ? 'Новое поле' : 'Редактирование поля'}</DialogTitle>
                    </DialogHeader>
                    <div className="p-6 space-y-6">
                        <div className="space-y-3">
                            <Label className="uppercase text-xs font-bold text-zinc-500 tracking-wider">Название</Label>
                            <Input
                                value={editState.label}
                                onChange={e => setEditState({ ...editState, label: e.target.value })}
                                className="bg-zinc-900 border-white/10 h-10 focus:border-emerald-500/50 transition-colors"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <Label className="uppercase text-xs font-bold text-zinc-500 tracking-wider">Тип</Label>
                                <Select
                                    value={editState.type}
                                    onValueChange={(v: any) => setEditState({ ...editState, type: v })}
                                >
                                    <SelectTrigger className="bg-zinc-900 border-white/10 h-10">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-white/10">
                                        {Object.entries(TYPE_LABELS).map(([key, label]) => (
                                            <SelectItem key={key} value={key}>{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-3">
                                <Label className="uppercase text-xs font-bold text-zinc-500 tracking-wider">Подсказка</Label>
                                <Input
                                    value={editState.placeholder}
                                    onChange={e => setEditState({ ...editState, placeholder: e.target.value })}
                                    className="bg-zinc-900 border-white/10 h-10"
                                    placeholder="..."
                                />
                            </div>
                        </div>

                        {editState.type === 'select' && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                <Label className="uppercase text-xs font-bold text-zinc-500 tracking-wider">Опции</Label>
                                <Textarea
                                    value={editOptionsText}
                                    onChange={e => setEditOptionsText(e.target.value)}
                                    className="bg-zinc-900 border-white/10 font-mono text-xs"
                                    rows={4}
                                    placeholder="Каждый вариант с новой строки"
                                />
                            </div>
                        )}

                        <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/50 border border-white/5">
                            <div className="space-y-1">
                                <Label className="text-sm font-medium text-zinc-200">Обязательное поле</Label>
                                <div className="text-xs text-zinc-500">Нельзя отправить форму без этого поля</div>
                            </div>
                            <Switch
                                checked={editState.required}
                                onCheckedChange={c => setEditState({ ...editState, required: c })}
                                className="data-[state=checked]:bg-emerald-500"
                            />
                        </div>
                    </div>
                    <DialogFooter className="p-6 bg-zinc-900/50 border-t border-white/5">
                        <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="hover:bg-white/5 hover:text-white">Отмена</Button>
                        <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">Сохранить</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Hidden trigger for Parent component to call */}
            <button
                id="form-builder-add-trigger"
                className="hidden"
                onClick={handleOpenCreate}
            />
        </div>
    );
}
