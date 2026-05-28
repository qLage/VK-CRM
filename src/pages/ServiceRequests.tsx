import { useState, memo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus, Check, X, Clock, AlertCircle, Search, Filter,
    ChevronDown, ChevronUp, FileText, Calendar, Paperclip, Trash2, Activity, Edit, Users, User, Target,
    Settings2, HandCoins, Home, ShieldCheck, Info, Phone, MapPin, DollarSign, MessageSquare, Hash, Type, Download,
    Building2
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { toast } from 'sonner';
import { useSharedData } from '@/hooks/useSharedData';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { parseUTCDate } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { INPUT_WITH_LEADING_ICON } from '@/lib/inputClassNames';
import { useAuth } from '@/hooks/useAuth';
import { TEMPLATES, REQUEST_TYPES, REQUEST_TYPE_LABELS } from '@/components/service-requests/constants';
import { usePaginatedServiceRequests, usePaginatedReports } from '@/hooks/useSharedData';
import { useServiceRequestConfig } from '@/components/service-requests/ServiceRequestSettings';
import { ServiceRequestAttachments } from '@/components/service-requests/ServiceRequestAttachments';
import type { FieldConfig } from '@/components/settings/FormBuilder';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper to get icon for field type
const getFieldIcon = (field: FieldConfig) => {
    const iconClass = "h-4 w-4 text-white/30";
    if (field.id?.includes('phone') || field.id?.includes('телефон')) return <Phone className={iconClass} />;
    if (field.id?.includes('address') || field.id?.includes('адрес')) return <MapPin className={iconClass} />;
    if (field.id?.includes('name') || field.id?.includes('имя') || field.id?.includes('фио')) return <User className={iconClass} />;
    if (field.id?.includes('date') || field.id?.includes('дата') || field.id?.includes('time') || field.id?.includes('время')) return <Calendar className={iconClass} />;
    if (field.id?.includes('sum') || field.id?.includes('сумм') || field.id?.includes('price') || field.id?.includes('стоимост') || field.id?.includes('commission') || field.id?.includes('комисс')) return <DollarSign className={iconClass} />;
    if (field.type === 'textarea') return <MessageSquare className={iconClass} />;
    if (field.type === 'number') return <Hash className={iconClass} />;
    return <Type className={iconClass} />;
};

const FieldInput = ({ field, value, onChange }: { field: FieldConfig, value: any, onChange: (val: any) => void }) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasValue = value !== undefined && value !== null && value !== '';

    if (field.type === 'textarea') {
        return (
            <div className="relative">
                <Textarea
                    placeholder={field.placeholder}
                    value={value || ''}
                    onChange={e => onChange(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    className={cn(
                        "bg-white/[0.03] border-white/10 rounded-2xl transition-all duration-300 min-h-[80px] resize-none text-base",
                        "focus:bg-white/[0.05] focus:border-primary/50 focus:shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]",
                        hasValue && "border-primary/30"
                    )}
                    rows={3}
                />
                {field.placeholder && (
                    <div className="absolute right-3 bottom-2 text-[9px] text-white/20 font-mono">
                        {(value || '').length} chars
                    </div>
                )}
            </div>
        );
    }
    if (field.type === 'select') {
        return (
            <Select value={value || ''} onValueChange={onChange}>
                <SelectTrigger className={cn(
                    "bg-white/[0.03] border-white/10 h-14 rounded-2xl transition-all duration-300 text-base",
                    "hover:bg-white/[0.05] hover:border-white/20 focus:border-primary/50",
                    hasValue && "border-primary/30 bg-white/[0.05]"
                )}>
                    <SelectValue placeholder="Выберите..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10 rounded-2xl p-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                    {field.options?.map((opt: string) => (
                        <SelectItem key={opt} value={opt} className="rounded-xl h-10 pr-4 focus:bg-white/10 mb-1 last:mb-0 transition-colors cursor-pointer">
                            {opt}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );
    }
    if (field.type === 'date' || field.type === 'datetime-local') {
        return (
            <Input
                type="date"
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                className={cn(
                    "bg-white/[0.03] border-white/10 h-14 rounded-2xl transition-all duration-300 text-base",
                    "focus:bg-white/[0.05] focus:border-primary/50 focus:shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]",
                    hasValue && "border-primary/30"
                )}
            />
        );
    }
    // Default text/number
    return (
        <Input
            type={field.type}
            placeholder={field.placeholder}
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={cn(
                "bg-white/[0.03] border-white/10 h-14 rounded-2xl transition-all duration-300 text-base",
                "focus:bg-white/[0.05] focus:border-primary/50 focus:shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]",
                hasValue && "border-primary/30"
            )}
        />
    );
};

function ServiceRequests() {
    const { user, accessLevel, canManageUsers } = useAuth();
    const queryClient = useQueryClient();
    const { types, templates } = useServiceRequestConfig();
    const { branches } = useSharedData();

    // We don't have enabledTypes anymore, we just have 'types' which are the enabled ones.
    // We need to map them to the format the UI expects if needed, or just use them.

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterType, setFilterType] = useState<string>('all');
    const [reportCategory, setReportCategory] = useState<string>('all_reports');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedType, setSelectedType] = useState<string>('deal');
    const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
    const [showTeamRequests, setShowTeamRequests] = useState(false);

    const [formData, setFormData] = useState<any>({});
    const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
    const [editingRequest, setEditingRequest] = useState<any | null>(null);
    const [editFormData, setEditFormData] = useState<any>({});
    const [rejectionReason, setRejectionReason] = useState('');
    const [requestToReject, setRequestToReject] = useState<{ id: string; kind: 'service_request' | 'report' } | null>(null);
    const [managerComment, setManagerComment] = useState('');
    const [requestToComment, setRequestToComment] = useState<{ id: string; kind: 'service_request' | 'report' } | null>(null);
    const observerTarget = useRef<HTMLDivElement>(null);
 
    // Fetch requests and reports using shared hooks
    // Fetch requests and reports using shared paginated hooks
    const {
        data: requestsPageData,
        isLoading: loadingRequests,
        fetchNextPage: fetchNextRequests,
        hasNextPage: hasNextRequests,
        isFetchingNextPage: fetchingRequests
    } = usePaginatedServiceRequests({ teamFilter: showTeamRequests });

    const {
        data: reportsPageData,
        isLoading: loadingReports,
        fetchNextPage: fetchNextReports,
        hasNextPage: hasNextReports,
        isFetchingNextPage: fetchingReports
    } = usePaginatedReports();

    const serviceRequests = requestsPageData?.pages.flatMap(p => p.data) || [];
    const reports = reportsPageData?.pages.flatMap(p => p.data) || [];

    // Combine service_requests and reports (for plan/daily types)
    // Normalize reports structure to match service_requests
    const normalizedReports = reports
        .filter((r: any) => ['plan', 'daily'].includes(r.type))
        .map((r: any) => ({
            ...r,
            author_name: r.user_name || r.author_name, // Map user_name to author_name
            description: r.title || '', // Use title as description
            priority: 'normal',
            data: r.content || {}, // Map content to data
        }));

    const allRequests = [
        ...serviceRequests,
        ...normalizedReports
    ].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const isLoading = loadingRequests || loadingReports;

    // Handle URL parameters for direct linking
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        if (id) {
            setExpandedRequest(id);
            // Small delay to ensure items are rendered before scrolling
            setTimeout(() => {
                const element = document.getElementById(`request-${id}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 500);
        }
    }, [allRequests.length]); // Re-run when list changes to ensure we find the element
 
    // Infinite Scroll Intersection Observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasNextRequests && !fetchingRequests) {
                    fetchNextRequests();
                }
            },
            { threshold: 0.1 }
        );
 
        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }
 
        return () => observer.disconnect();
    }, [hasNextRequests, fetchingRequests, fetchNextRequests]);

    const refreshLists = () => {
        // These pages use infinite queries from useSharedData.tsx
        // resetQueries clears cached pages so the list reliably refreshes from page 1.
        queryClient.resetQueries({ queryKey: ['paginated-service-requests'] });
        queryClient.resetQueries({ queryKey: ['paginated-reports'] });

        // Keep shared keys in sync for other parts of the app that might still use them.
        queryClient.invalidateQueries({ queryKey: ['shared-service-requests'] });
        queryClient.invalidateQueries({ queryKey: ['shared-reports'] });
        queryClient.invalidateQueries({ queryKey: ['shared-attendance'] });
    };

    const collapseAndFocusRequest = (requestId: string) => {
        setExpandedRequest((prev) => (prev === requestId ? null : prev));
        // Keep the user on the same card after status update.
        setTimeout(() => {
            const element = document.getElementById(`request-${requestId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 120);
    };

    const createMutation = useMutation({
        mutationFn: async () => {
            const currentTemplate = templates[selectedType] || { title: 'Заявка', fields: [] };
            const title = currentTemplate.title + (formData.object ? `: ${formData.object}` : '') + (formData.client_name ? ` - ${formData.client_name}` : '');

            // Generate description summary from fields for list view
            let description = '';
            if (currentTemplate) {
                const fields = currentTemplate.fields as FieldConfig[];
                description = fields
                    .filter(f => f.id && formData[f.id] && f.type !== 'separator')
                    .map(f => `${f.label}: ${formData[f.id!]}`)
                    .slice(0, 3) // First 3 fields as summary
                    .join('; ');
            }

            const payload = {
                type: selectedType,
                title: title,
                description: description,
                priority: 'normal',
                data: formData
            };

            const { error } = await localAPI.request('/service-requests', {
                method: 'POST',
                body: payload
            });
            if (error) throw error;
        },
        onSuccess: () => {
            refreshLists();
            setIsDialogOpen(false);
            setFormData({});
            toast.success('Заявка создана');
        },
        onError: () => toast.error('Не удалось создать заявку')
    });

    // Helper: detect which backend resource an item lives in.
    // Items with type 'plan' / 'daily' are stored in `reports`, everything else in `service_requests`.
    const isReportItem = (req: any) => ['plan', 'daily'].includes(req?.type);

    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status, reason, kind }: { id: string, status: 'approved' | 'rejected', reason?: string, kind: 'service_request' | 'report' }) => {
            const path = kind === 'report'
                ? `/reports/${id}/status`
                : `/service-requests/${id}/status`;
            const body: any = kind === 'report'
                ? { status }                       // reports endpoint expects only { status }
                : { status, reason };              // service_requests endpoint accepts { status, reason }
            const { error } = await localAPI.request(path, {
                method: 'PATCH',
                body
            });
            if (error) throw error;
            return { id, status, reason, kind };
        },
        onSuccess: (data) => {
            // Choose the right cache to patch based on source resource.
            const cacheKey = data.kind === 'report' ? 'paginated-reports' : 'paginated-service-requests';
            queryClient.setQueriesData({ queryKey: [cacheKey] }, (old: any) => {
                if (!old) return old;
                return {
                    ...old,
                    pages: old.pages.map((page: any) => ({
                        ...page,
                        data: page.data.map((item: any) =>
                            item.id === data.id ? { ...item, status: data.status, rejection_reason: data.reason } : item
                        )
                    }))
                };
            });

            // Refresh both shared caches for consistency
            queryClient.invalidateQueries({ queryKey: ['shared-service-requests'] });
            queryClient.invalidateQueries({ queryKey: ['shared-reports'] });

            collapseAndFocusRequest(data.id);
            toast.success('Статус обновлен');
            setRequestToReject(null);
            setRejectionReason('');
        },
        onError: (err: any) => {
            const msg = err?.message || '';
            if (/404|not found/i.test(msg)) {
                toast.error('Заявка не найдена или была удалена');
            } else {
                toast.error('Не удалось обновить статус');
            }
        }
    });

    const addCommentMutation = useMutation({
        mutationFn: async ({ id, comment, kind }: { id: string; comment: string; kind: 'service_request' | 'report' }) => {
            const path = kind === 'report'
                ? `/reports/${id}/comment`
                : `/service-requests/${id}/comment`;
            const { data, error } = await localAPI.request(path, {
                method: 'PATCH',
                body: { comment, neutral: false }
            });
            if (error) throw error;
            return { id, kind, comment, data };
        },
        onSuccess: (data) => {
            refreshLists();
            collapseAndFocusRequest(data.id);
            setRequestToComment(null);
            setManagerComment('');
            toast.success('Комментарий отправлен');
        },
        onError: (err: any) => {
            const msg = err?.message || '';
            if (/404|not found/i.test(msg)) {
                toast.error('Служебка не найдена');
            } else {
                toast.error('Не удалось отправить комментарий');
            }
        }
    });

    const canApprove = accessLevel >= 50 || canManageUsers;
    const canEditAll = canApprove;
    const canDelete = accessLevel >= 90 || canEditAll;

    const canEditRequest = (req: any) => {
        return canEditAll || req.user_id === user?.id;
    };

    const deleteMutation = useMutation({
        mutationFn: async ({ id, kind }: { id: string, kind: 'service_request' | 'report' }) => {
            const path = kind === 'report' ? `/reports/${id}` : `/service-requests/${id}`;
            const { error } = await localAPI.request(path, {
                method: 'DELETE'
            });
            if (error) throw error;
        },
        onSuccess: () => {
            refreshLists();
            toast.success('Заявка удалена');
        },
        onError: () => toast.error('Не удалось удалить заявку')
    });

    const editMutation = useMutation({
        mutationFn: async ({ id, data, type, title, kind }: { id: string, data: any, type: string, title: string, kind: 'service_request' | 'report' }) => {
            // Reports endpoint uses a different DTO shape (content/title/description)
            // vs service_requests (type/title/data).
            const path = kind === 'report' ? `/reports/${id}` : `/service-requests/${id}`;
            const body: any = kind === 'report'
                ? { type, title, content: data }
                : { type, title, data };
            const { error } = await localAPI.request(path, {
                method: 'PUT',
                body
            });
            if (error) throw error;
            return { id, data, type, title, kind };
        },
        onSuccess: (data) => {
            const cacheKey = data.kind === 'report' ? 'paginated-reports' : 'paginated-service-requests';
            queryClient.setQueriesData({ queryKey: [cacheKey] }, (old: any) => {
                if (!old) return old;
                return {
                    ...old,
                    pages: old.pages.map((page: any) => ({
                        ...page,
                        data: page.data.map((item: any) =>
                            item.id === data.id ? { ...item, ...data, status: 'pending', rejection_reason: null } : item
                        )
                    }))
                };
            });

            queryClient.invalidateQueries({ queryKey: ['shared-service-requests'] });
            queryClient.invalidateQueries({ queryKey: ['shared-reports'] });
            setEditingRequest(null);
            toast.success('Запись обновлена');
        },
        onError: () => toast.error('Не удалось сохранить')
    });

    const requestsArray = Array.isArray(allRequests?.data) ? allRequests.data : (Array.isArray(allRequests) ? allRequests : []);

    // Helper to normalize IDs (UUID vs string comparison)
    const normalizeId = (id: any) => id ? String(id) : null;

    const filteredRequests = requestsArray.filter((r: any) => {
        // Filter by team first (if enabled and user has team)
        if (showTeamRequests && user?.team_id) {
            const rTeamId = normalizeId(r.team_id);
            const userTeamId = normalizeId(user.team_id);
            if (rTeamId !== userTeamId) return false;
        }

        // Filter by branch (only for directors)
        if (selectedBranchId && selectedBranchId !== 'all') {
            const rBranchId = normalizeId(r.branch_id);
            const selectedId = normalizeId(selectedBranchId);
            if (rBranchId !== selectedId) return false;
        }

        if (filterStatus !== 'all' && r.status !== filterStatus) return false;

        // Quick Category Filter
        if (reportCategory === 'all_reports') {
            if (['plan', 'daily'].includes(r.type)) return false;
        } else if (reportCategory === 'plan') {
            if (r.type !== 'plan') return false;
        } else if (reportCategory === 'daily') {
            if (r.type !== 'daily') return false;
        }

        if (filterType !== 'all' && r.type !== filterType) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                (r.author_name || r.user_name || '').toLowerCase().includes(q) ||
                (r.title || '').toLowerCase().includes(q)
            );
        }
        return true;
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'approved': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
            case 'rejected': return 'text-red-500 bg-red-500/10 border-red-500/20';
            default: return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'approved': return <Check className="h-3.5 w-3.5" />;
            case 'rejected': return <X className="h-3.5 w-3.5" />;
            default: return <Clock className="h-3.5 w-3.5" />;
        }
    };

    const getTypeInfo = (type: string) => {
        return REQUEST_TYPE_LABELS[type as keyof typeof REQUEST_TYPE_LABELS] || { label: 'Другое', icon: FileText, color: 'text-gray-500' };
    };

    // Safe date formatter - handles invalid dates
    const formatDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return 'Дата неизвестна';
        try {
            const date = parseUTCDate(dateStr);
            if (isNaN(date.getTime())) return 'Дата неизвестна';
            return format(date, 'd MMM yyyy', { locale: ru });
        } catch {
            return 'Дата неизвестна';
        }
    };

    // PDF Export function using html2canvas for proper Russian text rendering
    const exportToPDF = async (req: any) => {
        try {
            const html2canvas = (await import('html2canvas')).default;
            const { jsPDF } = await import('jspdf');

            // Create a temporary container for rendering
            const container = document.createElement('div');
            container.style.position = 'absolute';
            container.style.left = '-9999px';
            container.style.top = '0';
            container.style.width = '800px';
            container.style.padding = '40px';
            container.style.backgroundColor = 'white';
            container.style.fontFamily = 'system-ui, -apple-system, sans-serif';

            // Build HTML content
            const template = templates[req.type];
            let tableRows = '';

            if (template && template.fields) {
                template.fields.forEach((field: FieldConfig) => {
                    if (field.type === 'separator') return;
                    if (!field.id) return;

                    const value = req.data?.[field.id];
                    if (value !== undefined && value !== null && value !== '') {
                        tableRows += `
                            <tr>
                                <td style="padding: 12px; border: 1px solid #e5e7eb; background: #f9fafb; font-weight: 600;">${field.label}</td>
                                <td style="padding: 12px; border: 1px solid #e5e7eb;">${String(value)}</td>
                            </tr>
                        `;
                    }
                });
            }

            container.innerHTML = `
                <div style="font-family: system-ui, -apple-system, sans-serif; color: #000;">
                    <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 20px; color: #10b981;">Служебная записка</h1>

                    <div style="margin-bottom: 20px; font-size: 14px; line-height: 1.8;">
                        <p><strong>Тип:</strong> ${getTypeInfo(req.type).label}</p>
                        <p><strong>Статус:</strong> ${req.status === 'pending' ? 'Ожидание' : req.status === 'approved' ? 'Принято' : 'Отказ'}</p>
                        <p><strong>Дата:</strong> ${formatDate(req.created_at)}</p>
                        ${req.author_name ? `<p><strong>Автор:</strong> ${req.author_name}</p>` : ''}
                    </div>

                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr>
                                <th style="padding: 12px; border: 1px solid #10b981; background: #10b981; color: white; text-align: left; font-weight: bold;">Поле</th>
                                <th style="padding: 12px; border: 1px solid #10b981; background: #10b981; color: white; text-align: left; font-weight: bold;">Значение</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            `;

            document.body.appendChild(container);

            // Render to canvas
            const canvas = await html2canvas(container, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            // Remove temporary container safely (avoid NotFoundError on rapid re-render)
            if (container.parentNode === document.body) {
                document.body.removeChild(container);
            }

            // Create PDF
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const imgWidth = 210; // A4 width in mm
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

            // Save PDF
            const fileName = `служебка_${req.id}_${Date.now()}.pdf`;
            pdf.save(fileName);

            toast.success('PDF успешно скачан');
        } catch (error) {
            console.error('PDF export error:', error);
            toast.error('Ошибка при создании PDF');
        }
    };

    const currentTemplate = templates[selectedType] || { fields: [] };

    return (
        <MainLayout>
            <div className="space-y-2.5 md:space-y-6 lg:space-y-8 xl:space-y-12 animate-fade-in max-w-[1600px] mx-auto pb-28 pt-2 md:pt-4 lg:pt-6 xl:pt-8 px-3 sm:px-4 md:px-6 lg:px-8">

                {/* === PREMIUM HEADER === */}
                <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-2.5 md:gap-6 lg:gap-8 xl:gap-10 mb-2 md:mb-4">
                    <div className="space-y-1 md:space-y-3 lg:space-y-4">
                        <div className="mb-2 md:mb-3">
                            <img src="/logo-panel.svg" alt="Logo" className="h-5 md:h-6 lg:h-7 w-auto object-contain opacity-40" />
                        </div>
                        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white uppercase tracking-tighter leading-none">
                            СЛУЖЕБНЫЕ ЗАПИСКИ
                        </h1>
                        <p className="text-[10px] sm:text-xs md:text-sm font-black text-white/20 uppercase tracking-[0.2em] sm:tracking-[0.3em] md:tracking-[0.4em] flex items-center gap-2 md:gap-3">
                            <span className="w-6 sm:w-8 md:w-12 h-px bg-white/10" />
                            Реестр документов и отчетность
                        </p>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3 w-full xl:w-auto">
                        <Button
                            variant="outline"
                            className="flex-1 md:flex-none border-white/10 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-wider text-xs"
                            onClick={refreshLists}
                        >
                            Обновить
                        </Button>

                        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="flex-1 md:flex-none gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 font-black uppercase tracking-wider text-xs">
                                    <Plus className="h-4 w-4" />
                                    <span>Создать отчет</span>
                                </Button>
                            </DialogTrigger>
                            <DialogContent
                                style={{
                                    ['--dialog-content-max-width' as any]: '1200px',
                                    width: 'min(1200px, calc(100vw - 1.5rem))',
                                    maxWidth: '1200px',
                                    maxHeight: 'calc(100vh - 1.5rem)',
                                    height: 'min(920px, calc(100vh - 1.5rem))',
                                }}
                                className="w-full h-[100dvh] sm:h-auto sm:max-h-[calc(100vh-1.5rem)] sm:max-w-[1200px] flex flex-col p-0 gap-0 sm:rounded-3xl border-0 sm:border border-white/10 bg-zinc-950/95 backdrop-blur-3xl overflow-hidden z-[100] shadow-2xl"
                            >
                                {/* Progress Bar */}
                                {currentTemplate && (() => {
                                    const fields = (currentTemplate.fields as FieldConfig[]).filter(f => f.type !== 'separator' && f.id);
                                    const requiredFields = fields.filter(f => f.required);
                                    const filledRequired = requiredFields.filter(f => {
                                        const val = formData[f.id!];
                                        return val !== undefined && val !== null && val !== '';
                                    });
                                    const progress = requiredFields.length > 0 ? (filledRequired.length / requiredFields.length) * 100 : 0;

                                    return (
                                        <motion.div
                                            className="absolute top-0 left-0 right-0 h-1 bg-white/5 z-50"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                        >
                                            <motion.div
                                                className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]"
                                                initial={{ width: 0 }}
                                                animate={{ width: `${progress}%` }}
                                                transition={{ duration: 0.3, ease: "easeOut" }}
                                            />
                                        </motion.div>
                                    );
                                })()}

                                <DialogHeader className="p-4 sm:p-6 md:p-7 pb-3 sm:pb-4 border-b border-white/5 shrink-0 relative">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1">
                                            <DialogTitle className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tighter text-white">Новая запись</DialogTitle>
                                            <p className="text-[10px] md:text-xs font-bold text-white/20 uppercase tracking-[0.2em] mt-1">Заполните данные для реестра</p>
                                        </div>
                                        {currentTemplate && (() => {
                                            const fields = (currentTemplate.fields as FieldConfig[]).filter(f => f.type !== 'separator' && f.id);
                                            const requiredFields = fields.filter(f => f.required);
                                            const filledRequired = requiredFields.filter(f => {
                                                const val = formData[f.id!];
                                                return val !== undefined && val !== null && val !== '';
                                            });

                                            return requiredFields.length > 0 && (
                                                <motion.div
                                                    className="flex flex-col items-end gap-1"
                                                    initial={{ opacity: 0, scale: 0.8 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    transition={{ delay: 0.2 }}
                                                >
                                                    <div className="text-xs font-black text-white/60">
                                                        {filledRequired.length}/{requiredFields.length}
                                                    </div>
                                                    <div className="text-[9px] uppercase tracking-wider text-white/30">
                                                        обязательных
                                                    </div>
                                                </motion.div>
                                            );
                                        })()}
                                    </div>
                                </DialogHeader>

                                <div className="flex-1 overflow-y-auto">
                                    <div className="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8">
                                        {/* Type Selection */}
                                        <motion.div
                                            className="space-y-3"
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.3 }}
                                        >
                                            <Label className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] text-white/50 ml-1 flex items-center gap-2">
                                                <FileText className="h-3 w-3" />
                                                Тип записи
                                            </Label>
                                            <Select value={selectedType} onValueChange={(v) => { setSelectedType(v); setFormData({}); }}>
                                                <SelectTrigger className="bg-white/[0.03] border-white/10 h-12 sm:h-14 md:h-16 rounded-xl md:rounded-2xl text-sm md:text-base shadow-inner group">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-zinc-900 border-white/10 rounded-2xl p-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                                                    {types.map((t) => (
                                                        <SelectItem
                                                            key={t.id}
                                                            value={t.id}
                                                            className="rounded-xl h-12 pr-4 focus:bg-white/10 mb-1 last:mb-0 cursor-pointer font-black uppercase tracking-[0.15em] text-sm text-white/90"
                                                        >
                                                            {t.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </motion.div>

                                        {/* Form Fields */}
                                        <AnimatePresence mode="wait">
                                            {currentTemplate && (
                                                <motion.div
                                                    key={selectedType}
                                                    className="space-y-4 sm:space-y-5"
                                                    initial={{ opacity: 0, y: 20 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -20 }}
                                                    transition={{ duration: 0.3, staggerChildren: 0.05 }}
                                                >
                                                    {(currentTemplate.fields as FieldConfig[]).map((field, idx) => {
                                                        if (field.type === 'separator') {
                                                            return (
                                                                <motion.div
                                                                    key={idx}
                                                                    className="pt-4 sm:pt-6 pb-2 border-b border-white/10 relative"
                                                                    initial={{ opacity: 0, x: -20 }}
                                                                    animate={{ opacity: 1, x: 0 }}
                                                                    transition={{ delay: idx * 0.03 }}
                                                                >
                                                                    <h4 className="text-[10px] md:text-xs font-black text-primary/70 uppercase tracking-[0.25em] flex items-center gap-2">
                                                                        <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
                                                                        {field.label}
                                                                        <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent" />
                                                                    </h4>
                                                                </motion.div>
                                                            );
                                                        }

                                                        if (field.condition && formData[field.condition.field] !== field.condition.value) {
                                                            return null;
                                                        }

                                                        const hasValue = formData[field.id] !== undefined && formData[field.id] !== null && formData[field.id] !== '';

                                                        return (
                                                            <motion.div
                                                                key={field.id}
                                                                className="space-y-2"
                                                                initial={{ opacity: 0, y: 10 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                exit={{ opacity: 0, height: 0 }}
                                                                transition={{ delay: idx * 0.03 }}
                                                            >
                                                                <Label className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-white/50 ml-1 flex items-center gap-2">
                                                                    {getFieldIcon(field)}
                                                                    {field.label}
                                                                    {field.required && (
                                                                        <span className="text-primary/60 text-xs">*</span>
                                                                    )}
                                                                    {hasValue && (
                                                                        <motion.div
                                                                            initial={{ scale: 0 }}
                                                                            animate={{ scale: 1 }}
                                                                            className="ml-auto"
                                                                        >
                                                                            <Check className="h-3 w-3 text-primary/60" />
                                                                        </motion.div>
                                                                    )}
                                                                </Label>
                                                                <FieldInput
                                                                    field={field}
                                                                    value={formData[field.id]}
                                                                    onChange={(val) => setFormData(prev => ({ ...prev, [field.id!]: val }))}
                                                                />
                                                            </motion.div>
                                                        );
                                                    })}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Footer with Submit Button */}
                                <div className="p-4 sm:p-6 md:p-7 border-t border-white/5 bg-zinc-900/60 backdrop-blur-3xl shrink-0">
                                    {currentTemplate && (() => {
                                        const fields = (currentTemplate.fields as FieldConfig[]).filter(f => f.type !== 'separator' && f.id);
                                        const requiredFields = fields.filter(f => f.required);
                                        const filledRequired = requiredFields.filter(f => {
                                            const val = formData[f.id!];
                                            return val !== undefined && val !== null && val !== '';
                                        });
                                        const isComplete = requiredFields.length === 0 || filledRequired.length === requiredFields.length;

                                        return (
                                            <Button
                                                className={cn(
                                                    "w-full h-12 sm:h-14 md:h-16 rounded-xl md:rounded-2xl font-black uppercase tracking-[0.3em] text-xs md:text-sm transition-all duration-500 group/btn-submit relative overflow-hidden",
                                                    isComplete
                                                        ? "gradient-primary shadow-[0_20px_40px_rgba(var(--primary-rgb),0.3)] hover:shadow-[0_25px_50px_rgba(var(--primary-rgb),0.4)] hover:-translate-y-1 active:scale-95"
                                                        : "bg-white/5 text-white/30 cursor-not-allowed border border-white/10"
                                                )}
                                                onClick={() => createMutation.mutate()}
                                                disabled={createMutation.isPending || !isComplete}
                                            >
                                                <div className="relative z-10 flex items-center justify-center gap-3">
                                                    {createMutation.isPending ? (
                                                        <>
                                                            <motion.div
                                                                animate={{ rotate: 360 }}
                                                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                                            >
                                                                <Clock className="h-5 w-5 md:h-6 md:w-6" />
                                                            </motion.div>
                                                            <span>Сохранение...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Check className={cn(
                                                                "h-5 w-5 md:h-7 md:w-7 transition-transform",
                                                                isComplete && "group-hover/btn-submit:scale-125"
                                                            )} />
                                                            <span>Отправить отчет</span>
                                                            {!isComplete && requiredFields.length > 0 && (
                                                                <span className="text-[9px] opacity-60">
                                                                    ({filledRequired.length}/{requiredFields.length})
                                                                </span>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                                {isComplete && !createMutation.isPending && (
                                                    <motion.div
                                                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                                        initial={{ x: '-100%' }}
                                                        animate={{ x: '100%' }}
                                                        transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                                                    />
                                                )}
                                            </Button>
                                        );
                                    })()}
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Main Navigation Tabs */}
                <div className="p-1.5 sm:p-3 md:p-6 lg:p-8 rounded-xl sm:rounded-[1.5rem] md:rounded-[2rem] lg:rounded-[2.5rem] bg-zinc-900/60 backdrop-blur-2xl border border-white/5 shadow-2xl relative">
                    <div className="flex flex-1 bg-black/40 p-1 rounded-xl md:rounded-[1.25rem] border border-white/5 h-11 md:h-12 lg:h-14 overflow-x-auto overflow-y-hidden no-scrollbar shadow-inner">
                        {[
                            { id: 'all_reports', label: 'ВСЕ', icon: FileText },
                            { id: 'plan', label: 'ПЛАН', icon: Target },
                            { id: 'daily', label: 'ОТЧЁТ', icon: Clock }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setReportCategory(tab.id)}
                                className={cn(
                                    "flex-1 px-3 sm:px-4 lg:px-6 rounded-lg md:rounded-xl text-[10px] md:text-xs font-black uppercase tracking-wider sm:tracking-widest transition-all duration-500 whitespace-nowrap outline-none h-full flex items-center justify-center gap-1.5 md:gap-2",
                                    reportCategory === tab.id
                                        ? "bg-white/10 text-white shadow-xl ring-1 ring-white/10"
                                        : "text-zinc-500 hover:text-white/60"
                                )}
                            >
                                <tab.icon className="h-3 w-3 md:h-3.5 md:w-3.5" />
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Glassmorphic Filters Section */}
                <div className="p-2.5 sm:p-5 md:p-6 lg:p-8 rounded-lg sm:rounded-[1.5rem] md:rounded-[2rem] lg:rounded-[2.5rem] bg-zinc-900/60 backdrop-blur-2xl border border-white/5 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-48 h-48 md:w-64 md:h-64 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

                    <div className="relative z-10 flex flex-col lg:flex-row gap-2 md:gap-5 lg:gap-6 xl:gap-8">
                        {/* Status Tabs - Glass Style */}
                        <div className="flex flex-1 sm:flex-none bg-black/40 p-1 rounded-xl md:rounded-[1.25rem] border border-white/5 h-11 md:h-12 lg:h-14 overflow-x-auto no-scrollbar shadow-inner">
                            {['all', 'pending', 'approved', 'rejected'].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setFilterStatus(status)}
                                    className={cn(
                                        "flex-1 px-3 sm:px-4 lg:px-6 rounded-lg md:rounded-xl text-[10px] md:text-xs font-black uppercase tracking-wider sm:tracking-widest transition-all duration-500 whitespace-nowrap outline-none h-full flex flex-col justify-center",
                                        filterStatus === status
                                            ? "bg-white/10 text-white shadow-xl ring-1 ring-white/10"
                                            : "text-zinc-500 hover:text-white/60"
                                    )}
                                >
                                    {status === 'all' ? 'Все' : status === 'pending' ? 'Ожидание' : status === 'approved' ? 'Принято' : 'Отказ'}
                                </button>
                            ))}
                        </div>

                        {/* Search & Type */}
                        <div className="flex-1 flex flex-col xl:flex-row gap-3 md:gap-4 lg:gap-5">
                            <div className="relative flex-1 group/search min-w-[200px]">
                                <Search className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-3.5 w-3.5 md:h-4 md:w-4 -translate-y-1/2 text-primary/60 group-hover/search:text-primary transition-colors duration-300" aria-hidden />
                                <Input
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="поиск..."
                                    className={cn(
                                        INPUT_WITH_LEADING_ICON,
                                        'bg-zinc-900/60 border-white/10 focus:border-white/20 transition-all shadow-inner placeholder:text-zinc-600 focus:bg-zinc-800/60',
                                    )}
                                />
                            </div>

                            <Select value={filterType} onValueChange={setFilterType}>
                                <SelectTrigger className="w-full sm:w-[200px] lg:w-[240px] bg-zinc-900/60 border-white/10 text-white">
                                    <SelectValue placeholder="Категория" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-white/10 rounded-xl p-1 shadow-2xl">
                                    <SelectItem value="all" className="rounded-lg h-9 md:h-10 px-3 md:px-4 font-bold text-xs uppercase cursor-pointer hover:bg-white/5">
                                        <div className="flex items-center whitespace-nowrap">
                                            <Filter className="mr-2 h-3.5 w-3.5 md:h-4 md:w-4 text-primary/60 shrink-0" />
                                            <span className="truncate">Все категории</span>
                                        </div>
                                    </SelectItem>
                                    {types.map((t) => (
                                        <SelectItem key={t.id} value={t.id} className="rounded-lg h-9 md:h-10 px-3 md:px-4 font-bold text-xs uppercase cursor-pointer hover:bg-white/5">
                                            <div className="flex items-center whitespace-nowrap">
                                                <Filter className="mr-2 h-3.5 w-3.5 md:h-4 md:w-4 text-primary/60 shrink-0" />
                                                <span className="truncate">{t.name}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* My Team Toggle - only for users with team_id - segmented control like in Deals */}
                            {user?.team_id && (
                                <div className="flex gap-2 p-1 bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-xl md:rounded-[1.25rem] w-full sm:w-fit">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowTeamRequests(false)}
                                        className={cn(
                                            "gap-2 transition-all rounded-lg md:rounded-xl",
                                            !showTeamRequests
                                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                                : "text-white/60 hover:text-white hover:bg-white/5"
                                        )}
                                    >
                                        <User className="h-4 w-4" />
                                        Только мои
                                    </Button>

                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowTeamRequests(true)}
                                        className={cn(
                                            "gap-2 transition-all rounded-lg md:rounded-xl",
                                            showTeamRequests
                                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                                : "text-white/60 hover:text-white hover:bg-white/5"
                                        )}
                                    >
                                        <Users className="h-4 w-4" />
                                        Моя команда
                                    </Button>
                                </div>
                            )}

                            {/* Branch Selector - only for directors (accessLevel >= 90) and NOT commercial director */}
                            {(accessLevel >= 90 && user?.role !== 'commercial') && (
                                <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                                    <SelectTrigger className="w-full sm:w-[160px] lg:w-[180px] bg-zinc-900/60 border-white/10 text-white">
                                        <SelectValue placeholder="Филиал" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-white/10 rounded-xl p-1 shadow-2xl">
                                        <SelectItem value="all" className="rounded-lg h-9 md:h-10 px-3 md:px-4 font-bold text-xs uppercase cursor-pointer hover:bg-white/5">
                                            <div className="flex items-center whitespace-nowrap">
                                                <Building2 className="mr-2 h-3.5 w-3.5 md:h-4 md:w-4 text-primary/60 shrink-0" />
                                                <span className="truncate">Все филиалы</span>
                                            </div>
                                        </SelectItem>
                                        {(Array.isArray(branches) ? branches : []).map((b: any) => (
                                            <SelectItem key={b.id} value={b.id} className="rounded-lg h-9 md:h-10 px-3 md:px-4 font-bold text-xs uppercase cursor-pointer hover:bg-white/5">
                                                <div className="flex items-center whitespace-nowrap">
                                                    <Building2 className="mr-2 h-3.5 w-3.5 md:h-4 md:w-4 text-primary/60 shrink-0" />
                                                    <span className="truncate">{b.name}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </div>
                </div>

                {/* List of Requests */}
                <div className="grid grid-cols-1 gap-2 md:gap-4 lg:gap-5 xl:gap-6 px-0 sm:px-2 md:px-0">
                    {filteredRequests.map((req: any, i: number) => {
                        const typeInfo = getTypeInfo(req.type);
                        const Icon = typeInfo.icon;
                        const isExpanded = expandedRequest === req.id;

                        return (
                            <motion.div
                                key={req.id}
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.03, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                                className={cn(
                                    "relative rounded-2xl md:rounded-[2.5rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 overflow-hidden transition-all duration-700 group/card",
                                    isExpanded ? "ring-2 ring-primary/40 shadow-[0_0_50px_rgba(var(--primary-rgb),0.15)] bg-zinc-900/60" : "hover:border-white/10 hover:bg-zinc-900/60 hover:-translate-y-1 shadow-2xl"
                                )}
                            >
                                {/* Glass shine effect */}
                                <div className="absolute top-0 right-0 p-32 bg-primary/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none opacity-0 group-hover/card:opacity-100 transition-opacity duration-1000" />

                                <div
                                    id={`request-${req.id}`}
                                    className="relative p-3 sm:p-4 md:p-6 lg:p-7 flex flex-col xl:flex-row items-start gap-3 sm:gap-4 md:gap-6 lg:gap-7 cursor-pointer z-10"
                                    onClick={() => setExpandedRequest(isExpanded ? null : req.id)}
                                >
                                    {/* Type Icon Container */}
                                    <div className={cn(
                                        "h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 rounded-xl md:rounded-2xl flex items-center justify-center border shadow-xl transition-all duration-700 shrink-0 relative overflow-hidden group/icon",
                                        isExpanded ? "scale-105 gradient-primary border-primary/40 shadow-primary/20" : "bg-white/5 border-white/10 group-hover/card:border-white/20"
                                    )}>
                                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover/icon:opacity-100 transition-opacity duration-700" />
                                        <Icon className={cn("h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 transition-all duration-700 relative z-10", isExpanded ? "text-white scale-110" : "text-white/40 group-hover/card:text-white group-hover/card:scale-110")} />
                                    </div>

                                    <div className="flex-1 min-w-0 w-full">
                                        {/* Status & Category Bar */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 md:gap-4 mb-3 md:mb-5">
                                            <div className="flex items-center gap-2 md:gap-3">
                                                <span className={cn(
                                                    "px-2 md:px-4 py-1 md:py-1.5 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] border backdrop-blur-md shadow-lg transition-all duration-500",
                                                    typeInfo.color.replace('text-', 'bg-').replace('500', '500/10'),
                                                    typeInfo.color.replace('text-', 'border-').replace('500', '500/20'),
                                                    typeInfo.color
                                                )}>
                                                    {typeInfo.label}
                                                </span>
                                            </div>

                                            <div className={cn(
                                                "px-3 md:px-5 py-1.5 md:py-2 rounded-xl border flex items-center gap-2 md:gap-3 backdrop-blur-2xl shadow-xl transition-all duration-700",
                                                getStatusColor(req.status)
                                            )}>
                                                <div className="p-1 rounded-full bg-black/20 shadow-inner">
                                                    {getStatusIcon(req.status)}
                                                </div>
                                                <span className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em]">
                                                    {req.status === 'pending' ? 'Ожидание' : req.status === 'approved' ? 'Принято' : 'Отказ'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Main Title */}
                                        <h3 className={cn(
                                            "text-base sm:text-lg md:text-xl font-black mb-2 md:mb-3 leading-tight tracking-tighter transition-all duration-700",
                                            isExpanded ? "text-white text-xl md:text-2xl" : "text-white/90 group-hover/card:text-white"
                                        )}>
                                            {req.title}
                                        </h3>

                                        {/* Meta Info Ribbon */}
                                        <div className="flex flex-wrap items-center gap-3 md:gap-5 mb-3 md:mb-4 bg-white/[0.02] p-2 md:p-3 lg:p-4 rounded-xl md:rounded-2xl border border-white/[0.05] shadow-inner">
                                            <div className="flex items-center gap-2 md:gap-3 group/meta">
                                                <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-primary/10 border border-primary/20 group-hover/meta:bg-primary/20 transition-all duration-500">
                                                    <Calendar className="h-3 w-3 md:h-4 md:w-4 text-primary" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[7px] md:text-[8px] font-black uppercase tracking-[0.2em] text-white/20 mb-0.5">Дата</span>
                                                    <span className="text-[9px] md:text-xs font-black text-white/60 tabular-nums">
                                                        {formatDate(req.created_at)}
                                                    </span>
                                                </div>
                                            </div>
                                            {req.author_name && (
                                                <div className="flex items-center gap-2 md:gap-3 group/meta">
                                                    <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-emerald-500/10 border border-emerald-500/20 group-hover/meta:bg-emerald-500/20 transition-all duration-500">
                                                        <User className="h-3 w-3 md:h-4 md:w-4 text-emerald-400" />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[7px] md:text-[8px] font-black uppercase tracking-[0.2em] text-white/20 mb-0.5">Автор</span>
                                                        <span className="text-[9px] md:text-xs font-black text-white/60">{req.author_name}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Description Preview */}
                                        {!isExpanded && req.description && (
                                            <div className="relative overflow-hidden group/desc">
                                                <div className="absolute inset-y-0 left-0 w-1 bg-primary/40 rounded-full transition-all duration-500 group-hover/card:bg-primary" />
                                                <p className="text-xs sm:text-sm md:text-base text-white/30 font-medium line-clamp-2 leading-relaxed italic pl-4 md:pl-6 py-1 transition-colors duration-500 group-hover/card:text-white/50">
                                                    {req.description}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions Block */}
                                    <div className="flex flex-row xl:flex-col items-center gap-3 md:gap-5 xl:gap-6 xl:self-center shrink-0 xl:min-w-[150px] w-full xl:w-auto pt-4 md:pt-6 xl:pt-0 border-t xl:border-t-0 border-white/5">
                                        {(canApprove && req.status === 'pending') && (
                                            <div className="flex flex-row xl:flex-col gap-2 md:gap-3 flex-1 xl:w-full">
                                                <Button
                                                    size="sm"
                                                    className="flex-1 xl:w-full h-9 md:h-12 rounded-xl md:rounded-2xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/20 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500 shadow-xl"
                                                    onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: req.id, status: 'approved', kind: isReportItem(req) ? 'report' : 'service_request' }); }}
                                                >
                                                    <Check className="h-4 w-4 mr-2" /> Одобрить
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    className="flex-1 xl:w-full h-9 md:h-12 rounded-xl md:rounded-2xl bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500 shadow-xl"
                                                    onClick={(e) => { e.stopPropagation(); setRequestToReject({ id: req.id, kind: isReportItem(req) ? 'report' : 'service_request' }); }}
                                                >
                                                    <X className="h-4 w-4 mr-2" /> Отказать
                                                </Button>
                                            </div>
                                        )}

                                        <div className={cn(
                                            "p-2 md:p-3 rounded-2xl bg-white/5 border border-white/10 transition-all duration-700 shadow-inner",
                                            isExpanded && "rotate-180 bg-primary/20 border-primary/40 text-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)]"
                                        )}>
                                            <ChevronDown className="h-4 w-4 md:h-6 md:w-6" />
                                        </div>
                                    </div>
                                </div>

                                {/* Main Content (Expanded) */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                            className="overflow-hidden border-t border-white/5 bg-black/40 relative"
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

                                            {/* Data Sections */}
                                            <div className="p-3 sm:p-4 md:p-5 lg:p-6 relative z-10">
                                                <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-6 pb-2 md:pb-3 border-b border-white/10">
                                                    <div className="w-1 md:w-1.5 h-4 md:h-6 bg-primary rounded-full shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)]" />
                                                    <h4 className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-white/40">СПЕЦИФИКАЦИЯ</h4>
                                                </div>

                                                {req.status === 'rejected' && req.rejection_reason && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className="mb-8 p-4 md:p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 relative overflow-hidden group/reason"
                                                    >
                                                        <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
                                                        <div className="flex items-start gap-4">
                                                            <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
                                                                <MessageSquare className="h-4 w-4" />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <span className="text-[8px] md:text-[9px] uppercase font-black tracking-widest text-rose-400/60">ПРИЧИНА ОТКЛОНЕНИЯ</span>
                                                                <p className="text-xs md:text-sm font-bold text-rose-200/90 leading-relaxed italic">
                                                                    «{req.rejection_reason}»
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12 lg:gap-16">
                                                    {(templates[req.type]?.fields || []).map((field: any, idx: number) => {
                                                        if (field.type === 'separator') {
                                                            return (
                                                                <div key={idx} className="col-span-full pt-4 md:pt-6 mb-1 md:mb-2">
                                                                    <div className="flex items-center gap-3 md:gap-4">
                                                                        <div className="p-1.5 md:p-2 rounded-lg bg-primary/10 border border-primary/20">
                                                                            <Settings2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
                                                                        </div>
                                                                        <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-primary/80 whitespace-nowrap">{field.label}</span>
                                                                        <div className="h-px w-full bg-gradient-to-r from-primary/40 via-primary/10 to-transparent" />
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        if (!req.data[field.id!]) return null;

                                                        // Get appropriate icon based on field label/id
                                                        let FieldIcon = Info;
                                                        const label = field.label.toLowerCase();
                                                        if (label.includes('сумм') || label.includes('деньг') || label.includes('цена')) FieldIcon = HandCoins;
                                                        else if (label.includes('дат') || label.includes('срок')) FieldIcon = Calendar;
                                                        else if (label.includes('клиент') || label.includes('фио')) FieldIcon = User;
                                                        else if (label.includes('объект') || label.includes('адрес')) FieldIcon = Home;
                                                        else if (label.includes('коммент') || label.includes('опис')) FieldIcon = FileText;

                                                        return (
                                                            <motion.div
                                                                key={idx}
                                                                initial={{ opacity: 0, x: -20 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                transition={{ delay: idx * 0.05 + 0.2, duration: 0.6 }}
                                                                className="space-y-3 md:space-y-4 group/field"
                                                            >
                                                                <div className="flex items-center gap-2 md:gap-3">
                                                                    <div className="p-1 md:p-1.5 rounded-lg bg-white/5 border border-white/10 group-hover/field:bg-primary/10 group-hover/field:border-primary/20 transition-all duration-500">
                                                                        <FieldIcon className="h-3 w-3 md:h-3.5 md:w-3.5 text-white/30 group-hover/field:text-primary transition-colors duration-500" />
                                                                    </div>
                                                                    <span className="text-[8px] md:text-[9px] uppercase font-black tracking-[0.15em] md:tracking-[0.2em] text-white/20 group-hover/field:text-white/50 transition-colors duration-500">
                                                                        {field.label}
                                                                    </span>
                                                                </div>
                                                                <div className="min-h-[40px] md:min-h-[45px] flex items-center px-4 md:px-5 py-2 md:py-3 bg-white/[0.03] rounded-xl md:rounded-2xl border border-white/5 group-hover/field:border-white/10 group-hover/field:bg-white/[0.05] transition-all duration-700 shadow-xl relative overflow-hidden">
                                                                    <div className="absolute inset-y-0 left-0 w-0.5 bg-white/0 group-hover/field:bg-primary/40 transition-all duration-700" />
                                                                    <span className="text-xs md:text-sm font-black text-white/90 leading-snug tabular-nums">
                                                                        {req.data[field.id!]}
                                                                    </span>
                                                                </div>
                                                            </motion.div>
                                                        )
                                                    })}

                                                    {/* Custom Data Fallback */}
                                                    {Object.entries(req.data || {}).map(([key, val]: [string, any], idx: number) => {
                                                        const inTemplate = (templates[req.type]?.fields || []).some((f: any) => f.id === key);
                                                        if (inTemplate || !val || typeof val === 'object') return null;
                                                        return (
                                                            <div key={key} className="space-y-3 md:space-y-4 group/field">
                                                                <div className="flex items-center gap-3 md:gap-4">
                                                                    <div className="p-1.5 md:p-2.5 rounded-lg md:rounded-xl bg-white/5 border border-white/10 group-hover/field:bg-white/10 transition-all duration-500">
                                                                        <Info className="h-3.5 w-3.5 md:h-4 md:w-4 text-white/20 group-hover/field:text-white/40" />
                                                                    </div>
                                                                    <span className="text-[9px] md:text-[10px] uppercase font-black tracking-[0.2em] md:tracking-[0.3em] text-white/20 group-hover/field:text-white/40">
                                                                        {key.replace(/_/g, ' ')}
                                                                    </span>
                                                                </div>
                                                                <div className="min-h-[50px] md:min-h-[70px] flex items-center px-5 md:px-8 py-3 md:py-5 bg-black/20 rounded-2xl md:rounded-3xl border border-white/5 hover:border-white/10 transition-all duration-500">
                                                                    <span className="text-sm md:text-base font-bold text-white/60">
                                                                        {String(val)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {(!(templates[req.type]?.fields?.length) && Object.keys(req.data || {}).length === 0) && (
                                                    <div className="py-20 md:py-32 flex flex-col items-center justify-center text-center space-y-6 md:space-y-10 opacity-40">
                                                        <div className="p-5 md:p-8 rounded-full bg-white/5 border border-white/10 animate-pulse">
                                                            <Activity className="h-10 w-10 md:h-16 md:w-16 text-white/30" />
                                                        </div>
                                                        <p className="text-xs md:text-sm font-black uppercase tracking-[0.3em] md:tracking-[0.5em] text-white/30">
                                                            НЕТ ДОПОЛНИТЕЛЬНЫХ ДАННЫХ
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Attachments Section */}
                                            <div className="px-3 sm:px-4 md:px-5 pb-3 sm:pb-6 md:pb-8 border-t border-white/5 pt-3 sm:pt-6 relative z-10">
                                                <div className="flex items-center justify-between mb-4 md:mb-6 group/att">
                                                    <div className="flex items-center gap-3 md:gap-4">
                                                        <div className="p-2 md:p-3 rounded-xl bg-zinc-500/10 border border-white/10 group-hover/att:bg-primary/10 group-hover/att:border-primary/20 transition-all duration-700">
                                                            <Paperclip className="h-4 w-4 md:h-5 md:w-5 text-zinc-500 group-hover/att:text-primary transition-colors" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] md:text-[10px] font-black text-white/30 uppercase tracking-[0.3em] group-hover/att:text-white/60 transition-colors">ВЛОЖЕНИЯ</span>
                                                            <span className="text-[7px] md:text-[8px] font-bold text-white/10 uppercase tracking-widest mt-0.5">Документы и фото</span>
                                                        </div>
                                                    </div>
                                                    <div className="h-px flex-1 mx-4 md:mx-8 bg-gradient-to-r from-white/10 to-transparent" />
                                                </div>
                                                <ServiceRequestAttachments
                                                    requestId={req.id}
                                                    canDelete={canApprove || req.user_id === user?.id}
                                                />
                                            </div>

                                            {/* Manager Comments */}
                                            {Array.isArray((req.data as any)?.__manager_comments) && (req.data as any).__manager_comments.length > 0 && (
                                                <div className="px-3 sm:px-4 md:px-5 pb-3 sm:pb-6 md:pb-8 border-t border-white/5 pt-3 sm:pt-6 relative z-10">
                                                    <div className="flex items-center justify-between mb-4 md:mb-6 group/att">
                                                        <div className="flex items-center gap-3 md:gap-4">
                                                            <div className="p-2 md:p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 transition-all duration-700">
                                                                <MessageSquare className="h-4 w-4 md:h-5 md:w-5 text-amber-400 transition-colors" />
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="text-[9px] md:text-[10px] font-black text-white/30 uppercase tracking-[0.3em] transition-colors">КОММЕНТАРИИ РУКОВОДИТЕЛЯ</span>
                                                                <span className="text-[7px] md:text-[8px] font-bold text-white/10 uppercase tracking-widest mt-0.5">Замечания по служебке</span>
                                                            </div>
                                                        </div>
                                                        <div className="h-px flex-1 mx-4 md:mx-8 bg-gradient-to-r from-white/10 to-transparent" />
                                                    </div>
                                                    <div className="space-y-2 md:space-y-3">
                                                        {(req.data as any).__manager_comments.slice(-5).reverse().map((c: any) => (
                                                            <div key={c.id || `${c.created_at}-${c.text}`} className="rounded-2xl border border-white/10 bg-black/20 p-3 md:p-4">
                                                                <div className="flex items-center justify-between gap-3 mb-2">
                                                                    <span className="text-[9px] md:text-[10px] uppercase font-black tracking-[0.2em] text-white/40">
                                                                        {c.neutral ? 'Нейтрально' : 'Комментарий'}
                                                                    </span>
                                                                    <span className="text-[9px] text-white/30 font-bold">
                                                                        {c.created_at ? format(parseUTCDate(c.created_at), 'dd.MM.yyyy HH:mm', { locale: ru }) : ''}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs md:text-sm font-bold text-white/75 whitespace-pre-wrap break-words">{c.text}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Action Panel */}
                                            {canApprove && req.status === 'pending' && (
                                                <div className="px-3 sm:px-4 md:px-5 py-3 sm:py-4 md:py-6 bg-gradient-to-br from-primary/10 to-transparent border-t border-white/10 flex flex-col lg:flex-row items-center justify-between gap-3 md:gap-4 relative overflow-hidden z-10">
                                                    <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                                                    <div className="space-y-1 md:space-y-2 text-center lg:text-left relative">
                                                        <div className="flex items-center justify-center lg:justify-start gap-2 mb-1">
                                                            <ShieldCheck className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                                                            <h5 className="text-sm md:text-base font-black text-white uppercase tracking-tighter">УПРАВЛЕНИЕ</h5>
                                                        </div>
                                                        <p className="text-[8px] md:text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Решение по записке</p>
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-4 w-full lg:w-auto">
                                                        <Button
                                                            className="h-10 md:h-12 px-6 md:px-10 rounded-xl md:rounded-2xl bg-amber-500/10 hover:bg-amber-500 text-amber-300 hover:text-white border border-amber-500/20 font-black uppercase tracking-widest text-[9px] md:text-[10px] shadow-lg shadow-amber-500/20 transition-all duration-500 hover:-translate-y-0.5 active:scale-95"
                                                            onClick={(e) => { e.stopPropagation(); setRequestToComment({ id: req.id, kind: isReportItem(req) ? 'report' : 'service_request' }); }}
                                                        >
                                                            <MessageSquare className="h-4 w-4 md:h-5 md:w-5 mr-2" /> ДОБАВИТЬ КОММЕНТАРИЙ
                                                        </Button>
                                                        <Button
                                                            className="h-10 md:h-12 px-6 md:px-10 rounded-xl md:rounded-2xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/20 font-black uppercase tracking-widest text-[9px] md:text-[10px] shadow-lg shadow-emerald-500/20 transition-all duration-500 hover:-translate-y-0.5 active:scale-95 group/btn-approve"
                                                            onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: req.id, status: 'approved', kind: isReportItem(req) ? 'report' : 'service_request' }); }}
                                                        >
                                                            <Check className="h-4 w-4 md:h-5 md:w-5 mr-2 group-hover/btn-approve:scale-110 transition-transform" /> ОДОБРИТЬ
                                                        </Button>
                                                        <Button
                                                            className="h-10 md:h-12 px-6 md:px-10 rounded-xl md:rounded-2xl bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 font-black uppercase tracking-widest text-[9px] md:text-[10px] shadow-lg shadow-rose-500/20 transition-all duration-500 hover:-translate-y-0.5 active:scale-95 group/btn-reject"
                                                            onClick={(e) => { e.stopPropagation(); setRequestToReject({ id: req.id, kind: isReportItem(req) ? 'report' : 'service_request' }); }}
                                                        >
                                                            <X className="h-4 w-4 md:h-5 md:w-5 mr-2 group-hover/btn-reject:scale-110 transition-transform" /> ОТКАЗАТЬ
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Footer Item Context Bar */}
                                            <div className="px-3 sm:px-12 py-3 sm:py-6 flex flex-wrap items-center justify-between gap-3 sm:gap-6 border-t border-white/5 bg-black/40">
                                                <div className="flex flex-wrap gap-2 sm:gap-4">
                                                    <Button
                                                        variant="ghost"
                                                        className="h-10 sm:h-10 px-3 sm:px-5 text-[10px] sm:text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80 hover:bg-primary/5 rounded-lg sm:rounded-xl transition-all"
                                                        onClick={async (e) => { e.stopPropagation(); await exportToPDF(req); }}
                                                    >
                                                        <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" /> Скачать PDF
                                                    </Button>
                                                    {canEditRequest(req) && (
                                                        <Button
                                                            variant="ghost"
                                                            className="h-10 sm:h-10 px-3 sm:px-5 text-[10px] sm:text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg sm:rounded-xl transition-all"
                                                            onClick={(e) => { e.stopPropagation(); setEditingRequest(req); setEditFormData(req.data || {}); }}
                                                        >
                                                            <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" /> Редактировать
                                                        </Button>
                                                    )}
                                                    {(canDelete || req.user_id === user?.id) && (
                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    className="h-10 sm:h-10 px-3 sm:px-5 text-[10px] sm:text-[10px] font-black uppercase tracking-widest text-rose-500/60 hover:text-rose-400 hover:bg-rose-500/5 rounded-lg sm:rounded-xl transition-all"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" /> Удалить
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent className="bg-zinc-900 border-white/10 rounded-3xl shadow-2xl">
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle className="text-xl font-black">Удаление отчета</AlertDialogTitle>
                                                                    <AlertDialogDescription className="text-zinc-400 font-bold">
                                                                        Данное действие необратимо. Запись и все вложения будут стерты навсегда.
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter className="mt-6">
                                                                    <AlertDialogCancel className="h-12 rounded-2xl bg-white/5 border-white/5 text-[10px] font-black uppercase tracking-widest">Отмена</AlertDialogCancel>
                                                                    <AlertDialogAction
                                                                        className="h-12 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-rose-500/20"
                                                                        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: req.id, kind: isReportItem(req) ? 'report' : 'service_request' }); }}
                                                                    >
                                                                        Удалить навсегда
                                                                    </AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })}

                    {/* Load More Button */}
                    {(hasNextRequests || hasNextReports) && (
                        <div className="flex justify-center mt-6 mb-12">
                            <Button
                                variant="outline"
                                className="bg-zinc-900/50 text-white border-white/10 w-full md:w-auto px-12 h-14 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-white/10 transition-all shadow-inner"
                                onClick={() => {
                                    if (hasNextRequests) fetchNextRequests();
                                    if (hasNextReports) fetchNextReports();
                                }}
                                disabled={fetchingRequests || fetchingReports}
                            >
                                {(fetchingRequests || fetchingReports) ? (
                                    <>
                                        <Activity className="mr-2 h-4 w-4 animate-spin" />
                                        Загрузка...
                                    </>
                                ) : 'Загрузить еще'}
                            </Button>
                        </div>
                    )}

                    {filteredRequests.length === 0 && !isLoading && (
                        <div className="py-20 text-center">
                            <FileText className="h-12 w-12 text-white/10 mx-auto mb-4" />
                            <p className="text-white/30 font-bold">Ничего не найдено</p>
                        </div>
                    )}

                    {/* Infinite Scroll Trigger */}
                    {(hasNextRequests || fetchingRequests) && (
                        <div ref={observerTarget} className="py-10 flex justify-center">
                            <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        </div>
                    )}
                </div>

                {/* Edit Dialog */}
                {editingRequest && (
                    <Dialog open={!!editingRequest} onOpenChange={(o) => (!o && setEditingRequest(null))}>
                        <DialogContent
                            style={{
                                ['--dialog-content-max-width' as any]: '1200px',
                                width: 'min(1200px, calc(100vw - 1.5rem))',
                                maxWidth: '1200px',
                                maxHeight: 'calc(100vh - 1.5rem)',
                                height: 'min(920px, calc(100vh - 1.5rem))',
                            }}
                            className="w-full h-[100dvh] sm:h-auto sm:max-h-[calc(100vh-1.5rem)] sm:max-w-[1200px] flex flex-col p-0 gap-0 sm:rounded-3xl border-0 sm:border border-white/10 bg-zinc-950/95 backdrop-blur-3xl overflow-hidden z-[100] shadow-2xl"
                        >
                            {/* Progress Bar */}
                            {editingRequest && (() => {
                                const fields = (templates[editingRequest.type]?.fields || []).filter((f: any) => f.type !== 'separator' && f.id);
                                const requiredFields = fields.filter((f: any) => f.required);
                                const filledRequired = requiredFields.filter((f: any) => {
                                    const val = editFormData[f.id];
                                    return val !== undefined && val !== null && val !== '';
                                });
                                const progress = requiredFields.length > 0 ? (filledRequired.length / requiredFields.length) * 100 : 0;

                                return (
                                    <motion.div
                                        className="absolute top-0 left-0 right-0 h-1 bg-white/5 z-50"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                    >
                                        <motion.div
                                            className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${progress}%` }}
                                            transition={{ duration: 0.3, ease: "easeOut" }}
                                        />
                                    </motion.div>
                                );
                            })()}

                            <DialogHeader className="p-4 sm:p-6 md:p-7 pb-3 sm:pb-4 border-b border-white/5 shrink-0 relative">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <DialogTitle className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tighter text-white">Редактирование</DialogTitle>
                                        <p className="text-[10px] md:text-xs font-bold text-white/20 uppercase tracking-[0.2em] mt-1">Измените данные записи</p>
                                    </div>
                                    {editingRequest && (() => {
                                        const fields = (templates[editingRequest.type]?.fields || []).filter((f: any) => f.type !== 'separator' && f.id);
                                        const requiredFields = fields.filter((f: any) => f.required);
                                        const filledRequired = requiredFields.filter((f: any) => {
                                            const val = editFormData[f.id];
                                            return val !== undefined && val !== null && val !== '';
                                        });

                                        return requiredFields.length > 0 && (
                                            <motion.div
                                                className="flex flex-col items-end gap-1"
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                transition={{ delay: 0.2 }}
                                            >
                                                <div className="text-xs font-black text-white/60">
                                                    {filledRequired.length}/{requiredFields.length}
                                                </div>
                                                <div className="text-[9px] uppercase tracking-wider text-white/30">
                                                    обязательных
                                                </div>
                                            </motion.div>
                                        );
                                    })()}
                                </div>
                            </DialogHeader>

                            <div className="flex-1 overflow-y-auto">
                                <div className="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8">
                                    {/* Type Display */}
                                    <motion.div
                                        className="space-y-3"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3 }}
                                    >
                                        <Label className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] text-white/50 ml-1 flex items-center gap-2">
                                            <FileText className="h-3 w-3" />
                                            Тип записи
                                        </Label>
                                        <div className="p-3 sm:p-4 rounded-xl md:rounded-2xl bg-white/[0.03] border border-white/10 text-sm md:text-base font-bold text-white/80">
                                            {templates[editingRequest.type]?.name || editingRequest.type}
                                        </div>
                                    </motion.div>

                                    {/* Form Fields */}
                                    <AnimatePresence mode="wait">
                                        {editingRequest && (
                                            <motion.div
                                                key={editingRequest.type}
                                                className="space-y-4 sm:space-y-5"
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -20 }}
                                                transition={{ duration: 0.3, staggerChildren: 0.05 }}
                                            >
                                                {(templates[editingRequest.type]?.fields || []).map((field: any, idx: number) => {
                                                    if (field.type === 'separator') {
                                                        return (
                                                            <motion.div
                                                                key={idx}
                                                                className="pt-4 sm:pt-6 pb-2 border-b border-white/10 relative"
                                                                initial={{ opacity: 0, x: -20 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                transition={{ delay: idx * 0.03 }}
                                                            >
                                                                <h4 className="text-[10px] md:text-xs font-black text-primary/70 uppercase tracking-[0.25em] flex items-center gap-2">
                                                                    <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
                                                                    {field.label}
                                                                    <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent" />
                                                                </h4>
                                                            </motion.div>
                                                        );
                                                    }

                                                    if (field.condition && editFormData[field.condition.field] !== field.condition.value) {
                                                        return null;
                                                    }

                                                    const hasValue = editFormData[field.id] !== undefined && editFormData[field.id] !== null && editFormData[field.id] !== '';

                                                    return (
                                                        <motion.div
                                                            key={field.id}
                                                            className="space-y-2"
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, height: 0 }}
                                                            transition={{ delay: idx * 0.03 }}
                                                        >
                                                            <Label className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-white/50 ml-1 flex items-center gap-2">
                                                                {getFieldIcon(field)}
                                                                {field.label}
                                                                {field.required && (
                                                                    <span className="text-primary/60 text-xs">*</span>
                                                                )}
                                                                {hasValue && (
                                                                    <motion.div
                                                                        initial={{ scale: 0 }}
                                                                        animate={{ scale: 1 }}
                                                                        className="ml-auto"
                                                                    >
                                                                        <Check className="h-3 w-3 text-primary/60" />
                                                                    </motion.div>
                                                                )}
                                                            </Label>
                                                            <FieldInput
                                                                field={field}
                                                                value={editFormData[field.id]}
                                                                onChange={(val) => setEditFormData((prev: any) => ({ ...prev, [field.id!]: val }))}
                                                            />
                                                        </motion.div>
                                                    );
                                                })}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Footer with Submit Button */}
                            <div className="p-4 sm:p-6 md:p-7 border-t border-white/5 bg-zinc-900/60 backdrop-blur-3xl shrink-0">
                                {editingRequest && (() => {
                                    const fields = (templates[editingRequest.type]?.fields || []).filter((f: any) => f.type !== 'separator' && f.id);
                                    const requiredFields = fields.filter((f: any) => f.required);
                                    const filledRequired = requiredFields.filter((f: any) => {
                                        const val = editFormData[f.id];
                                        return val !== undefined && val !== null && val !== '';
                                    });
                                    const isComplete = requiredFields.length === 0 || filledRequired.length === requiredFields.length;

                                    return (
                                        <Button
                                            className={cn(
                                                "w-full h-12 sm:h-14 md:h-16 rounded-xl md:rounded-2xl font-black uppercase tracking-[0.3em] text-xs md:text-sm transition-all duration-500 group/btn-submit relative overflow-hidden",
                                                isComplete
                                                    ? "gradient-primary shadow-[0_20px_40px_rgba(var(--primary-rgb),0.3)] hover:shadow-[0_25px_50px_rgba(var(--primary-rgb),0.4)] hover:-translate-y-1 active:scale-95"
                                                    : "bg-white/5 text-white/30 cursor-not-allowed border border-white/10"
                                            )}
                                            onClick={() => editMutation.mutate({ id: editingRequest!.id, data: editFormData, type: editingRequest!.type, title: editingRequest!.title, kind: isReportItem(editingRequest) ? 'report' : 'service_request' })}
                                            disabled={editMutation.isPending || !isComplete}
                                        >
                                            <div className="relative z-10 flex items-center justify-center gap-3">
                                                {editMutation.isPending ? (
                                                    <>
                                                        <motion.div
                                                            animate={{ rotate: 360 }}
                                                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                                        >
                                                            <Clock className="h-5 w-5 md:h-6 md:w-6" />
                                                        </motion.div>
                                                        <span>Сохранение...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Check className={cn(
                                                            "h-5 w-5 md:h-7 md:w-7 transition-transform",
                                                            isComplete && "group-hover/btn-submit:scale-125"
                                                        )} />
                                                        <span>Сохранить изменения</span>
                                                        {!isComplete && requiredFields.length > 0 && (
                                                            <span className="text-[9px] opacity-60">
                                                                ({filledRequired.length}/{requiredFields.length})
                                                            </span>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                            {isComplete && !editMutation.isPending && (
                                                <motion.div
                                                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                                    initial={{ x: '-100%' }}
                                                    animate={{ x: '100%' }}
                                                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                                                />
                                            )}
                                        </Button>
                                    );
                                })()}
                            </div>
                        </DialogContent>
                    </Dialog>
                )}

                {/* Rejection Dialog */}
                {requestToReject && (
                    <AlertDialog open={!!requestToReject} onOpenChange={(o) => (!o && setRequestToReject(null))}>
                        <AlertDialogContent className="bg-zinc-950 border-white/10 rounded-2xl md:rounded-[2.5rem] shadow-2xl p-0 overflow-hidden max-w-[500px] z-[110]">
                            <AlertDialogHeader className="p-6 md:p-8 pb-0">
                                <AlertDialogTitle className="text-xl md:text-2xl font-black text-white tracking-tighter uppercase">Указать причину отказа</AlertDialogTitle>
                                <AlertDialogDescription className="text-[10px] md:text-xs font-bold text-white/30 uppercase tracking-[0.2em]">Это уведомление будет отправлено автору</AlertDialogDescription>
                            </AlertDialogHeader>

                            <div className="p-6 md:p-8 pt-0 space-y-6">
                                <div className="space-y-4">
                                    <div className="relative group/input">
                                        <div className="absolute top-4 left-4 p-1.5 rounded-lg bg-rose-500/10 text-rose-400 group-focus-within/input:bg-rose-500 group-focus-within/input:text-white transition-all duration-500">
                                            <MessageSquare className="h-4 w-4" />
                                        </div>
                                        <textarea
                                            value={rejectionReason}
                                            onChange={(e) => setRejectionReason(e.target.value)}
                                            placeholder="Введите причину отклонения..."
                                            className="w-full min-h-[120px] pl-14 pr-6 py-5 bg-white/5 border border-white/5 rounded-2xl md:rounded-3xl text-sm font-bold text-white placeholder:text-white/10 focus:border-rose-500/40 focus:bg-white/[0.08] transition-all duration-500 outline-none resize-none shadow-inner"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 md:gap-4 pt-2">
                                    <Button
                                        variant="ghost"
                                        className="flex-1 h-12 md:h-14 rounded-xl md:rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/5"
                                        onClick={() => setRequestToReject(null)}
                                    >
                                        Отмена
                                    </Button>
                                    <Button
                                        className="flex-1 h-12 md:h-14 rounded-xl md:rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-black uppercase tracking-widest text-[10px] shadow-xl shadow-rose-500/20 transition-all duration-500 disabled:opacity-50 disabled:grayscale"
                                        disabled={!rejectionReason.trim() || updateStatusMutation.isPending}
                                        onClick={() => {
                                            if (requestToReject) {
                                                updateStatusMutation.mutate({
                                                    id: requestToReject.id,
                                                    status: 'rejected',
                                                    reason: rejectionReason,
                                                    kind: requestToReject.kind
                                                });
                                            }
                                        }}
                                    >
                                        {updateStatusMutation.isPending ? 'Загрузка...' : 'ОТКАЗАТЬ'}
                                    </Button>
                                </div>
                            </div>
                        </AlertDialogContent>
                    </AlertDialog>
                )}

                {/* Manager Comment Dialog */}
                {requestToComment && (
                    <AlertDialog open={!!requestToComment} onOpenChange={(o) => (!o && setRequestToComment(null))}>
                        <AlertDialogContent className="bg-zinc-950 border-white/10 rounded-2xl md:rounded-[2.5rem] shadow-2xl p-0 overflow-hidden max-w-[520px] z-[110]">
                            <AlertDialogHeader className="p-6 md:p-8 pb-0">
                                <AlertDialogTitle className="text-xl md:text-2xl font-black text-white tracking-tighter uppercase">
                                    Комментарий к служебке
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-[10px] md:text-xs font-bold text-white/30 uppercase tracking-[0.2em]">
                                    Сотруднику придет полноэкранное уведомление с переходом в эту служебку
                                </AlertDialogDescription>
                            </AlertDialogHeader>

                            <div className="p-6 md:p-8 pt-0 space-y-6">
                                <div className="space-y-4">
                                    <div className="relative group/input">
                                        <div className="absolute top-4 left-4 p-1.5 rounded-lg bg-amber-500/10 text-amber-300 group-focus-within/input:bg-amber-500 group-focus-within/input:text-white transition-all duration-500">
                                            <MessageSquare className="h-4 w-4" />
                                        </div>
                                        <textarea
                                            value={managerComment}
                                            onChange={(e) => setManagerComment(e.target.value)}
                                            placeholder='Введите замечание...'
                                            className="w-full min-h-[120px] pl-14 pr-6 py-5 bg-white/5 border border-white/5 rounded-2xl md:rounded-3xl text-sm font-bold text-white placeholder:text-white/10 focus:border-amber-500/40 focus:bg-white/[0.08] transition-all duration-500 outline-none resize-none shadow-inner"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 md:gap-4 pt-2">
                                    <Button
                                        variant="ghost"
                                        className="flex-1 h-12 md:h-14 rounded-xl md:rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/5"
                                        onClick={() => setRequestToComment(null)}
                                    >
                                        Отмена
                                    </Button>
                                    <Button
                                        className="flex-1 h-12 md:h-14 rounded-xl md:rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black uppercase tracking-widest text-[10px] shadow-xl shadow-amber-500/20 transition-all duration-500 disabled:opacity-50 disabled:grayscale"
                                        disabled={!managerComment.trim() || addCommentMutation.isPending}
                                        onClick={() => {
                                            if (requestToComment) {
                                                addCommentMutation.mutate({
                                                    id: requestToComment.id,
                                                    comment: managerComment,
                                                    kind: requestToComment.kind,
                                                });
                                            }
                                        }}
                                    >
                                        {addCommentMutation.isPending ? 'Загрузка...' : 'ОТПРАВИТЬ КОММЕНТАРИЙ'}
                                    </Button>
                                </div>
                            </div>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </div>
        </MainLayout>
    );
};

export default memo(ServiceRequests);
