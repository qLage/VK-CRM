import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Globe, KeyRound, CheckCircle2, AlertTriangle, Loader2, Power, Trash2, Save, ExternalLink, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AvitoCredsResponse {
  configured: boolean;
  client_id?: string;
  client_secret_masked?: string | null;
  user_id?: string | null;
  enabled?: boolean;
  last_sync_at?: string | null;
  last_error?: string | null;
  token_expires_at?: string | null;
  feed_url?: string | null;
  total_in_feed?: number;
}

export function AvitoSettings() {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [editing, setEditing] = useState(false);

  const { data: creds, isLoading } = useQuery<AvitoCredsResponse>({
    queryKey: ['avito-credentials'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/avito/credentials');
      if (error) throw error;
      return data;
    },
  });

  const saveMut = useMutation({
    mutationFn: async ({ client_id, client_secret }: { client_id: string; client_secret: string }) => {
      const { error } = await localAPI.request('/avito/credentials', { method: 'PUT', body: { client_id, client_secret } });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Ключи сохранены');
      setEditing(false);
      setClientId(''); setClientSecret('');
      queryClient.invalidateQueries({ queryKey: ['avito-credentials'] });
    },
    onError: () => toast.error('Ошибка сохранения'),
  });

  const testMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await localAPI.request('/avito/test', { method: 'POST' });
      if (error) throw error;
      return data as { ok: boolean; user_id?: string; error?: string };
    },
    onSuccess: (res) => {
      if (res.ok) toast.success(`Подключение работает${res.user_id ? ` (User ID: ${res.user_id})` : ''}`);
      else toast.error(`Ошибка подключения: ${res.error}`);
      queryClient.invalidateQueries({ queryKey: ['avito-credentials'] });
    },
    onError: () => toast.error('Не удалось проверить подключение'),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      const { error } = await localAPI.request('/avito/credentials', { method: 'DELETE' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Интеграция отключена');
      queryClient.invalidateQueries({ queryKey: ['avito-credentials'] });
    },
    onError: () => toast.error('Ошибка'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-white/30" />
      </div>
    );
  }

  const showForm = !creds?.configured || editing;
  const tokenValid = creds?.token_expires_at && new Date(creds.token_expires_at) > new Date();

  return (
    <div className="space-y-6">
      {/* Status card */}
      <div className="p-5 md:p-6 lg:p-8 rounded-xl md:rounded-2xl lg:rounded-[2.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 relative overflow-hidden shadow-2xl">
        <div className={cn("absolute -top-32 -right-32 w-64 h-64 blur-[100px] rounded-full transition-all duration-1000",
          creds?.configured ? "bg-emerald-500/10" : "bg-zinc-500/10")} />

        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-3 md:gap-4">
              <div className={cn("p-3 md:p-4 rounded-xl md:rounded-2xl border shadow-2xl",
                creds?.configured ? "bg-emerald-500/10 border-emerald-500/20" : "bg-zinc-500/10 border-white/5")}>
                <Globe className={cn("h-5 w-5 md:h-6 md:w-6", creds?.configured ? "text-emerald-400" : "text-white/40")} />
              </div>
              <div>
                <h3 className="font-black text-lg md:text-xl uppercase tracking-tight text-white">AVITO REALTY API</h3>
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-0.5">
                  Автоматическая публикация объектов
                </p>
              </div>
            </div>

            <div className={cn("px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5",
              creds?.configured
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                : "bg-zinc-500/10 border-white/10 text-white/50")}>
              {creds?.configured ? <CheckCircle2 className="h-3 w-3" /> : <Power className="h-3 w-3" />}
              {creds?.configured ? 'Настроено' : 'Не настроено'}
            </div>
          </div>

          {/* Status grid */}
          {creds?.configured && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Client ID</p>
                <p className="text-sm text-white font-mono truncate">{creds.client_id}</p>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Client Secret</p>
                <p className="text-sm text-white font-mono truncate">{creds.client_secret_masked || '—'}</p>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Avito User ID</p>
                <p className="text-sm text-white font-mono truncate">{creds.user_id || 'Не определён'}</p>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">OAuth токен</p>
                <p className={cn("text-sm font-mono truncate", tokenValid ? "text-emerald-400" : "text-white/40")}>
                  {tokenValid ? `Действителен до ${new Date(creds.token_expires_at!).toLocaleString('ru-RU')}` : 'Будет получен при первом запросе'}
                </p>
              </div>
              {creds.feed_url && (
                <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 sm:col-span-2">
                  <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Feed URL (для загрузки по ссылке в Avito)</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-indigo-300 font-mono truncate flex-1">{creds.feed_url}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg border-white/10 text-[9px] font-black uppercase tracking-widest h-7 px-2 flex-shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(creds.feed_url!);
                        toast.success('Feed URL скопирован');
                      }}
                    >
                      Копировать
                    </Button>
                  </div>
                  {typeof creds.total_in_feed === 'number' && (
                    <p className="text-[10px] text-white/40 mt-1.5">Объектов в фиде: <span className="text-white/70 font-bold">{creds.total_in_feed}</span></p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Last error */}
          {creds?.last_error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-5 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-black text-red-300/70 uppercase tracking-widest mb-1">Последняя ошибка</p>
                <p className="text-xs text-red-200 break-words">{creds.last_error}</p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {creds?.configured && !editing && (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => testMut.mutate()}
                disabled={testMut.isPending}
                variant="outline"
                size="sm"
                className="rounded-xl border-white/10 gap-1.5 text-[10px] font-black uppercase tracking-widest"
              >
                {testMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Проверить подключение
              </Button>
              <Button
                onClick={() => { setEditing(true); setClientId(creds.client_id || ''); }}
                variant="outline"
                size="sm"
                className="rounded-xl border-white/10 gap-1.5 text-[10px] font-black uppercase tracking-widest"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Изменить ключи
              </Button>
              <Button
                onClick={() => { if (confirm('Удалить интеграцию с Avito?')) deleteMut.mutate(); }}
                disabled={deleteMut.isPending}
                variant="outline"
                size="sm"
                className="rounded-xl border-red-500/30 text-red-300 hover:bg-red-500/10 gap-1.5 text-[10px] font-black uppercase tracking-widest"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Удалить
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="p-5 md:p-6 lg:p-8 rounded-xl md:rounded-2xl lg:rounded-[2.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 shadow-2xl">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/10">
              <KeyRound className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-black uppercase tracking-tight text-white">
                {creds?.configured ? 'Обновление ключей' : 'Подключение Avito'}
              </h3>
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-0.5">
                Получить ключи: <a href="https://www.avito.ru/professionals/api" target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">avito.ru/professionals/api <ExternalLink className="h-2.5 w-2.5" /></a>
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Client ID</label>
              <Input
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                placeholder="NSHGunW6FsAslY0TXPsn"
                className="h-11 rounded-xl bg-zinc-900/60 border-white/5 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2 block">Client Secret</label>
              <Input
                type="password"
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder="••••••••••••••••"
                className="h-11 rounded-xl bg-zinc-900/60 border-white/5 font-mono"
              />
            </div>

            <div className="flex gap-2 pt-2">
              {editing && (
                <Button
                  variant="outline"
                  onClick={() => { setEditing(false); setClientId(''); setClientSecret(''); }}
                  className="rounded-xl border-white/10 text-white/70"
                >
                  Отмена
                </Button>
              )}
              <Button
                onClick={() => saveMut.mutate({ client_id: clientId.trim(), client_secret: clientSecret.trim() })}
                disabled={!clientId.trim() || !clientSecret.trim() || saveMut.isPending}
                className="rounded-xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[10px] gap-1.5 flex-1 shadow-lg shadow-primary/20"
              >
                {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Сохранить ключи
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Help block */}
      <div className="p-5 rounded-xl md:rounded-2xl bg-blue-500/5 border border-blue-500/10">
        <div className="flex gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 flex-shrink-0 h-fit">
            <AlertTriangle className="h-4 w-4 text-blue-300" />
          </div>
          <div className="space-y-2 text-xs text-white/70 leading-relaxed">
            <p className="font-bold text-white">Как это работает</p>
            <ol className="list-decimal list-inside space-y-1.5 text-white/60">
              <li>Сотрудник создаёт объект → отправляет на одобрение руководителю</li>
              <li>После одобрения сотрудник нажимает «На Avito» → запрос идёт коммерческому/директору</li>
              <li>Коммерческий/директор подтверждает публикацию → объявление улетает в Avito Realty API</li>
              <li>Объект получает статус <span className="text-indigo-300 font-bold">Опубликован на Avito</span> и ссылку</li>
            </ol>
            <p className="text-[10px] text-white/40 pt-2 border-t border-white/5">
              Прямая публикация через API требует одобренного доступа к Avito Realty API в личном кабинете агентства.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
