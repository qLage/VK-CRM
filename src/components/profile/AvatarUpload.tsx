import { useState, useRef, useEffect } from 'react';
import { Camera, Loader2, X, Edit2, Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { localAPI } from '@/integrations/localAPI';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

interface AvatarUploadProps {
  userId: string;
  currentAvatarUrl: string | null;
  initials: string;
  onAvatarChange: (url: string | null) => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'h-12 w-12',
  md: 'h-16 w-16',
  lg: 'h-24 w-24',
  xl: 'h-28 w-28 md:h-40 md:w-40 lg:h-56 lg:w-56', // Responsive sizing for mobile
};

export function AvatarUpload({
  userId,
  currentAvatarUrl,
  initials,
  onAvatarChange,
  size = 'lg',
  className
}: AvatarUploadProps) {
  const getFullUrl = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('data:')) return url;

    // Add backend base URL for relative upload paths
    const baseUrl = import.meta.env.PROD
      ? ''
      : (import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000');
    // Cache-bust by appending a version param so the new avatar shows up immediately
    // (server now uses must-revalidate + ETag, but old SW/CDN copies may be cached).
    const sep = url.includes('?') ? '&' : '?';
    const v = Date.now();
    return `${baseUrl}${url}${sep}v=${v}`;
  };

  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(getFullUrl(currentAvatarUrl));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dialogPreviewUrl, setDialogPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    setPreviewUrl(getFullUrl(currentAvatarUrl));
  }, [currentAvatarUrl]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Пожалуйста, выберите изображение');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Размер файла не должен превышать 5 МБ');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setDialogPreviewUrl(objectUrl);
    setIsDialogOpen(true);
  };

  const confirmUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('avatar', selectedFile);

      const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:5000/api');
      const response = await fetch(`${API_URL}/profiles/avatar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: formData,
        credentials: 'include'
      });

      const result = await response.json();
      if (!response.ok) {
        const errMsg = (result?.error?.message || result?.error || result?.message || `HTTP ${response.status}`);
        throw new Error(typeof errMsg === 'string' ? errMsg : 'Ошибка загрузки');
      }

      // Server now ALWAYS returns a path-based URL like "/api/profiles/<id>/avatar?v=<ts>"
      // (or a data: URL only as a last-resort fallback).
      // We strip any existing version param and append a fresh one to defeat browser/SW cache.
      const serverUrl: string = result.avatar_url || `/api/profiles/${userId}/avatar`;
      let newUrl: string;
      if (serverUrl.startsWith('data:')) {
        newUrl = serverUrl;
      } else {
        const baseUrl = import.meta.env.PROD
          ? ''
          : (import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000');
        const pathOnly = serverUrl.split('?')[0];
        newUrl = `${baseUrl}${pathOnly}?v=${Date.now()}`;
      }
      setPreviewUrl(newUrl);
      await onAvatarChange(serverUrl);

      // Инвалидируем все кэши, в которых может фигурировать аватар этого пользователя
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey[0];
          const keys = [
            'employees', 'employee', 'profile', 'profiles',
            'team-members', 'properties', 'property-detail',
            'service-requests', 'reports',
          ];
          return keys.includes(key as string);
        },
      });

      // Принудительно меняем src у всех <img>, ссылающихся на этот аватар,
      // чтобы они моментально подтянули свежую картинку (минуя SW/CDN-кэш).
      try {
        const imgs = document.querySelectorAll<HTMLImageElement>('img');
        const ver = Date.now();
        imgs.forEach((img) => {
          const src = img.getAttribute('src') || '';
          if (src.includes(`/api/profiles/${userId}/avatar`)) {
            const base = src.split('?')[0];
            img.setAttribute('src', `${base}?v=${ver}`);
          }
        });
      } catch {}

      toast.success('Аватар обновлён');
      setIsDialogOpen(false);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Ошибка загрузки аватара');
    } finally {
      setUploading(false);
      setSelectedFile(null);
      if (dialogPreviewUrl) URL.revokeObjectURL(dialogPreviewUrl);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className={cn("relative group flex items-center justify-center", className)}>
      <div className="relative">
        <Avatar className={cn(sizeClasses[size], "border-4 border-zinc-950 shadow-2xl ring-1 ring-white/10 overflow-hidden")}>
          {previewUrl ? (
            <AvatarImage src={previewUrl} alt="Avatar" className="object-cover w-full h-full" />
          ) : null}
          <AvatarFallback className="bg-gradient-to-br from-zinc-800 to-zinc-950 text-white/10 font-black text-xl md:text-2xl lg:text-4xl flex items-center justify-center">
            {initials}
          </AvatarFallback>
        </Avatar>

        {/* PERFECTLY CENTERED OVERLAY */}
        <div
          className={cn(
            'absolute inset-0 rounded-full bg-black/50 backdrop-blur-[2px] flex items-center justify-center transition-all duration-300 opacity-0 group-hover:opacity-100 cursor-pointer z-30',
            uploading && 'opacity-100 bg-black/60'
          )}
          onClick={(e) => {
            e.preventDefault();
            if (!uploading) fileInputRef.current?.click();
          }}
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-white shadow-xl" />
          ) : (
            <div className="flex flex-col items-center justify-center p-2 text-white">
              <div className="bg-white/10 p-3 rounded-full mb-1 group-hover:scale-110 transition-transform shadow-2xl">
                <Edit2 className="h-6 w-6 text-white drop-shadow-xl" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-90 drop-shadow-md">Обновить</span>
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        if (!open && !uploading) {
          setIsDialogOpen(false);
          if (dialogPreviewUrl) URL.revokeObjectURL(dialogPreviewUrl);
          setSelectedFile(null);
        }
      }}>
        <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden rounded-[2.5rem] shadow-2xl">
          <DialogHeader className="p-8 pb-0">
            <DialogTitle className="text-2xl font-black text-white">Новый аватар</DialogTitle>
            <DialogDescription className="text-white/40 font-bold uppercase text-[10px] tracking-widest mt-1">
              Предпросмотр перед сохранением
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center py-10">
            <div className="relative w-56 h-56 rounded-full overflow-hidden border-8 border-zinc-900 shadow-2xl ring-1 ring-white/10">
              {dialogPreviewUrl && (
                <img
                  src={dialogPreviewUrl}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          </div>

          <DialogFooter className="p-8 pt-0 flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={uploading}
              className="flex-1 bg-white/5 border-white/5 hover:bg-white/10 text-white rounded-2xl h-12 font-bold"
            >
              Отмена
            </Button>
            <Button
              type="button"
              onClick={confirmUpload}
              disabled={uploading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl h-12 font-black shadow-lg shadow-indigo-500/20"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5 mr-3" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
