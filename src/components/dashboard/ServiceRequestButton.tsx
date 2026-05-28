import { motion } from 'framer-motion';
import { Plus, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function ServiceRequestButton() {
    return (
        <Link to="/service-requests" className="block w-full h-full">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -5, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="relative overflow-hidden rounded-xl md:rounded-[2.5rem] p-4 md:p-8 bg-zinc-900/40 backdrop-blur-3xl border border-white/5 hover:bg-zinc-900/60 hover:border-white/10 transition-all duration-700 group h-full flex flex-col justify-between shadow-2xl"
            >
                {/* Background Glows */}
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-purple-600/20 blur-[80px] rounded-full transition-all duration-1000 group-hover:bg-purple-600/30 opacity-20" />

                <div className="relative z-10 flex flex-col h-full gap-4 md:gap-8">
                    <div className="flex items-start justify-between">
                        <div className="p-2 md:p-4 rounded-lg md:rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 group-hover:bg-purple-500 group-hover:text-white transition-all duration-700 shadow-2xl">
                            <Plus className="h-5 w-5 md:h-7 md:w-7" />
                        </div>

                        <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-white/5 border border-white/10 text-white/20 flex items-center justify-center group-hover:border-purple-500/40 group-hover:text-purple-400 transition-all duration-500">
                            <ChevronRight className="h-3 w-3 md:h-4 md:w-4" />
                        </div>
                    </div>

                    <div className="space-y-1 md:space-y-2">
                        <h3 className="font-black text-lg md:text-2xl tracking-tighter text-white leading-none uppercase">
                            НОВАЯ СЛУЖЕБКА
                        </h3>
                        <div className="flex items-center gap-2 md:gap-3">
                            <div className="w-1 h-1 rounded-full bg-purple-500" />
                            <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] md:tracking-[0.2em] text-white/40">
                                Создать запрос или документ
                            </p>
                        </div>
                    </div>
                </div>
            </motion.div>
        </Link>
    );
}
