import { motion } from 'framer-motion';
import { Send, ChevronRight } from 'lucide-react';
import { SendNotificationDialog } from '@/components/notifications/SendNotificationDialog';

export function SendNotificationButton() {
    return (
        <SendNotificationDialog
            trigger={
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileTap={{ scale: 0.99 }}
                    className="relative overflow-hidden rounded-xl md:rounded-[2.5rem] p-4 md:p-6 bg-zinc-900/60 backdrop-blur-xl border border-white/5 cursor-pointer transition-all duration-300 group hover:bg-white/5 flex items-center justify-between shadow-2xl"
                >
                    <div className="flex items-center gap-3 md:gap-5">
                        <div className="p-2.5 md:p-3.5 rounded-xl md:rounded-2xl bg-primary/10 text-primary border border-primary/20 group-hover:scale-110 transition-transform duration-500 shadow-xl shadow-primary/5">
                            <Send className="h-5 w-5 md:h-6 md:w-6" />
                        </div>
                        <div className="space-y-0.5">
                            <h3 className="font-black text-base md:text-xl text-white uppercase tracking-tight italic">Отправить уведомление</h3>
                            <p className="text-[9px] md:text-[10px] font-bold text-white/20 uppercase tracking-widest">Всем сотрудникам или персонально</p>
                        </div>
                    </div>

                    <div className="p-2 md:p-3 rounded-full bg-white/5 text-white/20 group-hover:text-primary group-hover:bg-primary/10 transition-all duration-500 border border-transparent group-hover:border-primary/20">
                        <ChevronRight className="h-4 w-4 md:h-5 md:w-5" />
                    </div>
                </motion.div>
            }
        />
    );
}
