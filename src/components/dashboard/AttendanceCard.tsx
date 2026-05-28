import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, LogOut, Clock, CheckCircle, Timer, AlertTriangle, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAttendance } from '@/hooks/useAttendance';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function AttendanceCard() {
  const { user } = useAuth();
  const { isCheckedIn, isCheckedOut, isInFields, checkInTime, checkOutTime, checkIn, checkOut, markInFields, loading } = useAttendance();
  const [confirmingAction, setConfirmingAction] = useState<'check-in' | 'check-out' | 'in-fields' | null>(null);
  const [showReturnFromFields, setShowReturnFromFields] = useState(false);

  const handleAction = async () => {
    if (confirmingAction === 'check-in') await checkIn();
    else if (confirmingAction === 'check-out') await checkOut();
    else if (confirmingAction === 'in-fields') {
      if (isInFields) {
        setShowReturnFromFields(true);
        setConfirmingAction(null);
        return;
      }
      await markInFields();
    }
    setConfirmingAction(null);
  };

  const dayCompleted = isCheckedIn && isCheckedOut;
  const checkInDate = checkInTime ? new Date(`1970-01-01T${checkInTime}:00`) : null;
  const deadline = new Date(`1970-01-01T09:00:00`);
  const isLatearrival = checkInDate && checkInDate > deadline;

  if (loading) {
    return <Skeleton className="w-full h-[180px] md:h-[220px] rounded-[2.5rem]" />;
  }

  if (!user) return null;

  const getConfirmDialogContent = () => {
    switch (confirmingAction) {
      case 'check-in':
        return {
          title: "Отметиться на приход?",
          description: "Вы подтверждаете своё прибытие на рабочее место?",
          action: "Пришёл"
        };
      case 'check-out':
        return {
          title: "Завершить рабочий день?",
          description: "Вы подтверждаете окончание работы и уход с рабочего места?",
          action: "Уйти"
        };
      case 'in-fields':
        return {
          title: "Уйти в поля?",
          description: "Вы подтверждаете начало работы в полях (вне офиса)?",
          action: "В поля"
        };
      default:
        return { title: "", description: "", action: "" };
    }
  };

  const dialogContent = getConfirmDialogContent();

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-xl md:rounded-[2.5rem] p-4 md:p-8 bg-zinc-900/40 backdrop-blur-3xl border border-white/5 group shadow-2xl flex flex-col justify-between min-h-[180px] md:min-h-[220px]"
      >
        {/* Dynamic Background Glow */}
        <div className={cn(
          "absolute -top-24 -right-24 w-64 h-64 blur-[100px] rounded-full transition-all duration-1000 opacity-60 pointer-events-none",
          dayCompleted ? "bg-emerald-500/10" : isInFields ? "bg-amber-500/20" : isCheckedIn ? "bg-primary/20" : "bg-zinc-500/10"
        )} />

        <div className="relative z-10 flex flex-col h-full space-y-4 md:space-y-8">
          {/* Header Section */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5 md:gap-5">
              <div className={cn(
                'p-2.5 md:p-4 rounded-xl md:rounded-2xl transition-all duration-700 shadow-xl border',
                dayCompleted ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 shadow-emerald-500/5' :
                  isCheckedIn ? 'bg-primary/10 border-primary/20 text-primary shadow-primary/5' :
                    'bg-white/5 border-white/5 text-white/20'
              )}>
                {dayCompleted ? (
                  <CheckCircle className="h-5 w-5 md:h-7 md:w-7" />
                ) : isInFields ? (
                  <MapPin className="h-5 w-5 md:h-7 md:w-7 animate-bounce text-amber-500" />
                ) : isCheckedIn ? (
                  <Timer className="h-5 w-5 md:h-7 md:w-7 animate-pulse" />
                ) : (
                  <Clock className="h-5 w-5 md:h-7 md:w-7" />
                )}
              </div>

              <div className="space-y-0.5 md:space-y-1">
                <h3 className="text-base md:text-2xl font-black text-white uppercase tracking-tight">ПОСЕЩАЕМОСТЬ</h3>
                <div className="flex items-center gap-1.5 md:gap-2">
                  <div className={cn("h-1 w-1 md:h-1.5 md:w-1.5 rounded-full", dayCompleted ? "bg-emerald-500" : isInFields ? "bg-amber-500" : isCheckedIn ? "bg-primary animate-pulse" : "bg-white/10")} />
                  <span className="text-[8px] md:text-[10px] font-black text-white/20 uppercase tracking-[0.15em] md:tracking-[0.3em]">
                    {dayCompleted ? 'День завершен' : isInFields ? 'Работает в полях' : isCheckedIn ? 'В процессе работы' : 'Ожидает отметки'}
                  </span>
                </div>
              </div>
            </div>

            {/* Time Display */}
            <AnimatePresence mode="wait">
              {checkInTime && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "px-2.5 py-1.5 md:px-5 md:py-2.5 rounded-xl md:rounded-2xl border backdrop-blur-3xl shadow-xl flex items-center gap-1.5 md:gap-3",
                    isLatearrival ? "bg-rose-500/5 border-rose-500/10" : "bg-white/5 border-white/5"
                  )}
                >
                  <Clock className={cn("h-3 w-3 md:h-3.5 md:w-3.5", isLatearrival ? "text-rose-500" : "text-white/20")} />
                  <span className={cn(
                    "text-xs md:text-sm font-black font-mono tracking-tighter tabular-nums",
                    isLatearrival ? "text-rose-400" : "text-white/60"
                  )}>
                    {checkInTime}
                    {checkOutTime && <span className="mx-1 md:mx-2 text-white/10">—</span>}
                    {checkOutTime}
                  </span>
                  {isLatearrival && !checkOutTime && (
                    <AlertTriangle className="h-3 w-3 md:h-3.5 md:w-3.5 text-rose-500 animate-bounce" />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Action Controls */}
          <div className="grid grid-cols-2 gap-2.5 md:gap-4">
            <Button
              onClick={() => setConfirmingAction('check-in')}
              disabled={isCheckedIn || loading}
              className={cn(
                'h-12 md:h-16 rounded-xl md:rounded-2xl font-black uppercase tracking-wide md:tracking-widest text-[10px] md:text-[11px] transition-all duration-500 relative overflow-hidden active:scale-95 group/btn border-none shadow-2xl',
                isCheckedIn
                  ? 'bg-zinc-800/40 text-white/20 border border-white/5 cursor-default'
                  : 'bg-primary hover:bg-primary-dark text-white shadow-primary/20 hover:shadow-primary/40'
              )}
            >
              {isCheckedIn ? (
                <span className="flex items-center gap-1.5 md:gap-2">
                  <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-emerald-500" /> Пришёл
                </span>
              ) : (
                <span className="flex items-center gap-1.5 md:gap-2">
                  <LogIn className="h-4 w-4 md:h-5 md:w-5 transition-transform group-hover/btn:translate-x-1" /> Пришёл
                </span>
              )}
            </Button>

            <Button
              onClick={isInFields ? () => setShowReturnFromFields(true) : () => setConfirmingAction('in-fields')}
              disabled={!isCheckedIn || isCheckedOut || loading}
              variant="outline"
              className={cn(
                'h-12 md:h-16 rounded-xl md:rounded-2xl font-black uppercase tracking-wide md:tracking-widest text-[10px] md:text-[11px] transition-all duration-500 relative overflow-hidden active:scale-95 group/btn',
                isInFields
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.1)]'
                  : 'border-white/5 bg-white/5 text-white/40 hover:text-white hover:bg-white/10 hover:border-white/20',
                (!isCheckedIn || isCheckedOut) && 'opacity-20 cursor-not-allowed grayscale'
              )}
            >
              <span className="flex items-center gap-1.5 md:gap-2">
                <MapPin className={cn("h-4 w-4 md:h-5 md:w-5", isInFields && "animate-pulse")} /> {isInFields ? 'В полях' : 'В поля'}
              </span>
            </Button>

            <Button
              onClick={() => setConfirmingAction('check-out')}
              disabled={!isCheckedIn || isCheckedOut || loading}
              variant="outline"
              className={cn(
                'h-12 md:h-16 col-span-2 rounded-xl md:rounded-2xl font-black uppercase tracking-wide md:tracking-widest text-[10px] md:text-[11px] transition-all duration-500 relative overflow-hidden active:scale-95 border-white/5 bg-white/5 text-white/40 hover:text-white hover:bg-white/10 hover:border-white/20 group/btn',
                (!isCheckedIn || isCheckedOut) && 'opacity-20 cursor-not-allowed grayscale'
              )}
            >
              <span className="flex items-center gap-1.5 md:gap-2 relative z-10">
                {isCheckedOut ? 'День окончен' : 'Отметиться на выход'}
                <LogOut className="h-4 w-4 md:h-5 md:w-5 transition-transform group-hover/btn:translate-x-1" />
              </span>
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Confirmation for Initial Actions */}
      <AlertDialog open={!!confirmingAction} onOpenChange={(open) => !open && setConfirmingAction(null)}>
        <AlertDialogContent className="bg-zinc-950/98 backdrop-blur-3xl border-white/10 sm:rounded-[2rem] shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-black text-white uppercase tracking-tight">
              {dialogContent.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/60 font-medium">
              {dialogContent.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 mt-4">
            <AlertDialogCancel className="h-12 rounded-xl bg-white/5 border-white/10 text-white font-bold uppercase tracking-widest text-[10px] hover:bg-white/10 hover:text-white">
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAction}
              className="h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[10px]"
            >
              {dialogContent.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Specialty Dialog for "Return from Fields" */}
      <AlertDialog open={showReturnFromFields} onOpenChange={setShowReturnFromFields}>
        <AlertDialogContent className="bg-zinc-950/98 backdrop-blur-3xl border-white/10 sm:rounded-[2rem] shadow-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-black text-white uppercase tracking-tight">
              Вернуться из полей?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/60 font-medium pt-2">
              Выберите действие для завершения работы в полях:
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid grid-cols-1 gap-3 mt-4">
            <button
              onClick={async () => {
                await markInFields();
                setShowReturnFromFields(false);
              }}
              className="flex items-center justify-between p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 hover:border-emerald-500/20 transition-all group"
            >
              <div className="flex flex-col items-start gap-1">
                <span className="text-sm font-black text-white uppercase tracking-tight">В офис</span>
                <span className="text-[10px] text-white/40 uppercase tracking-widest">Продолжить работу в офисе</span>
              </div>
              <CheckCircle className="h-5 w-5 text-emerald-500 opacity-40 group-hover:opacity-100 transition-opacity" />
            </button>

            <button
              onClick={async () => {
                await markInFields(); // First toggle is_in_fields to false
                await checkOut();     // Then perform checkout
                setShowReturnFromFields(false);
              }}
              className="flex items-center justify-between p-5 rounded-2xl bg-rose-500/5 border border-rose-500/10 hover:bg-rose-500/10 hover:border-rose-500/20 transition-all group"
            >
              <div className="flex flex-col items-start gap-1">
                <span className="text-sm font-black text-white uppercase tracking-tight">Завершить день</span>
                <span className="text-[10px] text-white/40 uppercase tracking-widest">Совсем уйти домой</span>
              </div>
              <LogOut className="h-5 w-5 text-rose-500 opacity-40 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>

          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="w-full h-12 rounded-xl bg-white/5 border-white/10 text-white font-bold uppercase tracking-widest text-[10px] hover:bg-white/10">
              Отмена
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
