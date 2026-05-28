import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatPhoneRu } from '@/lib/phone-utils';

export function ClientSearchInput({
  value,
  onChange,
  suggestions,
  onSelect,
  inputCls,
  placeholder = 'Поиск клиента по ФИО или телефону...',
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: { id: string; full_name: string; phone: string; status: string }[];
  onSelect: (c: { id: string; full_name: string; phone: string }) => void;
  inputCls?: string;
  placeholder?: string;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => {
          if (suggestions.length) setShowDropdown(true);
        }}
        placeholder={placeholder}
        className={inputCls}
      />
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-[200px] overflow-y-auto">
          {suggestions.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={() => {
                onSelect(c);
                setShowDropdown(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors flex items-center justify-between"
            >
              <span>{c.full_name}</span>
              <span className="text-[10px] text-white/40">{c.phone || ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ClientCreateInlineMini({
  defaultName,
  onSave,
  inputCls,
}: {
  defaultName: string;
  onSave: (data: { full_name: string; phone: string; birthday?: string; comment?: string }) => void;
  inputCls?: string;
}) {
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [comment, setComment] = useState('');

  const handlePhoneChange = (val: string) => {
    setPhone(formatPhoneRu(val));
  };

  return (
    <div className="p-3 rounded-xl bg-zinc-900/80 border border-white/5 space-y-3">
      <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Создать нового клиента</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[9px] text-white/30 uppercase tracking-widest">ФИО</label>
          <Input value={defaultName} disabled className={cn(inputCls, 'mt-1 opacity-70 normal-case tracking-normal')} />
        </div>
        <div>
          <label className="text-[9px] text-white/30 uppercase tracking-widest">Телефон</label>
          <Input
            value={phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder="+7 (999) 123-45-67"
            inputMode="tel"
            type="tel"
            className={cn(inputCls, 'mt-1 normal-case font-medium tracking-normal')}
          />
        </div>
        <div>
          <label className="text-[9px] text-white/30 uppercase tracking-widest">Дата рождения</label>
          <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className={cn(inputCls, 'mt-1')} />
        </div>
        <div>
          <label className="text-[9px] text-white/30 uppercase tracking-widest">Комментарий</label>
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Заметка..." className={cn(inputCls, 'mt-1')} />
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onSave({ full_name: defaultName, phone, birthday: birthday || undefined, comment: comment || undefined })}
        className="text-[9px] uppercase tracking-widest"
      >
        Подтвердить
      </Button>
    </div>
  );
}
