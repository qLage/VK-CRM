import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { localAPI } from '@/integrations/localAPI';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, User, Mail, Phone, Lock, KeyRound } from 'lucide-react';
import { formatPhoneRu } from '@/lib/phone-utils';
import { INPUT_WITH_LEADING_ICON } from '@/lib/inputClassNames';
import { cn } from '@/lib/utils';

const MIN_PASSWORD_LENGTH = 6;

const profileInputLeadingIconClasses = cn(
    INPUT_WITH_LEADING_ICON,
    'bg-white/5 border-white/10 focus:border-emerald-500/50 transition-colors',
);

interface ProfileSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ProfileSettingsDialog({ open, onOpenChange }: ProfileSettingsDialogProps) {
    const { profile, refreshProfile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordFields, setPasswordFields] = useState({ newPassword: '', confirmPassword: '' });
    const [formData, setFormData] = useState({
        lastName: '',
        firstName: '',
        middleName: '',
        email: profile?.email || '',
        phone: profile?.phone ? formatPhoneRu(profile.phone) : '',
    });

    const splitName = (fullName: string) => {
        const parts = (fullName || '').trim().split(/\s+/);
        return {
            lastName: parts[0] || '',
            firstName: parts[1] || '',
            middleName: parts.slice(2).join(' ') || '',
        };
    };

    const resetPasswordFields = () => setPasswordFields({ newPassword: '', confirmPassword: '' });

    const handlePasswordOpenChange = (next: boolean) => {
        setPasswordOpen(next);
        if (!next) resetPasswordFields();
    };

    // Sync form data when dialog opens or profile changes
    useEffect(() => {
        if (open && profile) {
            const nameParts = splitName(profile.full_name || '');
            setFormData({
                lastName: nameParts.lastName,
                firstName: nameParts.firstName,
                middleName: nameParts.middleName,
                email: profile.email || '',
                phone: profile.phone ? formatPhoneRu(profile.phone) : '',
            });
        }
    }, [open, profile]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const fullName = `${formData.lastName} ${formData.firstName} ${formData.middleName}`.trim();
            const { error: profileError } = await localAPI.request(`/employees/${profile?.id}`, {
                method: 'PATCH',
                body: {
                    full_name: fullName,
                    phone: formData.phone,
                    email: formData.email || null,
                },
            });

            if (profileError) throw profileError;

            await refreshProfile();
            toast.success('Настройки сохранены');
            onOpenChange(false);
        } catch (error: any) {
            toast.error(error.message || 'Ошибка при сохранении');
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const password = passwordFields.newPassword.trim();
        const confirm = passwordFields.confirmPassword.trim();

        if (!password || !confirm) {
            toast.error('Заполните оба поля пароля');
            return;
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
            toast.error('Пароль должен быть не менее 6 символов');
            return;
        }
        if (password !== confirm) {
            toast.error('Пароли не совпадают');
            return;
        }

        setPasswordLoading(true);
        try {
            const { error } = await localAPI.request(`/users/${profile?.id}/password`, {
                method: 'PATCH',
                body: { password },
            });
            if (error) throw error;
            toast.success('Пароль изменён');
            handlePasswordOpenChange(false);
        } catch (error: any) {
            toast.error(error.message || 'Ошибка при смене пароля');
        } finally {
            setPasswordLoading(false);
        }
    };

    const outlineBarButtonClass =
        'w-full border-white/10 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-wider text-xs';

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[425px] bg-zinc-900 border-white/10 text-white z-[200]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-white">
                            <User className="h-5 w-5 text-emerald-500" />
                            Настройки профиля
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">Фамилия</Label>
                                <div className="relative">
                                    <User className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-70" aria-hidden />
                                    <Input
                                        value={formData.lastName}
                                        onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                                        className={profileInputLeadingIconClasses}
                                        placeholder="Иванов"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">Имя</Label>
                                <div className="relative">
                                    <User className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-70" aria-hidden />
                                    <Input
                                        value={formData.firstName}
                                        onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                                        className={profileInputLeadingIconClasses}
                                        placeholder="Иван"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">Отчество</Label>
                            <div className="relative">
                                <User className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-70" aria-hidden />
                                <Input
                                    value={formData.middleName}
                                    onChange={e => setFormData({ ...formData, middleName: e.target.value })}
                                    className={profileInputLeadingIconClasses}
                                    placeholder="Иванович"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">Телефон</Label>
                            <div className="relative">
                                <Phone className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-70" aria-hidden />
                                <Input
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: formatPhoneRu(e.target.value) })}
                                    className={profileInputLeadingIconClasses}
                                    placeholder="+7 (999) 999-99-99"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">Email</Label>
                            <div className="relative">
                                <Mail className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-70" aria-hidden />
                                <Input
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    className={profileInputLeadingIconClasses}
                                    placeholder="example@mail.com"
                                />
                            </div>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            className={outlineBarButtonClass}
                            onClick={() => setPasswordOpen(true)}
                        >
                            <KeyRound className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                            Сменить пароль
                        </Button>

                        <div className="pt-4 flex gap-3">
                            <Button type="button" variant="ghost" className="flex-1 border border-white/10 hover:bg-white/5 text-white" onClick={() => onOpenChange(false)}>
                                Отмена
                            </Button>
                            <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 font-black uppercase tracking-wider text-xs" disabled={loading}>
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Сохранить'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={passwordOpen} onOpenChange={handlePasswordOpenChange}>
                <DialogContent className="sm:max-w-[425px] bg-zinc-900 border-white/10 text-white z-[210]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-white">
                            <Lock className="h-5 w-5 text-emerald-500" />
                            Смена пароля
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handlePasswordSubmit} className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">Новый пароль</Label>
                            <div className="relative">
                                <Lock className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-70" aria-hidden />
                                <Input
                                    type="password"
                                    value={passwordFields.newPassword}
                                    onChange={e => setPasswordFields(f => ({ ...f, newPassword: e.target.value }))}
                                    className={profileInputLeadingIconClasses}
                                    placeholder="••••••••"
                                    autoComplete="new-password"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">Повторите пароль</Label>
                            <div className="relative">
                                <Lock className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-70" aria-hidden />
                                <Input
                                    type="password"
                                    value={passwordFields.confirmPassword}
                                    onChange={e => setPasswordFields(f => ({ ...f, confirmPassword: e.target.value }))}
                                    className={profileInputLeadingIconClasses}
                                    placeholder="••••••••"
                                    autoComplete="new-password"
                                />
                            </div>
                        </div>
                        <div className="pt-4 flex gap-3">
                            <Button type="button" variant="ghost" className="flex-1 border border-white/10 hover:bg-white/5 text-white" onClick={() => handlePasswordOpenChange(false)}>
                                Отмена
                            </Button>
                            <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 font-black uppercase tracking-wider text-xs" disabled={passwordLoading}>
                                {passwordLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Сохранить'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
