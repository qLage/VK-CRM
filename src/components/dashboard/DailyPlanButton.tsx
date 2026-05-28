import { useState, useEffect } from 'react';
import { Target, Loader2, Check, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDailyPlanConfig } from '@/components/settings/DailyPlanSettings';
import { useReports } from '@/hooks/useReports';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export function DailyPlanButton() {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { fields, isLoading: isConfigLoading } = useDailyPlanConfig();
    const { createReport, reports } = useReports();

    // Check if plan already submitted today
    const [isSubmittedToday, setIsSubmittedToday] = useState(false);

    useEffect(() => {
        if (reports && user) {
            const today = new Date().toDateString();
            const hasPlan = reports.some(r =>
                r.type === 'plan' &&
                r.user_id === user.id &&
                new Date(r.created_at).toDateString() === today
            );
            setIsSubmittedToday(hasPlan);
        }
    }, [reports, user]);

    const handleOpen = () => {
        if (isSubmittedToday) {
            toast.success('План на сегодня уже составлен!');
            return;
        }
        setFormData({});
        setOpen(true);
    };

    const handleChange = (fieldId: string, value: string) => {
        setFormData(prev => ({ ...prev, [fieldId]: value }));
    };

    const handleSubmit = async () => {
        const missingRequired = fields.filter(f => f.required && !formData[f.id]?.trim());
        if (missingRequired.length > 0) {
            toast.error(`Заполните обязательные поля: ${missingRequired.map(f => f.label).join(', ')}`);
            return;
        }

        setIsSubmitting(true);
        try {
            const today = new Date().toLocaleDateString('ru-RU');
            const content: Record<string, any> = {};
            fields.forEach(f => {
                const val = formData[f.id] || '';
                if (f.type === 'number') {
                    content[f.id] = val ? Number(val) : 0;
                } else {
                    content[f.id] = val;
                }
            });

            await createReport('plan', `План на день — ${today}`, content);
            setOpen(false);
            setFormData({});
            toast.success('План на день зафиксирован');
        } catch {
            toast.error('Ошибка при сохранении плана');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -5, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                    "relative overflow-hidden rounded-xl md:rounded-[2.5rem] p-4 md:p-8 transition-all duration-700 cursor-pointer group h-full flex flex-col justify-between border shadow-2xl",
                    isSubmittedToday
                        ? "bg-amber-500/5 border-amber-500/10 hover:bg-amber-500/10"
                        : "bg-zinc-900/40 backdrop-blur-3xl border-white/5 hover:bg-zinc-900/60 hover:border-white/10"
                )}
                onClick={handleOpen}
            >
                <div className={cn(
                    "absolute -top-24 -right-24 w-64 h-64 blur-[80px] transition-all duration-1000 opacity-20",
                    isSubmittedToday ? "bg-amber-500" : "bg-orange-600"
                )} />

                <div className="relative z-10 flex flex-col h-full gap-4 md:gap-8">
                    <div className="flex items-start justify-between">
                        <div className={cn(
                            "p-2 md:p-4 rounded-lg md:rounded-2xl transition-all duration-700 shadow-2xl border",
                            isSubmittedToday
                                ? "bg-amber-500/10 border-amber-500/20 text-amber-400 group-hover:bg-amber-500 group-hover:text-white"
                                : "bg-orange-500/10 border-orange-500/20 text-orange-400 group-hover:bg-orange-500 group-hover:text-white"
                        )}>
                            {isSubmittedToday ? <CheckCircle2 className="h-5 w-5 md:h-7 md:w-7" /> : <Target className="h-5 w-5 md:h-7 md:w-7" />}
                        </div>

                        <div className={cn(
                            "h-8 w-8 md:h-10 md:w-10 rounded-full flex items-center justify-center border transition-all duration-500",
                            isSubmittedToday
                                ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                                : "bg-white/5 border-white/10 text-white/20 group-hover:border-orange-500/40 group-hover:text-orange-400"
                        )}>
                            <Check className="h-3 w-3 md:h-4 md:w-4" />
                        </div>
                    </div>

                    <div className="space-y-1 md:space-y-2">
                        <h3 className="font-black text-lg md:text-2xl tracking-tighter text-white leading-none uppercase">
                            {isSubmittedToday ? 'ПЛАН СОСТАВЛЕН' : 'ПЛАН НА ДЕНЬ'}
                        </h3>
                        <div className="flex items-center gap-2 md:gap-3">
                            <div className={cn("w-1 h-1 rounded-full", isSubmittedToday ? "bg-amber-500" : "bg-orange-500")} />
                            <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-white/40">
                                {isSubmittedToday ? 'Задачи зафиксированы' : 'Определите цели на сегодня'}
                            </p>
                        </div>
                    </div>
                </div>
            </motion.div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="w-full h-[100dvh] sm:h-auto sm:max-h-[85vh] sm:max-w-md flex flex-col p-0 gap-0 sm:rounded-2xl border-0 sm:border !max-h-[100dvh] sm:!max-h-[85vh] overflow-hidden">
                    <DialogHeader className="p-4 sm:p-6 border-b border-white/10 shrink-0">
                        <DialogTitle className="flex items-center gap-2 text-lg">
                            <Target className="h-5 w-5 text-orange-500" />
                            Планирование дня
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                        {isConfigLoading ? (
                            <p className="text-sm text-muted-foreground">Загрузка полей...</p>
                        ) : fields.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Нет полей для заполнения. Настройте их в настройках.</p>
                        ) : (
                            fields.map((field) => (
                                <div key={field.id} className="space-y-1.5">
                                    <Label className="text-sm font-medium">
                                        {field.label}
                                        {field.required && <span className="text-red-500 ml-1">*</span>}
                                    </Label>

                                    {field.type === 'textarea' ? (
                                        <Textarea
                                            value={formData[field.id] || ''}
                                            onChange={e => handleChange(field.id, e.target.value)}
                                            placeholder={field.placeholder}
                                            className="text-base min-h-[80px] bg-zinc-900/50 border-white/10 focus:border-primary/50"
                                        />
                                    ) : field.type === 'select' ? (
                                        <Select
                                            value={formData[field.id] || ''}
                                            onValueChange={v => handleChange(field.id, v)}
                                        >
                                            <SelectTrigger className="bg-zinc-900/50 border-white/10 w-full h-11">
                                                <SelectValue placeholder="Выберите..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {field.options?.map(opt => (
                                                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Input
                                            type={field.type === 'number' ? 'number' : 'text'}
                                            inputMode={field.type === 'number' ? 'numeric' : 'text'}
                                            value={formData[field.id] || ''}
                                            onChange={e => handleChange(field.id, e.target.value)}
                                            placeholder={field.placeholder}
                                            className="text-base h-11 bg-zinc-900/50 border-white/10 focus:border-primary/50"
                                        />
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    <div className="flex gap-3 p-4 border-t border-white/10 bg-zinc-900/80 backdrop-blur-md shrink-0 sm:rounded-b-2xl">
                        <Button variant="outline" className="flex-1 h-11 border-white/10 hover:bg-white/5" onClick={() => setOpen(false)}>
                            Отмена
                        </Button>
                        <Button
                            className="flex-1 gradient-accent text-primary-foreground h-11 shadow-lg shadow-primary/20"
                            onClick={handleSubmit}
                            disabled={isSubmitting || fields.length === 0}
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Сохранить план'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
