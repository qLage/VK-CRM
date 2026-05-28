import { useState } from 'react';
import { Plus, Zap, Edit2, Lock, Users } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function PositionsSettings() {
    const queryClient = useQueryClient();
    const [isCreating, setIsCreating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [newPosition, setNewPosition] = useState({ name: '', base_salary: 0, commission_percent: 40, is_salary_enabled: true, is_kpi_enabled: true });
    const [editingPosition, setEditingPosition] = useState<any>(null);

    const { data: positions = [], isLoading } = useQuery({
        queryKey: ['positions'],
        queryFn: async () => {
            const { data } = await localAPI.request('/positions');
            if (Array.isArray(data?.data)) return data.data;
            if (Array.isArray(data)) return data;
            return [];
        },
        staleTime: 300000, // Cache for 5 minutes
    });

    const createPositionMutation = useMutation({
        mutationFn: async (pos: typeof newPosition) => { await localAPI.request('/positions', { method: 'POST', body: pos }); },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['positions'] }); toast.success('Должность создана'); setIsCreating(false); setNewPosition({ name: '', base_salary: 0, commission_percent: 40, is_salary_enabled: true, is_kpi_enabled: true }); }
    });

    const updatePositionMutation = useMutation({
        mutationFn: async (pos: any) => { await localAPI.request(`/positions/${pos.id}`, { method: 'PATCH', body: pos }); },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['positions'] }); toast.success('Должность обновлена'); setIsEditing(false); setEditingPosition(null); }
    });

    const handleEditClick = (pos: any) => {
        setEditingPosition({ ...pos });
        setIsEditing(true);
    };

    if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;

    const positionOrder = [
        'pos-director',
        'pos-admin',
        'pos-comm',
        'pos-rop',
        'pos-mop',
        'pos-mortgage',
        'pos-realtor'
    ];

    const sortedPositions = [...positions].sort((a, b) => {
        const indexA = positionOrder.indexOf(a.id);
        const indexB = positionOrder.indexOf(b.id);

        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;

        return a.name.localeCompare(b.name);
    });

    return (
        <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
                {sortedPositions.map((pos: any) => {
                    const isProtected = ['pos-director', 'pos-admin'].includes(pos.id);

                    return (
                        <Card key={pos.id} className="glass-card border-white/5 hover:border-white/10 transition-all group overflow-hidden">
                            <CardContent className="p-4 md:p-5">
                                <div className="flex justify-between items-start mb-3 md:mb-4">
                                    <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center border border-white/5 text-white group-hover:scale-110 transition-transform duration-300">
                                        <Zap className="h-4 w-4 md:h-5 md:w-5 text-amber-400" />
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {!isProtected && (
                                            <Button size="icon" variant="ghost" className="h-7 w-7 md:h-8 md:w-8 hover:bg-white/10 rounded-lg" onClick={() => handleEditClick(pos)}>
                                                <Edit2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
                                            </Button>
                                        )}
                                        {isProtected && (
                                            <div className="flex h-7 md:h-8 items-center px-1.5 md:px-2 text-[9px] md:text-[10px] font-black uppercase tracking-wider md:tracking-widest text-zinc-500/50">
                                                <Lock className="h-2.5 w-2.5 md:h-3 md:w-3 mr-0.5 md:mr-1" /> Заблокировано
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <h3 className="font-bold text-white text-base md:text-lg mb-1 flex items-center gap-1.5 md:gap-2">
                                    {pos.name}
                                </h3>
                                <div className="flex flex-wrap gap-1.5 md:gap-2 mb-3 md:mb-4">
                                    {pos.is_new_building === 1 && <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-none text-[10px] md:text-xs">Новостройки</Badge>}
                                </div>

                                <div className="space-y-2 md:space-y-3 pt-2.5 md:pt-3 border-t border-white/5">
                                    {pos.is_salary_enabled && (
                                        <div className="flex justify-between items-center text-xs md:text-sm">
                                            <span className="text-muted-foreground">Оклад</span>
                                            <span className="font-mono font-bold text-white tracking-wide">{parseFloat(pos.base_salary).toLocaleString('ru-RU')} ₽</span>
                                        </div>
                                    )}
                                    {pos.is_kpi_enabled && (
                                        <div className="flex justify-between items-center text-xs md:text-sm">
                                            <span className="text-muted-foreground">Личный KPI</span>
                                            <span className="font-mono font-bold text-amber-400">{pos.commission_percent}%</span>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
                {positions.length === 0 && (
                    <div className="col-span-full py-8 md:py-12 text-center text-muted-foreground border border-dashed border-white/10 rounded-2xl md:rounded-3xl bg-white/5">
                        <Users className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-2 md:mb-3 opacity-20" />
                        <p className="text-sm md:text-base">Должности не найдены</p>
                    </div>
                )}
            </div>

            <Dialog open={isEditing} onOpenChange={setIsEditing}>
                <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-base md:text-lg">Редактировать должность</DialogTitle>
                        <DialogDescription className="sr-only">Изменение параметров должности и ставок</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 md:space-y-4 pt-3 md:pt-4">
                        <div className="space-y-1.5 md:space-y-2"><Label className="text-xs md:text-sm">Название</Label><Input className="bg-black/20 h-9 md:h-10 text-sm md:text-base" value={editingPosition?.name || ''} onChange={e => setEditingPosition({ ...editingPosition, name: e.target.value })} disabled={editingPosition?.is_system} /></div>
                        <div className="grid grid-cols-2 gap-3 md:gap-4">
                            {editingPosition?.is_salary_enabled && (
                                <div className="space-y-1.5 md:space-y-2"><Label className="text-xs md:text-sm">Оклад (₽)</Label><Input className="bg-black/20 h-9 md:h-10 text-sm md:text-base" type="number" value={editingPosition?.base_salary || 0} onChange={e => setEditingPosition({ ...editingPosition, base_salary: Number(e.target.value) })} /></div>
                            )}
                            {editingPosition?.is_kpi_enabled && (
                                <div className="space-y-1.5 md:space-y-2"><Label className="text-xs md:text-sm">Личный KPI (%)</Label><Input className="bg-black/20 h-9 md:h-10 text-sm md:text-base" type="number" value={editingPosition?.commission_percent || 0} onChange={e => setEditingPosition({ ...editingPosition, commission_percent: Number(e.target.value) })} /></div>
                            )}
                        </div>


                        <div className="border-t border-white/10 pt-3 md:pt-4 space-y-3 md:space-y-4">
                            <h4 className="font-medium text-sm md:text-base">Типы KPI</h4>

                            <div className="flex items-center justify-between p-2.5 md:p-3 rounded-lg bg-white/5 border border-white/5">
                                <div className="flex flex-col gap-1">
                                    <Label className="cursor-pointer text-xs md:text-sm">Личный KPI</Label>
                                    <span className="text-[10px] md:text-xs text-muted-foreground">Процент от сделок сотрудника</span>
                                </div>
                                <Switch
                                    checked={Boolean(editingPosition?.has_personal_kpi ?? editingPosition?.is_kpi_enabled)}
                                    onCheckedChange={checked => setEditingPosition({ ...editingPosition, has_personal_kpi: checked })}
                                />
                            </div>

                            <div className="flex items-center justify-between p-2.5 md:p-3 rounded-lg bg-white/5 border border-white/5">
                                <div className="flex flex-col gap-1">
                                    <Label className="cursor-pointer text-xs md:text-sm">Управленческий KPI</Label>
                                    <span className="text-[10px] md:text-xs text-muted-foreground">Процент выполнения плана команды</span>
                                </div>
                                <Switch
                                    checked={Boolean(editingPosition?.has_management_kpi ?? (editingPosition?.default_management_kpi_max > 0))}
                                    onCheckedChange={checked => setEditingPosition({ ...editingPosition, has_management_kpi: checked })}
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-2.5 md:p-3 rounded-lg bg-white/5 border border-white/5">
                            <div className="flex items-center gap-2">
                                <Label className="cursor-pointer text-xs md:text-sm">Есть оклад</Label>
                            </div>
                            <Switch checked={Boolean(editingPosition?.is_salary_enabled)} onCheckedChange={checked => setEditingPosition({ ...editingPosition, is_salary_enabled: checked })} />
                        </div>
                        <div className="flex items-center justify-between p-2.5 md:p-3 rounded-lg bg-white/5 border border-white/5">
                            <div className="flex items-center gap-2">
                                <Label className="cursor-pointer text-xs md:text-sm">Есть KPI</Label>
                            </div>
                            <Switch checked={Boolean(editingPosition?.is_kpi_enabled)} onCheckedChange={checked => setEditingPosition({ ...editingPosition, is_kpi_enabled: checked })} />
                        </div>
                        <Button className="w-full gradient-primary mt-2 h-9 md:h-10 text-sm md:text-base" onClick={() => updatePositionMutation.mutate(editingPosition)}>Сохранить изменения</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
