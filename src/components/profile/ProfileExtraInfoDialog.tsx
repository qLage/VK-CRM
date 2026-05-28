import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { localAPI } from '@/integrations/localAPI';
import { FileText, Loader2, Phone, Trash2, UserPlus } from 'lucide-react';
import { formatPhoneRu, normalizePhone } from '@/lib/phone-utils';
import { formatPassportSeriesNumberRu } from '@/lib/passport-utils';
import { INPUT_WITH_LEADING_ICON } from '@/lib/inputClassNames';
import { cn } from '@/lib/utils';

export type EmergencyRelation = 'relative' | 'friend' | 'acquaintance';

export type EmergencyContactRow = {
  fullName: string;
  phone: string;
  relation: EmergencyRelation;
};

const RELATION_LABELS: Record<EmergencyRelation, string> = {
  relative: 'Родственник',
  friend: 'Друг',
  acquaintance: 'Знакомый',
};

const profileInputLeadingIconClasses = cn(
  INPUT_WITH_LEADING_ICON,
  'bg-white/5 border-white/10 focus:border-emerald-500/50 transition-colors',
);

function parseContacts(raw: unknown): EmergencyContactRow[] {
  if (raw == null) return [];
  let arr: any[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      arr = Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  const allowed = new Set<EmergencyRelation>(['relative', 'friend', 'acquaintance']);
  return arr.map((c) => {
    const rel = allowed.has(c?.relation) ? c.relation : 'relative';
    const phoneRaw = c?.phone;
    return {
      fullName: String(c?.fullName || ''),
      phone: phoneRaw ? formatPhoneRu(String(phoneRaw)) : '',
      relation: rel,
    };
  });
}

export function summarizeProfileExtraInfo(employee: {
  passport_series_number?: string | null;
  extra_phone?: string | null;
  emergency_contacts?: unknown;
  passport_address?: string | null;
  residential_address?: string | null;
}): string {
  const hasPassport = !!String(employee.passport_series_number || '').trim();
  const hasExtraPhone = !!String(employee.extra_phone || '').trim();
  const contacts = parseContacts(employee.emergency_contacts).filter((c) => c.fullName.trim() || normalizePhone(c.phone));
  const hasAddr =
    !!String(employee.passport_address || '').trim() || !!String(employee.residential_address || '').trim();
  const n = [hasPassport, hasExtraPhone, contacts.length > 0, hasAddr].filter(Boolean).length;
  if (n === 0) return '—';
  const parts: string[] = [];
  if (hasPassport) parts.push('паспорт');
  if (hasExtraPhone) parts.push('доп. тел.');
  if (contacts.length) parts.push(`${contacts.length} конт.`);
  if (hasAddr) parts.push('адреса');
  return parts.join(' · ');
}

export type ProfileExtraInfoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  canEdit: boolean;
  /** Applied when the dialog opens (`open` becomes true). View = read-only presentation. */
  defaultMode?: 'view' | 'edit';
  initial: {
    passport_series_number?: string | null;
    extra_phone?: string | null;
    emergency_contacts?: unknown;
    passport_address?: string | null;
    residential_address?: string | null;
  };
  onSaved?: () => void;
};

export function ProfileExtraInfoDialog({
  open,
  onOpenChange,
  employeeId,
  canEdit,
  defaultMode = 'edit',
  initial,
  onSaved,
}: ProfileExtraInfoDialogProps) {
  const [loading, setLoading] = useState(false);
  const [passport, setPassport] = useState('');
  const [extraPhone, setExtraPhone] = useState('');
  const [passportAddress, setPassportAddress] = useState('');
  const [residentialAddress, setResidentialAddress] = useState('');
  const [contacts, setContacts] = useState<EmergencyContactRow[]>([]);

  const fieldsEditable = canEdit && defaultMode === 'edit';

  useEffect(() => {
    if (!open) return;
    setPassport(formatPassportSeriesNumberRu(String(initial.passport_series_number || '')));
    setExtraPhone(initial.extra_phone ? formatPhoneRu(String(initial.extra_phone)) : '');
    setPassportAddress(initial.passport_address || '');
    setResidentialAddress(initial.residential_address || '');
    const parsed = parseContacts(initial.emergency_contacts);
    setContacts(parsed.length ? parsed : []);
  }, [open, initial]);

  const handleAddContact = () => {
    setContacts((prev) => [...prev, { fullName: '', phone: '', relation: 'relative' }]);
  };

  const handleRemoveContact = (index: number) => {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldsEditable) return;
    setLoading(true);
    try {
      const emergency_contacts = contacts
        .filter((c) => c.fullName.trim() || normalizePhone(c.phone))
        .map((c) => ({
          fullName: c.fullName.trim(),
          phone: c.phone,
          relation: c.relation,
        }));

      const { error } = await localAPI.request(`/employees/${employeeId}`, {
        method: 'PATCH',
        body: {
          passport_series_number: passport.trim() || null,
          extra_phone: extraPhone.trim() || null,
          emergency_contacts,
          passport_address: passportAddress.trim() || null,
          residential_address: residentialAddress.trim() || null,
        },
      });
      if (error) throw error;
      toast.success('Доп. сведения сохранены');
      onOpenChange(false);
      onSaved?.();
    } catch (err: any) {
      toast.error(err?.message || 'Не удалось сохранить');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,900px)] flex-col overflow-hidden bg-zinc-900 border-white/10 p-0 text-white z-[200] md:[--dialog-content-max-width:56rem]">
        <DialogHeader className="shrink-0 space-y-1.5 px-6 pb-2 pt-6 pr-14 text-left">
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileText className="h-5 w-5 text-emerald-500" aria-hidden />
            Доп. сведения
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-1 scrollbar-hide">
          <div className="space-y-2">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">
              Серия и номер паспорта
            </Label>
            <Input
              value={passport}
              onChange={(e) => setPassport(formatPassportSeriesNumberRu(e.target.value))}
              readOnly={!fieldsEditable}
              placeholder="12 34 567890"
              className="h-11 rounded-xl bg-zinc-900/60 border-white/10 font-medium tracking-wide normal-case"
              inputMode="numeric"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">Доп номер</Label>
            <div className="relative">
              <Phone
                className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-70"
                aria-hidden
              />
              <Input
                value={extraPhone}
                onChange={(e) => setExtraPhone(formatPhoneRu(e.target.value))}
                readOnly={!fieldsEditable}
                placeholder="+7 (999) 123-45-67"
                className={cn(profileInputLeadingIconClasses, 'normal-case font-medium tracking-normal')}
                inputMode="tel"
                type="tel"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">
                Номера близких
              </Label>
              {fieldsEditable && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg border-white/10 bg-white/5 text-[10px] font-black uppercase tracking-wider"
                  onClick={handleAddContact}
                >
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  Добавить номер близкого
                </Button>
              )}
            </div>
            <div className="min-w-0 space-y-3">
              {contacts.length === 0 && (
                <p className="text-xs text-white/35 font-bold normal-case">Контакты не добавлены</p>
              )}
              {contacts.map((row, index) => (
                <div
                  key={index}
                  className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3 md:grid-cols-12 md:items-end md:gap-x-3 md:gap-y-2"
                >
                  <div className="min-w-0 space-y-1.5 md:col-span-4">
                    <Label className="text-[9px] text-white/35 uppercase tracking-widest font-black">ФИО</Label>
                    <Input
                      value={row.fullName}
                      onChange={(e) =>
                        setContacts((prev) =>
                          prev.map((r, i) => (i === index ? { ...r, fullName: e.target.value } : r)),
                        )
                      }
                      readOnly={!fieldsEditable}
                      placeholder="Иванов Иван Иванович"
                      className="h-11 rounded-xl bg-zinc-900/60 border-white/10 normal-case"
                    />
                  </div>
                  <div className="min-w-0 space-y-1.5 md:col-span-4">
                    <Label className="text-[9px] text-white/35 uppercase tracking-widest font-black">Номер</Label>
                    <Input
                      value={row.phone}
                      onChange={(e) =>
                        setContacts((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, phone: formatPhoneRu(e.target.value) } : r,
                          ),
                        )
                      }
                      readOnly={!fieldsEditable}
                      placeholder="+7 (999) 123-45-67"
                      className="h-11 rounded-xl bg-zinc-900/60 border-white/10 normal-case font-medium tracking-normal"
                      inputMode="tel"
                      type="tel"
                    />
                  </div>
                  <div className="min-w-0 space-y-1.5 md:col-span-3">
                    <Label className="text-[9px] text-white/35 uppercase tracking-widest font-black">Связь</Label>
                    <Select
                      value={row.relation}
                      onValueChange={(v) =>
                        setContacts((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, relation: v as EmergencyRelation } : r,
                          ),
                        )
                      }
                      disabled={!fieldsEditable}
                    >
                      <SelectTrigger className="h-11 w-full min-w-0 shrink-0 rounded-xl bg-zinc-900/60 border-white/10 text-[10px] font-black uppercase tracking-wider [&>span]:line-clamp-1 [&>span]:min-h-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        collisionPadding={12}
                        className="z-[210] bg-zinc-900 border-white/10 text-white shadow-2xl"
                      >
                        {(Object.keys(RELATION_LABELS) as EmergencyRelation[]).map((k) => (
                          <SelectItem key={k} value={k} className="text-xs font-bold">
                            {RELATION_LABELS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {fieldsEditable && (
                    <div className="flex w-11 shrink-0 items-end justify-end justify-self-end md:col-span-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 shrink-0 self-end rounded-xl text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                        onClick={() => handleRemoveContact(index)}
                        aria-label="Удалить контакт"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">
              Адрес проживания по паспорту
            </Label>
            <Input
              value={passportAddress}
              onChange={(e) => setPassportAddress(e.target.value)}
              readOnly={!fieldsEditable}
              placeholder="Индекс, регион, город, улица, дом, кв."
              className="h-11 rounded-xl bg-zinc-900/60 border-white/10 text-sm font-medium normal-case"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">
              Фактический адрес проживания
            </Label>
            <Input
              value={residentialAddress}
              onChange={(e) => setResidentialAddress(e.target.value)}
              readOnly={!fieldsEditable}
              placeholder="Если отличается от паспортного — укажите полностью"
              className="h-11 rounded-xl bg-zinc-900/60 border-white/10 text-sm font-medium normal-case"
            />
          </div>

          </div>
          <div className="flex shrink-0 gap-3 border-t border-white/5 bg-zinc-900 px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              className="flex-1 border border-white/10 hover:bg-white/5 text-white"
              onClick={() => onOpenChange(false)}
            >
              {fieldsEditable ? 'Отмена' : 'Закрыть'}
            </Button>
            {fieldsEditable && (
              <Button
                type="submit"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 font-black uppercase tracking-wider text-xs"
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Сохранить'}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
