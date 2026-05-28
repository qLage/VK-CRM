import { useState, useRef } from 'react';
import { Upload, Paperclip, X, FileText, Image, Download, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, React.ReactNode> = {
    image: <Image className="h-4 w-4 text-blue-400" />,
    pdf: <FileText className="h-4 w-4 text-red-400" />,
    doc: <FileText className="h-4 w-4 text-blue-500" />,
};

function getIcon(name: string) {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return ICON_MAP.image;
    if (ext === 'pdf') return ICON_MAP.pdf;
    return ICON_MAP.doc;
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface Props {
    requestId: string;
    canDelete?: boolean;
}

export function ServiceRequestAttachments({ requestId, canDelete = false }: Props) {
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const { data: attachments = [], isLoading } = useQuery({
        queryKey: ['sr-attachments', requestId],
        queryFn: async () => {
            const { data } = await localAPI.request(`/service-requests/${requestId}/attachments`);
            return data || [];
        },
        enabled: !!requestId,
    });

    const uploadMutation = useMutation({
        mutationFn: async (file: File) => {
            const formData = new FormData();
            formData.append('file', file);
            const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:5000/api');
            const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
            const response = await fetch(
                `${API_URL}/service-requests/${requestId}/attachments`,
                {
                    method: 'POST',
                    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                    body: formData,
                }
            );
            if (!response.ok) throw new Error('Ошибка загрузки');
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sr-attachments', requestId] });
            toast.success('Файл прикреплён');
        },
        onError: (e: any) => toast.error(e.message || 'Ошибка при загрузке'),
    });

    const deleteMutation = useMutation({
        mutationFn: async (attId: string) => {
            const { error } = await localAPI.request(`/service-requests/${requestId}/attachments/${attId}`, { method: 'DELETE' });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sr-attachments', requestId] });
            toast.success('Файл удалён');
        },
    });

    const handleFiles = (files: FileList | null) => {
        if (!files) return;
        Array.from(files).forEach(f => uploadMutation.mutate(f));
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
    };

    return (
        <div className="space-y-3">
            {/* Drop Zone */}
            <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                    'border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all select-none',
                    isDragging
                        ? 'border-primary bg-primary/10'
                        : 'border-white/10 hover:border-white/30 hover:bg-white/5'
                )}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={e => handleFiles(e.target.files)}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.zip"
                    aria-label="Добавить вложения"
                    title="Добавить вложения"
                />
                <Upload className={cn('h-5 w-5 mx-auto mb-1 transition-colors', isDragging ? 'text-primary' : 'text-zinc-500')} />
                <p className="text-xs text-zinc-500">
                    {uploadMutation.isPending ? 'Загрузка...' : 'Перетащите файлы или нажмите (до 20 МБ)'}
                </p>
            </div>

            {/* Files List */}
            {isLoading ? (
                <div className="text-xs text-zinc-600 text-center">Загрузка...</div>
            ) : attachments.length > 0 ? (
                <div className="space-y-1.5">
                    {attachments.map((att: any) => (
                        <div
                            key={att.id}
                            className="flex items-center gap-3 p-2.5 rounded-lg bg-white/5 border border-white/5 group"
                        >
                            {getIcon(att.file_name)}
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-zinc-300 truncate">{att.file_name}</p>
                                <p className="text-[10px] text-zinc-600">{formatBytes(att.file_size || 0)}</p>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <a
                                    href={`${import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000')}${att.file_url}`}
                                    download={att.file_name}
                                    onClick={e => e.stopPropagation()}
                                    className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                                    aria-label={`Скачать файл ${att.file_name}`}
                                    title={`Скачать файл ${att.file_name}`}
                                >
                                    <Download className="h-3.5 w-3.5" />
                                </a>
                                {canDelete && (
                                    <button
                                        type="button"
                                        onClick={() => deleteMutation.mutate(att.id)}
                                        className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                        aria-label={`Удалить файл ${att.file_name}`}
                                        title={`Удалить файл ${att.file_name}`}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-xs text-zinc-600 text-center flex items-center justify-center gap-1">
                    <Paperclip className="h-3 w-3" />
                    Нет вложений
                </p>
            )}
        </div>
    );
}
