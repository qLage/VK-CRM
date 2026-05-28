import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, MapPin, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useAuth } from '@/hooks/useAuth';

const FIXED_SCHEDULE: Record<number, { time: string; title: string }[]> = {
    1: [ // Пн
        { time: '10:00 - 10:30', title: 'Летучка' },
        { time: '10:30 - 13:00', title: 'Звонки' },
        { time: '13:00 - 14:00', title: 'Обед' },
        { time: '14:00 - 15:00', title: 'Отчет продавцам' },
        { time: '15:00 - 17:00', title: 'Подготовка к встречам' },
        { time: '17:00', title: 'Встречи' }
    ],
    2: [ // Вт
        { time: '10:00 - 10:30', title: 'Летучка' },
        { time: '10:30 - 13:00', title: 'Звонки' },
        { time: '13:00 - 14:00', title: 'Обед' },
        { time: '14:00 - 15:00', title: 'Обучение по новостройкам' },
        { time: '15:00 - 17:00', title: 'Подготовка к встречам' },
        { time: '17:00', title: 'Встречи' }
    ],
    3: [ // Ср
        { time: '10:00 - 11:00', title: 'Собрание' },
        { time: '11:00 - 13:00', title: 'Работа' },
        { time: '13:00 - 14:00', title: 'Обед' },
        { time: '14:00 - 15:00', title: 'Работа' },
        { time: '15:00 - 17:00', title: 'Подготовка к встречам' },
        { time: '17:00', title: 'Встречи' }
    ],
    4: [ // Чт
        { time: '10:00 - 10:30', title: 'Летучка' },
        { time: '10:30 - 12:00', title: 'Звонки' },
        { time: '12:00 - 15:00', title: 'Съемки' },
        { time: '15:00 - 16:00', title: 'Обзвон покупателей' },
        { time: '16:00 - 17:00', title: 'Подготовка к встречам' },
        { time: '17:00', title: 'Встречи' }
    ],
    5: [ // Пт
        { time: '10:00 - 10:30', title: 'Летучка' },
        { time: '10:30 - 13:00', title: 'Звонки по избранным' },
        { time: '13:00 - 14:00', title: 'Обед' },
        { time: '14:00 - 15:00', title: 'Снижение цены продавца' },
        { time: '15:00 - 17:00', title: 'Подготовка к встречам' },
        { time: '17:00', title: 'Встречи' }
    ],
    6: [],
    0: []
};

export function CalendarWidget() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const { data: events = [] } = useQuery<any[]>({
        queryKey: ['calendar-events', format(currentDate, 'yyyy-MM')],
        queryFn: async () => {
            const start = format(startOfMonth(currentDate), 'yyyy-MM-dd');
            const end = format(endOfMonth(currentDate), 'yyyy-MM-dd');
            const { data } = await localAPI.request(`/calendar/events?start=${start}&end=${end}`);
            const eventsArray = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
            return eventsArray.map((e: any) => ({
                ...e,
                date: new Date(e.start), // Convert string to Date
                time: format(new Date(e.start), 'HH:mm')
            }));
        },
        placeholderData: keepPreviousData,
        staleTime: 180000, // Cache for 3 minutes
    });

    const days = eachDayOfInterval({
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate),
    });

    const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
    const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

    const handleDateClick = (date: Date) => {
        setSelectedDate(date);
        setIsDialogOpen(true);
    };

    const dayEvents = (date: Date) => events.filter((e: any) => isSameDay(e.date, date));

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ y: -5 }}
            className="bg-zinc-900/40 backdrop-blur-3xl border border-white/5 rounded-xl md:rounded-[2.5rem] p-4 md:p-8 h-full min-h-[320px] md:min-h-[420px] flex flex-col group relative overflow-hidden shadow-2xl transition-all duration-700 hover:bg-zinc-900/60 hover:border-white/10"
        >
            {/* Background Glow */}
            <div className="absolute -top-40 -left-40 p-40 bg-primary/10 blur-[120px] rounded-full pointer-events-none opacity-40 group-hover:opacity-60 transition-opacity duration-1000" />

            <div className="relative z-10 flex items-center justify-between mb-4 md:mb-8">
                <div className="flex items-center gap-2 md:gap-4">
                    <div className="p-2 md:p-3 bg-white/5 rounded-lg md:rounded-xl border border-white/5 group-hover:bg-primary/20 group-hover:border-primary/30 transition-all duration-500">
                        <CalendarIcon className="h-4 w-4 md:h-5 md:w-5 text-white" />
                    </div>
                    <h3 className="text-sm md:text-xl font-black tracking-tighter text-white capitalize leading-none">
                        {format(currentDate, 'LLLL yyyy', { locale: ru })}
                    </h3>
                </div>
                <div className="flex gap-1 md:gap-2">
                    <Button size="icon" variant="ghost" className="h-7 w-7 md:h-8 md:w-8 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 text-white/60 transition-all" onClick={handlePrevMonth}>
                        <ChevronLeft className="h-3 w-3 md:h-4 md:w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 md:h-8 md:w-8 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 text-white/60 transition-all" onClick={handleNextMonth}>
                        <ChevronRight className="h-3 w-3 md:h-4 md:w-4" />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-7 gap-0.5 md:gap-1 text-center text-[9px] md:text-xs text-muted-foreground mb-1 md:mb-2">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
                    <div key={d} className="py-0.5 md:py-1">{d}</div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-1 md:gap-2 flex-1 relative z-10">
                {Array.from({ length: (new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay() + 6) % 7 }).map((_, i) => (
                    <div key={`empty-${i}`} />
                ))}
                {days.map((day) => {
                    const todaysEvents = dayEvents(day);
                    const hasEvents = todaysEvents.length > 0;
                    const active = isSameDay(selectedDate || new Date(0), day);
                    const today = isToday(day);

                    return (
                        <button
                            key={day.toISOString()}
                            onClick={() => handleDateClick(day)}
                            className={cn(
                                "rounded-lg md:rounded-xl p-0.5 md:p-1 relative flex flex-col items-center justify-center min-h-[32px] md:min-h-[45px] transition-all duration-300 border",
                                today
                                    ? "bg-primary/20 text-white font-black border-primary/40 shadow-[0_0_15px_rgba(var(--primary),0.3)]"
                                    : "bg-white/5 border-transparent text-white/40 hover:bg-white/10 hover:border-white/10",
                                active && !today && "ring-2 ring-primary/40 text-white border-primary/20"
                            )}
                        >
                            <span className="text-[10px] md:text-xs font-black tracking-tight">{format(day, 'd')}</span>
                            {hasEvents && (
                                <div className="absolute bottom-0.5 md:bottom-1.5 flex gap-0.5">
                                    <div className="h-0.5 w-2 md:h-1 md:w-3 rounded-full bg-primary/60 blur-[1px]" />
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="mt-4 md:mt-8 pt-3 md:pt-6 border-t border-white/5 relative z-10">
                <h4 className="text-[9px] md:text-[10px] font-black text-white/30 uppercase tracking-[0.2em] md:tracking-[0.3em] mb-2 md:mb-4">БЛИЖАЙШИЕ СОБЫТИЯ</h4>
                <div className="space-y-2 md:space-y-3">
                    <div className="space-y-2 md:space-y-3">
                        {/* Общий список: события из БД (в будущем) + жесткое расписание на сегодня */}
                        {[
                            ...events.filter((e: any) => e.date >= new Date()),
                            // Добавляем текущее жесткое расписание, если это сегодня и время еще не прошло (приблизительно)
                            ...(FIXED_SCHEDULE[new Date().getDay()] || []).map((item, index) => {
                                const [hours, minutes] = item.time.split(' - ')[0].split(':').map(Number);
                                const eventDate = new Date();
                                eventDate.setHours(hours, minutes || 0, 0, 0);
                                return {
                                    id: `fixed-${index}`,
                                    title: item.title,
                                    date: eventDate,
                                    type: 'meeting', // default styling
                                    isFixed: true
                                };
                            }).filter(e => e.date >= new Date())
                        ]
                            .sort((a: any, b: any) => a.date.getTime() - b.date.getTime())
                            .slice(0, 2)
                            .map((event: any, i: number) => (
                                <div key={i} className="group/item flex items-center gap-2 md:gap-4 p-2 md:p-3 rounded-xl md:rounded-[1.25rem] bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all duration-500 shadow-xl">
                                    <div className={cn(
                                        "h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl flex items-center justify-center border transition-all duration-500 shrink-0",
                                        event.type === 'meeting' ? "bg-blue-500/10 border-blue-500/20 text-blue-500 group-hover/item:bg-blue-500 group-hover/item:text-white" :
                                            event.type === 'deal' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 group-hover/item:bg-emerald-500 group-hover/item:text-white" :
                                                event.type === 'report' ? "bg-green-500/10 border-green-500/20 text-green-500 group-hover/item:bg-green-500 group-hover/item:text-white" :
                                                    "bg-amber-500/10 border-amber-500/20 text-amber-500 group-hover/item:bg-amber-500 group-hover/item:text-white"
                                    )}>
                                        {event.type === 'report' ? <Target className="h-4 w-4 md:h-5 md:w-5" /> : <Clock className="h-4 w-4 md:h-5 md:w-5" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] md:text-xs font-black text-white leading-tight mb-0.5 md:mb-1 uppercase tracking-tight truncate">{event.title}</p>
                                        <p className="text-[9px] md:text-[10px] font-black text-white/30 uppercase tracking-wider">{format(event.date, 'd MMM', { locale: ru })}</p>
                                    </div>
                                    <ChevronRight className="h-3 w-3 text-white/10 group-hover/item:text-white/40 transition-colors shrink-0" />
                                </div>
                            ))}
                        {[...events.filter((e: any) => e.date >= new Date()), ...(FIXED_SCHEDULE[new Date().getDay()] || []).filter(item => {
                            const [hours, minutes] = item.time.split(' - ')[0].split(':').map(Number);
                            const eventDate = new Date();
                            eventDate.setHours(hours, minutes || 0, 0, 0);
                            return eventDate >= new Date();
                        })].length === 0 && (
                                <p className="text-[10px] md:text-xs text-muted-foreground text-center py-2 md:py-4 italic opacity-50">На сегодня событий больше нет</p>
                            )}
                    </div>
                </div>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="w-full sm:max-w-md border-0 sm:border bottom-0 sm:top-[50%] sm:bottom-auto translate-y-0 sm:translate-y-[-50%] rounded-t-[2rem] sm:rounded-2xl !max-h-[85vh] overflow-hidden">
                    <DialogHeader>
                        <DialogTitle>
                            События на {selectedDate && format(selectedDate, 'd MMMM yyyy', { locale: ru })}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                        <div className="space-y-2">
                            {selectedDate && dayEvents(selectedDate).length > 0 ? (
                                dayEvents(selectedDate).map((e: any, i: number) => (
                                    <div key={i} className="p-3 rounded-xl bg-secondary/50 border flex gap-3">
                                        <div className="mt-1">
                                            {e.type === 'report' ? <Target className="h-4 w-4 text-primary" /> : <Clock className="h-4 w-4 text-primary" />}
                                        </div>
                                        <div>
                                            <p className="font-medium">{e.title}</p>
                                            <p className="text-xs text-muted-foreground">{e.time}</p>
                                        </div>
                                    </div>
                                ))
                            ) : null}

                            {/* Show FIXED SCHEDULE for the selected date */}
                            {selectedDate && FIXED_SCHEDULE[selectedDate.getDay()] && FIXED_SCHEDULE[selectedDate.getDay()].length > 0 && (
                                <>
                                    <h4 className="text-xs font-semibold text-primary/80 uppercase tracking-widest mt-4 mb-2">Еженедельное расписание</h4>
                                    {FIXED_SCHEDULE[selectedDate.getDay()].map((item, id) => (
                                        <div key={`fix-${id}`} className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/10 flex gap-3">
                                            <div className="mt-1">
                                                <Clock className="h-4 w-4 text-indigo-400" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-white">{item.title}</p>
                                                <p className="text-xs text-indigo-400/70 font-mono">{item.time}</p>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}

                            {(!selectedDate || (dayEvents(selectedDate).length === 0 && (!FIXED_SCHEDULE[selectedDate.getDay()]?.length))) && (
                                <p className="text-center text-muted-foreground py-4">Нет событий на этот день</p>
                            )}
                        </div>
                        <Button className="w-full mt-4" disabled>Добавить событие (Скоро)</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
