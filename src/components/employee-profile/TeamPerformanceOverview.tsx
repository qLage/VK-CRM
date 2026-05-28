import { motion } from 'framer-motion';
import { Users, TrendingUp, DollarSign, Target, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

interface Employee {
    id: string;
    full_name: string;
    role?: string;
    team_id?: string;
    branch_id?: string;
    custom_total_deals?: number;
    custom_total_revenue?: number;
    mortgage_deduction?: number;
}

interface TeamPerformanceOverviewProps {
    employee: Employee;
    allEmployees: Employee[];
}

export function TeamPerformanceOverview({ employee, allEmployees }: TeamPerformanceOverviewProps) {
    // Filter team members based on the employee's team/branch
    const teamMembers = useMemo(() => {
        const employeesArray = Array.isArray(allEmployees) ? allEmployees : [];
        return employeesArray.filter(emp =>
            (employee.team_id && emp.team_id === employee.team_id) ||
            (!employee.team_id && employee.branch_id && emp.branch_id === employee.branch_id)
        );
    }, [employee, allEmployees]);

    const stats = useMemo(() => {
    const totalDeals = teamMembers.reduce((sum, m) => sum + (m?.custom_total_deals ?? 0), 0);
        const totalRevenue = teamMembers.reduce((sum, m) => sum + (m?.custom_total_revenue ?? 0), 0);
        const totalMortgage = teamMembers.reduce((sum, m) => sum + (m?.mortgage_deduction ?? 0), 0);
        const avgRevenue = teamMembers.length > 0 ? totalRevenue / teamMembers.length : 0;

        return {
            totalDeals,
            totalRevenue,
            totalMortgage,
            avgRevenue,
            memberCount: teamMembers.length
        };
    }, [teamMembers]);

    if (teamMembers.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-xl md:rounded-[2rem] bg-gradient-to-br from-indigo-500/10 to-zinc-900/40 backdrop-blur-3xl border border-indigo-500/20 p-4 sm:p-6 md:p-8 shadow-2xl w-full"
        >
            <div className="flex items-center justify-between mb-6 md:mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-2 md:p-2.5 rounded-lg md:rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                        <Users className="h-4 w-4 md:h-5 md:w-5 text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-lg sm:text-xl md:text-2xl font-black text-white uppercase tracking-tight">
                            Обзор команды
                        </h2>
                        <p className="text-[9px] md:text-[10px] font-bold text-white/40 uppercase tracking-wider mt-0.5">
                            Аналитика подразделения
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Revenue */}
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="flex items-center gap-2 mb-2 text-indigo-400">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-[9px] md:text-[10px] font-black uppercase">Выручка команды</span>
                    </div>
                    <p className="text-2xl md:text-3xl font-black text-white">
                        {new Intl.NumberFormat('ru-RU').format(Math.round(stats.totalRevenue))}₽
                    </p>
                </div>

                {/* Total Mortgage */}
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="flex items-center gap-2 mb-2 text-amber-400">
                        <Target className="h-4 w-4" />
                        <span className="text-[9px] md:text-[10px] font-black uppercase">Ипотека (всего)</span>
                    </div>
                    <p className="text-2xl md:text-3xl font-black text-white">
                        {new Intl.NumberFormat('ru-RU').format(Math.round(stats.totalMortgage))}₽
                    </p>
                </div>

                {/* Total Deals */}
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="flex items-center gap-2 mb-2 text-blue-400">
                        <Award className="h-4 w-4" />
                        <span className="text-[9px] md:text-[10px] font-black uppercase">Сделок команды</span>
                    </div>
                    <p className="text-2xl md:text-3xl font-black text-white">
                        {stats.totalDeals}
                    </p>
                </div>

                {/* Members */}
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="flex items-center gap-2 mb-2 text-purple-400">
                        <Users className="h-4 w-4" />
                        <span className="text-[9px] md:text-[10px] font-black uppercase">В команде</span>
                    </div>
                    <p className="text-2xl md:text-3xl font-black text-white">
                        {stats.memberCount}
                    </p>
                </div>
            </div>
        </motion.div>
    );
}
