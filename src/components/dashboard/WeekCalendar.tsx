import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAttendanceData } from '@/hooks/useSharedData';
import { useAuth } from '@/hooks/useAuth';
import { format, subDays, addDays, startOfWeek, isSameDay, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';

import { Clock } from 'lucide-react';

interface AttendanceRecord {
  date: string;
  check_in: string | null;
  check_out: string | null;
}

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

export function WeekCalendar() {
  const { user } = useAuth();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    return startOfWeek(today, { weekStartsOn: 1 });
  });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Fetch attendance using shared hook
  const { data: allAttendance = [], isLoading } = useAttendanceData();

  // Filter attendance for current week and user
  const attendance = useMemo(() => {
    if (!user?.id) return [];

    const weekEnd = addDays(currentWeekStart, 6);
    const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

    return allAttendance.filter((a: any) =>
      a.user_id === user.id && a.date >= weekStartStr && a.date <= weekEndStr
    ) as AttendanceRecord[];
  }, [allAttendance, user?.id, currentWeekStart]);

  const getWeekDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(currentWeekStart, i);
      const dateStr = format(day, 'yyyy-MM-dd');
      const attendanceRecord = attendance.find(a => a.date === dateStr);

      days.push({
        date: day,
        dateStr,
        checkIn: attendanceRecord?.check_in,
        checkOut: attendanceRecord?.check_out,
        hasAttendance: !!attendanceRecord?.check_in,
      });
    }
    return days;
  };

  const weekDays = getWeekDays();
  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentWeekStart(prev =>
      direction === 'next' ? addDays(prev, 7) : subDays(prev, 7)
    );
    setSelectedDay(null);
  };

  const isToday = (date: Date) => isSameDay(date, new Date());

  const todayIndex = weekDays.findIndex((d) => isToday(d.date));
  const activeDayIndex = selectedDay !== null ? selectedDay : todayIndex !== -1 ? todayIndex : 0;
  const activeDay = weekDays[activeDayIndex];

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return null;
    const date = parseISO(timeStr);
    return format(date, 'HH:mm');
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl glass-card border border-border/50 overflow-hidden">
        <div className="p-4 border-b border-border/50">
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="p-4">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map(i => (
              <Skeleton key={i} className="h-16 w-12 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-xl md:rounded-2xl glass-card border border-border/50 overflow-hidden"
    >
      {/* Header */}
      <div className="p-3 md:p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 md:gap-2">
            <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-primary/15">
              <Calendar className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
            </div>
            <span className="font-semibold text-xs md:text-sm">Распорядок дня</span>
          </div>
          <div className="flex items-center gap-0.5 md:gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigateWeek('prev')} className="h-7 w-7 md:h-8 md:w-8 rounded-lg md:rounded-xl">
              <ChevronLeft className="h-3.5 w-3.5 md:h-4 md:w-4" />
            </Button>
            <span className="text-[10px] md:text-xs font-medium text-muted-foreground capitalize min-w-[80px] md:min-w-[90px] text-center">
              {format(currentWeekStart, 'LLLL yyyy', { locale: ru })}
            </span>
            <Button variant="ghost" size="icon" onClick={() => navigateWeek('next')} className="h-7 w-7 md:h-8 md:w-8 rounded-lg md:rounded-xl">
              <ChevronRight className="h-3.5 w-3.5 md:h-4 md:w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="p-3 md:p-4">
        {/* Week days */}
        <div className="flex gap-1.5 md:gap-2 overflow-x-auto pb-2 md:pb-3 -mx-1 px-1 scrollbar-hide">
          {weekDays.map((day, index) => (
            <motion.div
              key={day.dateStr}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => setSelectedDay(index)}
              className={cn(
                'flex flex-col items-center py-2 px-2.5 md:py-2.5 md:px-3.5 rounded-lg md:rounded-xl cursor-pointer transition-all min-w-[44px] md:min-w-[48px] touch-target relative',
                activeDayIndex === index
                  ? 'bg-primary text-primary-foreground shadow-accent'
                  : isToday(day.date)
                    ? 'bg-primary/20 text-primary'
                    : 'bg-secondary hover:bg-secondary/80'
              )}
            >
              <span className={cn(
                'text-[9px] md:text-[10px] font-medium',
                activeDayIndex === index ? 'text-primary-foreground/80' : 'text-muted-foreground'
              )}>
                {dayNames[index]}
              </span>
              <span className="text-sm md:text-base font-bold mt-0.5">{format(day.date, 'd')}</span>
              {day.hasAttendance && (
                <span className={cn(
                  'w-1 h-1 md:w-1.5 md:h-1.5 rounded-full mt-1',
                  activeDayIndex === index ? 'bg-primary-foreground' : 'bg-success'
                )} />
              )}
            </motion.div>
          ))}
        </div>

        {/* Selected day info */}
        <div className="mt-2 md:mt-3">
          <p className="text-[10px] md:text-xs text-muted-foreground font-semibold uppercase tracking-wide">
            {format(activeDay.date, 'EEEE, d MMMM', { locale: ru })}
          </p>

          {FIXED_SCHEDULE[activeDay.date.getDay()] && FIXED_SCHEDULE[activeDay.date.getDay()].length > 0 && (
            <div className="mt-2 md:mt-3 space-y-1.5 md:space-y-2">
              <h4 className="text-xs font-semibold text-primary/80 uppercase tracking-widest mb-1 hidden">Расписание</h4>
              {FIXED_SCHEDULE[activeDay.date.getDay()].map((item, id) => (
                <div key={id} className="flex items-center gap-2 md:gap-3 p-2 rounded-lg md:rounded-xl bg-white/5 border border-white/5">
                  <div className="h-7 w-7 md:h-8 md:w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0">
                    <Clock className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  </div>
                  <div>
                    <p className="font-bold text-xs md:text-sm text-white">{item.title}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground font-mono">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeDay.hasAttendance ? (
            <div className="mt-2 md:mt-3 flex items-center gap-2 px-2.5 py-1.5 md:px-3 md:py-2 rounded-lg md:rounded-xl bg-success/10 border border-success/20">
              <CheckCircle className="h-3.5 w-3.5 md:h-4 md:w-4 text-success" />
              <span className="text-xs md:text-sm font-medium text-success">На работе</span>
              {activeDay.checkIn && (
                <span className="text-[10px] md:text-xs text-muted-foreground ml-auto">
                  {formatTime(activeDay.checkIn)}
                  {activeDay.checkOut ? ` — ${formatTime(activeDay.checkOut)}` : ''}
                </span>
              )}
            </div>
          ) : (
            <div className="mt-2 md:mt-3 flex items-center gap-2 px-2.5 py-1.5 md:px-3 md:py-2 rounded-lg md:rounded-xl bg-secondary/50 border border-border/50">
              <XCircle className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground/50" />
              <span className="text-xs md:text-sm text-muted-foreground">
                {isToday(activeDay.date) ? 'Не отмечен' : 'Выходной / не был'}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
