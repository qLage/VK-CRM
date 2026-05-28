import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { Building2, Plus, Pencil, Trash2, MapPin, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export default function Branches() {
    const { canManageBranches, accessLevel } = useAuth();
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [editingBranch, setEditingBranch] = useState<any>(null);
    const [formData, setFormData] = useState({ name: '', city: '', address: '', phone: '' });

    const isManagement = canManageBranches || accessLevel >= 90;

    const { data: branches, isLoading } = useQuery({
        queryKey: ['branches'],
        queryFn: async () => {
            const { data, error } = await localAPI.request('/branches');
            if (error) throw error;
            if (Array.isArray(data?.data)) return data.data;
            if (Array.isArray(data)) return data;
            return [];
        },
        staleTime: 300000, // Cache for 5 minutes (branches rarely change)
    });

    const createMutation = useMutation({
        mutationFn: async (data: any) => {
            const { error } = await localAPI.request('/branches', { method: 'POST', body: data });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['branches'] });
            setIsDialogOpen(false);
            resetForm();
            toast.success('Филиал создан');
        },
        onError: () => toast.error('Ошибка при создании')
    });

    const updateMutation = useMutation({
        mutationFn: async (data: any) => {
            const { error } = await localAPI.request(`/branches/${editingBranch.id}`, { method: 'PUT', body: data });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['branches'] });
            setIsDialogOpen(false);
            resetForm();
            toast.success('Филиал обновлен');
        },
        onError: () => toast.error('Ошибка при обновлении')
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await localAPI.request(`/branches/${id}`, { method: 'DELETE' });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['branches'] });
            setDeleteId(null);
            toast.success('Филиал удален');
        },
        onError: (err: any) => toast.error(err.message || 'Ошибка при удалении')
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingBranch) {
            updateMutation.mutate(formData);
        } else {
            createMutation.mutate(formData);
        }
    };

    const handleEdit = (branch: any) => {
        setEditingBranch(branch);
        setFormData({
            name: branch.name,
            city: branch.city,
            address: branch.address || '',
            phone: branch.phone || ''
        });
        setIsDialogOpen(true);
    };

    const resetForm = () => {
        setEditingBranch(null);
        setFormData({ name: '', city: '', address: '', phone: '' });
    };

    if (!isManagement) {
        return (
            <MainLayout>
                <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground">
                    <Building2 className="h-16 w-16 mb-4 opacity-20" />
                    <h2 className="text-xl font-semibold">Доступ запрещен</h2>
                    <p>Только администраторы могут управлять филиалами</p>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="space-y-6 animate-fade-in pb-20">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="mb-3">
                            <img src="/logo-panel.svg" alt="Logo" className="h-6 w-auto object-contain opacity-60" />
                        </div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">Филиалы</h1>
                        <p className="text-sm text-muted-foreground mt-1">Управление сетью офисов</p>
                    </div>

                    <Dialog open={isDialogOpen} onOpenChange={(open) => {
                        setIsDialogOpen(open);
                        if (!open) resetForm();
                    }}>
                        <DialogTrigger asChild>
                            <Button className="gradient-primary shadow-lg hover:shadow-primary/20">
                                <Plus className="mr-2 h-4 w-4" /> Добавить филиал
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{editingBranch ? 'Редактировать филиал' : 'Новый филиал'}</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Название</label>
                                    <Input
                                        required
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Например: Филиал Центр"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Город</label>
                                    <Input
                                        required
                                        value={formData.city}
                                        onChange={e => setFormData({ ...formData, city: e.target.value })}
                                        placeholder="Москва"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Адрес</label>
                                    <Input
                                        value={formData.address}
                                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                                        placeholder="ул. Ленина, д. 1"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Телефон</label>
                                    <Input
                                        value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        placeholder="+7 (999) 000-00-00"
                                    />
                                </div>
                                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                                    {editingBranch ? 'Сохранить изменения' : 'Создать филиал'}
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {branches?.map((branch: any) => (
                        <div key={branch.id} className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 hover:bg-card/80 transition-all hover:shadow-lg flex flex-col">
                            <div className="p-6 flex-1">
                                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-4">
                                    <Building2 className="h-6 w-6" />
                                </div>

                                <h3 className="text-xl font-bold mb-1">{branch.name}</h3>
                                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-4">
                                    <MapPin className="h-3 w-3" /> {branch.city}
                                </div>

                                <div className="space-y-2 text-sm border-t border-border/50 pt-4">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Адрес:</span>
                                        <span className="font-medium text-right">{branch.address || '—'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Телефон:</span>
                                        <span className="font-medium text-right">{branch.phone || '—'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-black/20 border-t border-white/5 flex gap-3">
                                <Button
                                    variant="outline"
                                    className="flex-1 hover:bg-primary/10 hover:text-primary hover:border-primary/20"
                                    onClick={() => handleEdit(branch)}
                                >
                                    <Pencil className="h-4 w-4 mr-2" /> Редактировать
                                </Button>
                                {accessLevel >= 100 && (
                                    <Button
                                        variant="outline"
                                        className="flex-1 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 text-destructive"
                                        onClick={() => setDeleteId(branch.id)}
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" /> Удалить
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Удалить филиал?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Это действие нельзя отменить. Все данные филиала будут удалены.
                                Если к филиалу привязаны сотрудники, удаление может быть невозможно.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                                className="bg-destructive hover:bg-destructive/90 text-white shadow-md border-0"
                            >
                                Удалить
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </MainLayout>
    );
}
