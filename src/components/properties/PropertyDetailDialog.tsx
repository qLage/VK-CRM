import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { usePropertyDetail, Property, PropertyUtilityDetails } from '@/hooks/useProperties';
import { useAuth } from '@/hooks/useAuth';
import { useClientAccessCheck } from '@/hooks/useClients';
import { localAPI } from '@/integrations/localAPI';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  MapPin, Pencil, Send, Check, Globe, ArrowRightLeft, ImageIcon, Plus, Loader2, Trash2,
  Building2, User as UserIcon, Calendar, Ruler, DoorOpen, Layers, ChevronLeft, ChevronRight, GripVertical, X,
  UserRound, Phone, Maximize2
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { PL } from './propertyLabels';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  onEdit: (p: Property) => void;
  onApprove: (p: Property) => void;
  onReject: (p: Property) => void;
  onTransfer: (p: Property) => void;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft:             { label: 'Черновик',         color: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/20' },
  pending_approval:  { label: 'На одобрении',     color: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20' },
  approved:          { label: 'Одобрен',          color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' },
  rejected:          { label: 'Отклонён',         color: 'bg-red-500/15 text-red-300 border-red-500/20' },
  avito_pending:     { label: 'Avito: ожидание',  color: 'bg-blue-500/15 text-blue-300 border-blue-500/20' },
  avito_approved:    { label: 'Avito: одобрен',   color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/20' },
  in_feed:           { label: 'Опубликован',      color: 'bg-indigo-500/15 text-indigo-200 border-indigo-500/20' },
  published_avito:   { label: 'Опубликован',      color: 'bg-indigo-500/15 text-indigo-200 border-indigo-500/20' },
  archive_pending:   { label: 'Архив: ожидание',  color: 'bg-orange-500/15 text-orange-300 border-orange-500/20' },
  archived:          { label: 'Архив',            color: 'bg-zinc-600/15 text-zinc-400 border-zinc-600/20' },
  transfer_pending:  { label: 'Передача',         color: 'bg-violet-500/15 text-violet-300 border-violet-500/20' },
};

export function PropertyDetailDialog({ open, onOpenChange, propertyId, onEdit, onApprove, onReject, onTransfer }: Props) {
  const { data: property, isLoading } = usePropertyDetail(open ? propertyId : null);
  const { user, accessLevel, profile } = useAuth();
  const { data: clientAccessCheck } = useClientAccessCheck();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [confirmDeletePhotoId, setConfirmDeletePhotoId] = useState<string | null>(null);

  // Auto-scroll thumbnails to keep active photo visible
  useLayoutEffect(() => {
    const container = thumbsRef.current;
    if (!container) return;
    const thumb = container.querySelector(`[data-thumb-index="${activePhoto}"]`) as HTMLElement | null;
    if (!thumb) return;
    const containerRect = container.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const thumbLeft = thumbRect.left - containerRect.left + container.scrollLeft;
    const scrollLeft = thumbLeft - containerRect.width / 2 + thumbRect.width / 2;
    container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
  }, [activePhoto]);

  // Fetch client data if property has client_id and user is not restricted
  const { data: clientData } = useQuery({
    queryKey: ['property-client', property?.id],
    queryFn: async () => {
      if (!(property as any)?.client_id) return null;
      const { data } = await localAPI.request(`/clients/${(property as any).client_id}`);
      return data;
    },
    enabled: !!property && !!(property as any)?.client_id && !clientAccessCheck?.restricted,
  });

  const isOwner = property?.owner_id === user?.id;
  const sameTeam = !!profile?.team_id && profile?.team_id === (property as any)?.team_id;
  // Editing rules: owner OR director OR commercial-in-branch OR team-leader-in-team — in ANY status.
  const canEditProperty = !!property && (
    isOwner ||
    accessLevel >= 100 ||
    (accessLevel >= 90 && profile?.branch_id === property.branch_id) ||
    (accessLevel >= 50 && sameTeam)
  );
  const canEditPhotos = canEditProperty;
  const isTransferRecipient = property?.status === 'transfer_pending' && property?.transfers?.some(
    (t: any) => t.to_user_id === user?.id && t.status === 'pending'
  );
  const pendingTransfer = property?.transfers?.find(
    (t: any) => t.status === 'pending'
  );
  const isDraft = property?.status === 'draft' || property?.status === 'rejected';
  const photos = property?.photos || [];

  const handleUploadPhotos = async (files: FileList) => {
    if (!property) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach(f => formData.append('photos', f));
      const token = localStorage.getItem('auth_token');
      const base = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || `${window.location.protocol}//127.0.0.1:5000/api`);
      const resp = await fetch(`${base}/properties/${property.id}/photos`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = json?.error?.message || json?.message || `Ошибка ${resp.status}`;
        throw new Error(msg);
      }
      toast.success('Фото загружены');
      queryClient.invalidateQueries({ queryKey: ['property-detail', property.id] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    } catch (e: any) {
      console.error('Photo upload error:', e);
      toast.error(e?.message || 'Ошибка загрузки фото');
    }
    setUploading(false);
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!property) return;
    try {
      const { error } = await localAPI.request(`/properties/${property.id}/photos/${photoId}`, { method: 'DELETE' });
      if (error) throw error;
      toast.success('Фото удалено');
      if (activePhoto >= photos.length - 1) setActivePhoto(0);
      queryClient.invalidateQueries({ queryKey: ['property-detail', property.id] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    } catch {
      toast.error('Ошибка удаления');
    }
  };

  const st = property ? STATUS_LABEL[property.status] || STATUS_LABEL.draft : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl bg-zinc-950 border-white/5 p-0 flex flex-col">
        {isLoading || !property ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-white/30" />
          </div>
        ) : (
          <>
            {/* Photo gallery hero */}
            <div className="relative aspect-[16/10] bg-gradient-to-br from-zinc-800 to-zinc-900 overflow-hidden flex-shrink-0">
              {photos.length > 0 ? (
                <>
                  <img
                    src={photos[activePhoto]?.file_url}
                    alt=""
                    className="w-full h-full object-cover cursor-zoom-in"
                    onClick={() => setLightboxOpen(true)}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-transparent to-zinc-950/30" />

                  {/* Fullscreen button */}
                  <button
                    onClick={() => setLightboxOpen(true)}
                    title="Открыть на весь экран"
                    className="absolute bottom-3 right-3 p-2 rounded-lg bg-black/55 backdrop-blur-md text-white/90 hover:bg-black/80 border border-white/10"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>

                  {/* Delete current photo (only for editors) — well-visible position */}
                  {canEditPhotos && (
                    <button
                      onClick={() => setConfirmDeletePhotoId(photos[activePhoto].id)}
                      title="Удалить фото"
                      className="absolute bottom-3 right-14 p-2 rounded-lg bg-red-600/80 hover:bg-red-600 backdrop-blur-md text-white border border-red-400/30 shadow-lg"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}

                  {photos.length > 1 && (
                    <>
                      <button
                        onClick={() => setActivePhoto(p => (p - 1 + photos.length) % photos.length)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 backdrop-blur-md text-white hover:bg-black/70"
                      ><ChevronLeft className="h-4 w-4" /></button>
                      <button
                        onClick={() => setActivePhoto(p => (p + 1) % photos.length)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 backdrop-blur-md text-white hover:bg-black/70"
                      ><ChevronRight className="h-4 w-4" /></button>
                    </>
                  )}

                  {/* Micro-gallery removed — use the main thumbnail strip below */}
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20">
                  <Building2 className="h-16 w-16 mb-2" />
                  <p className="text-xs font-bold uppercase tracking-widest">Нет фотографий</p>
                </div>
              )}

              {/* Status badge floating */}
              {st && (
                <div className="absolute top-3 left-3">
                  <div className={cn("px-3 py-1.5 rounded-lg backdrop-blur-md border text-[10px] font-black uppercase tracking-widest", st.color)}>
                    {st.label}
                  </div>
                </div>
              )}
            </div>

            {/* Photo upload row + thumbnails (drag&drop reorder) */}
            {(canEditPhotos || photos.length > 0) && (
              <div className="px-6 py-3 border-b border-white/5 bg-zinc-900/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Фото {photos.length}/50</span>
                  {canEditPhotos && photos.length < 50 && (
                    <>
                      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => e.target.files && handleUploadPhotos(e.target.files)} />
                      <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="h-7 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary hover:bg-primary/10 gap-1.5">
                        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Загрузить
                      </Button>
                    </>
                  )}
                </div>

                {/* Thumbnails with drag&drop reorder */}
                {photos.length > 0 && (
                  <DragDropContext
                    onDragEnd={async (result) => {
                      if (!canEditPhotos) return;
                      if (!result.destination) return;
                      const items = Array.from(photos);
                      const [moved] = items.splice(result.source.index, 1);
                      items.splice(result.destination.index, 0, moved);
                      // Optimistic UI: update cache immediately
                      queryClient.setQueryData(['property-detail', property.id], (old: any) =>
                        old ? { ...old, photos: items } : old
                      );
                      setActivePhoto(items.findIndex(p => p.id === photos[activePhoto]?.id));
                      try {
                        const { error } = await localAPI.request(`/properties/${property.id}/photos/reorder`, {
                          method: 'PUT',
                          body: { photo_ids: items.map(p => p.id) },
                        });
                        if (error) throw error;
                        queryClient.invalidateQueries({ queryKey: ['properties'] });
                      } catch {
                        toast.error('Не удалось сохранить порядок');
                        queryClient.invalidateQueries({ queryKey: ['property-detail', property.id] });
                      }
                    }}
                  >
                    <Droppable droppableId="photos" direction="horizontal">
                      {(provided) => (
                        <div
                          ref={(el) => { provided.innerRef(el); thumbsRef.current = el; }}
                          {...provided.droppableProps}
                          className="flex gap-2 overflow-x-auto py-2 -mx-1 px-1 scrollbar-hide"
                        >
                          {photos.map((photo, idx) => (
                            <Draggable key={photo.id} draggableId={photo.id} index={idx} isDragDisabled={!canEditPhotos}>
                              {(prov, snap) => (
                                <div
                                  ref={(el) => { prov.innerRef(el); }}
                                  {...prov.draggableProps}
                                  {...prov.dragHandleProps}
                                  className={cn(
                                    "relative w-20 h-20 rounded-lg overflow-hidden cursor-pointer flex-shrink-0 border-2 transition-all group bg-zinc-900",
                                    canEditPhotos && "active:cursor-grabbing",
                                    snap.isDragging ? "border-primary scale-110 shadow-2xl z-50" : (activePhoto === idx ? "border-primary" : "border-white/5 hover:border-white/30")
                                  )}
                                  data-thumb-index={idx}
                                  style={{ aspectRatio: '1 / 1', ...prov.draggableProps.style }}
                                >
                                  <img src={photo.file_url} alt="" className="absolute inset-0 w-full h-full object-cover" onClick={() => setActivePhoto(idx)} />
                                  {idx === 0 && (
                                    <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-primary/90 rounded text-[8px] font-black text-white uppercase tracking-wider z-10">Гл</div>
                                  )}
                                  {canEditPhotos && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setConfirmDeletePhotoId(photo.id); }}
                                      className="absolute top-1 right-1 p-1 rounded bg-red-600/90 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                      title="Удалить"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                  {canEditPhotos && (
                                    <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-80 z-10">
                                      <GripVertical className="h-3 w-3 text-white drop-shadow" />
                                    </div>
                                  )}
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                )}
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <SheetHeader className="space-y-2">
                <SheetTitle className="text-3xl md:text-4xl font-black text-white tracking-tighter tabular-nums">
                  {Number(property.price).toLocaleString('ru-RU')} <span className="text-white/30 text-2xl">₽</span>
                </SheetTitle>
                <div className="flex items-center gap-2 text-sm text-white/70">
                  <MapPin className="h-4 w-4 text-white/40" />
                  <span>{property.address || property.city || 'Адрес не указан'}</span>
                </div>
              </SheetHeader>

              {/* Specs grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  property.area_total ? { icon: Ruler, label: 'Площадь', value: `${property.area_total} м²` } : null,
                  property.rooms ? { icon: DoorOpen, label: 'Комнат', value: String(property.rooms) } : null,
                  property.floor ? { icon: Layers, label: 'Этаж', value: `${property.floor}/${property.floors_total || '?'}` } : null,
                  property.area_kitchen ? { icon: ImageIcon, label: 'Кухня', value: `${property.area_kitchen} м²` } : null,
                  (property as any).land_area ? { icon: Ruler, label: 'Участок', value: `${(property as any).land_area} сот.` } : null,
                  property.floors_total && !property.floor ? { icon: Layers, label: 'Этажность', value: String(property.floors_total) } : null,
                ].filter(Boolean).map(spec => {
                  const Icon = spec!.icon;
                  return (
                    <div key={spec!.label} className="p-3 rounded-xl bg-zinc-900/60 border border-white/5">
                      <Icon className="h-3.5 w-3.5 text-white/40 mb-1.5" />
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">{spec!.label}</p>
                      <p className="text-sm font-black text-white tabular-nums mt-0.5">{spec!.value}</p>
                    </div>
                  );
                })}
              </div>

              {/* Description */}
              {property.description && (
                <div className="p-4 rounded-xl bg-zinc-900/40 border border-white/5">
                  <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Описание</p>
                  <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{property.description}</p>
                </div>
              )}

              {/* Characteristics */}
              <PropertyCharacteristics property={property} />

              {/* Owner / context */}
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-white/5 space-y-2">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Информация</p>
                <div className="flex items-center gap-2 text-sm">
                  <UserIcon className="h-4 w-4 text-white/40" />
                  <span className="text-white/60">Владелец:</span>
                  <span className="text-white font-medium">{property.owner_name}</span>
                </div>
                {property.branch_name && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-white/40" />
                    <span className="text-white/60">Филиал:</span>
                    <span className="text-white">{property.branch_name}</span>
                    {property.team_name && <span className="text-white/40">· {property.team_name}</span>}
                  </div>
                )}
                {property.created_at && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-white/40" />
                    <span className="text-white/60">Создан:</span>
                    <span className="text-white">{new Date(property.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  </div>
                )}
              </div>

              {/* Client info (hidden if restricted) */}
              {!clientAccessCheck?.restricted && clientData && (
                <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 space-y-2">
                  <p className="text-[10px] font-black text-violet-300/70 uppercase tracking-widest mb-2">Клиент</p>
                  <div className="flex items-center gap-2 text-sm">
                    <UserRound className="h-4 w-4 text-violet-400/60" />
                    <span className="text-white font-medium">{(clientData as any).full_name}</span>
                  </div>
                  {(clientData as any).phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-violet-400/60" />
                      <span className="text-white/80">{(clientData as any).phone}</span>
                    </div>
                  )}
                </div>
              )}

              {property.rejection_reason && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-[10px] font-black text-red-300/70 uppercase tracking-widest mb-1">Причина отклонения</p>
                  <p className="text-sm text-red-200">{property.rejection_reason}</p>
                </div>
              )}

              {/* Transfers */}
              {property.transfers && property.transfers.length > 0 && (
                <div className="p-4 rounded-xl bg-zinc-900/40 border border-white/5">
                  <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3">История передач</p>
                  <div className="space-y-2">
                    {property.transfers.map(t => (
                      <div key={t.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-white/5">
                        <span className="text-white/80">{t.from_name} → {t.to_name}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{t.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action footer */}
            <div className="border-t border-white/5 p-4 flex flex-wrap gap-2 bg-zinc-950">
              {canEditProperty && (
                <Button size="sm" variant="outline" className="rounded-xl border-white/10 gap-1.5 text-xs" onClick={() => onEdit(property)}>
                  <Pencil className="h-3.5 w-3.5" /> Редактировать
                </Button>
              )}
              {isOwner && isDraft && (
                <Button size="sm" className="rounded-xl bg-primary hover:bg-primary/90 text-white gap-1.5 text-xs font-bold" onClick={() => {
                  localAPI.request(`/properties/${property.id}/submit`, { method: 'PATCH' }).then(() => {
                    toast.success('Отправлено на одобрение');
                    queryClient.invalidateQueries({ queryKey: ['properties'] });
                    queryClient.invalidateQueries({ queryKey: ['property-detail', property.id] });
                  });
                }}>
                  <Send className="h-3.5 w-3.5" /> На одобрение
                </Button>
              )}
              {(property.status === 'pending_approval' || property.status === 'avito_pending' || property.status === 'archive_pending') && accessLevel >= 50 && (
                <>
                  <Button size="sm" className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs font-bold" onClick={() => { onOpenChange(false); onApprove(property); }}>
                    <Check className="h-3.5 w-3.5" /> Одобрить
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-xl border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200 gap-1.5 text-xs font-bold" onClick={() => { onOpenChange(false); onReject(property); }}>
                    <X className="h-3.5 w-3.5" /> Отклонить
                  </Button>
                </>
              )}
              {/* Add to Avito feed (commercial+ only) */}
              {accessLevel >= 90 && ['approved', 'avito_approved', 'avito_pending'].includes(property.status) && (
                <Button
                  size="sm"
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 text-xs font-bold"
                  onClick={async () => {
                    try {
                      const { error } = await localAPI.request(`/avito/publish/${property.id}`, { method: 'POST' });
                      if (error) throw error;
                      toast.success('Объект опубликован');
                      queryClient.invalidateQueries({ queryKey: ['properties'] });
                      queryClient.invalidateQueries({ queryKey: ['property-detail', property.id] });
                    } catch (e: any) {
                      toast.error(e?.message || 'Ошибка');
                    }
                  }}
                >
                  <Globe className="h-3.5 w-3.5" /> Опубликовать
                </Button>
              )}
              {/* Remove from feed */}
              {accessLevel >= 90 && ((property as any).avito_feed_enabled || property.status === 'in_feed') && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl border-red-500/30 text-red-300 hover:bg-red-500/10 gap-1.5 text-xs"
                  onClick={async () => {
                    try {
                      await localAPI.request(`/avito/unpublish/${property.id}`, { method: 'POST' });
                      toast.success('Снято с публикации');
                      queryClient.invalidateQueries({ queryKey: ['properties'] });
                      queryClient.invalidateQueries({ queryKey: ['property-detail', property.id] });
                    } catch (e: any) {
                      toast.error(e?.message || 'Ошибка');
                    }
                  }}
                >
                  <X className="h-3.5 w-3.5" /> Снять с публикации
                </Button>
              )}
              {(property as any).avito_url && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 gap-1.5 text-xs"
                  onClick={() => window.open((property as any).avito_url, '_blank')}
                >
                  <Globe className="h-3.5 w-3.5" /> Открыть на Avito
                </Button>
              )}
              {isOwner && property.status === 'approved' && (
                <Button size="sm" variant="outline" className="rounded-xl border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 gap-1.5 text-xs" onClick={() => {
                  localAPI.request(`/properties/${property.id}/avito-request`, { method: 'PATCH' }).then(() => {
                    toast.success('Запрос на Avito отправлен');
                    queryClient.invalidateQueries({ queryKey: ['properties'] });
                  });
                }}>
                  <Globe className="h-3.5 w-3.5" /> Опубликовать
                </Button>
              )}
              {isOwner && !['archived', 'archive_pending', 'transfer_pending'].includes(property.status) && (
                <Button size="sm" variant="outline" className="rounded-xl border-white/10 gap-1.5 text-xs" onClick={() => onTransfer(property)}>
                  <ArrowRightLeft className="h-3.5 w-3.5" /> Передать
                </Button>
              )}
              {isTransferRecipient && pendingTransfer && (
                <>
                  <Button size="sm" className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs font-bold" onClick={async () => {
                    try {
                      const { error } = await localAPI.request(`/properties/transfers/${pendingTransfer.id}`, { method: 'PATCH', body: { action: 'accept' } });
                      if (error) throw error;
                      toast.success('Объект принят');
                      queryClient.invalidateQueries({ queryKey: ['properties'] });
                      queryClient.invalidateQueries({ queryKey: ['property-detail', property.id] });
                    } catch { toast.error('Ошибка'); }
                  }}>
                    <Check className="h-3.5 w-3.5" /> Принять
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-xl border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200 gap-1.5 text-xs font-bold" onClick={async () => {
                    try {
                      const { error } = await localAPI.request(`/properties/transfers/${pendingTransfer.id}`, { method: 'PATCH', body: { action: 'reject' } });
                      if (error) throw error;
                      toast.success('Передача отклонена');
                      queryClient.invalidateQueries({ queryKey: ['properties'] });
                      queryClient.invalidateQueries({ queryKey: ['property-detail', property.id] });
                    } catch { toast.error('Ошибка'); }
                  }}>
                    <X className="h-3.5 w-3.5" /> Отклонить
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>

      {/* Fullscreen lightbox */}
      {property && photos.length > 0 && (
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent className="inset-0 w-screen h-screen max-w-none !max-h-none !overflow-hidden rounded-none p-0 bg-black border-0 flex items-center justify-center md:inset-0 md:translate-x-0 md:translate-y-0 md:w-screen md:h-screen md:max-w-none md:rounded-none [&>button:last-child]:hidden">
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-4 right-4 z-50 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md"
              title="Закрыть"
            >
              <X className="h-5 w-5" />
            </button>
            {photos.length > 1 && (
              <>
                <button
                  onClick={() => setActivePhoto(p => (p - 1 + photos.length) % photos.length)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-50 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={() => setActivePhoto(p => (p + 1) % photos.length)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-50 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
            <img
              src={photos[activePhoto]?.file_url}
              alt=""
              className="max-w-full max-h-full object-contain select-none"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-white text-xs font-bold tabular-nums">
              {activePhoto + 1} / {photos.length}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete-photo confirmation */}
      <Dialog open={!!confirmDeletePhotoId} onOpenChange={(o) => { if (!o) setConfirmDeletePhotoId(null); }}>
        <DialogContent className="sm:max-w-md rounded-2xl bg-zinc-950 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white font-black uppercase tracking-widest text-base">Удалить фото?</DialogTitle>
            <DialogDescription className="text-white/50 text-sm">Это действие нельзя отменить.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="rounded-xl border-white/10" onClick={() => setConfirmDeletePhotoId(null)}>Отмена</Button>
            <Button
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => {
                if (confirmDeletePhotoId) {
                  await handleDeletePhoto(confirmDeletePhotoId);
                  setConfirmDeletePhotoId(null);
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROPERTY CHARACTERISTICS (view mode)
   ═══════════════════════════════════════════════════════════════════════════ */

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-xs text-white/40 shrink-0">{label}</span>
      <span className="text-sm text-white font-medium text-right">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const hasContent = React.Children.toArray(children).some(
    (c) => c !== null && c !== undefined && c !== false
  );
  if (!hasContent) return null;
  return (
    <div className="p-4 rounded-xl bg-zinc-900/40 border border-white/5 space-y-0.5">
      <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">{title}</p>
      {children}
    </div>
  );
}

function PropertyCharacteristics({ property }: { property: Property }) {
  const cat = property.category;
  const isApt = cat === 'apartment_sell' || cat === 'apartment_rent';
  const isHouse = cat === 'house';
  const isLand = cat === 'land';
  const isCommercial = cat === 'commercial';
  const isRent = cat === 'apartment_rent';
  const ud = property.utility_details as PropertyUtilityDetails | null | undefined;

  return (
    <>
      {/* Category & deal */}
      <Section title="Основное">
        {PL.category(cat) && <DetailRow label="Категория" value={PL.category(cat)} />}
        {property.deal_type && <DetailRow label="Тип сделки" value={property.deal_type} />}
        {property.sale_options && <DetailRow label="Условия продажи" value={property.sale_options} />}
        {property.apartment_type && <DetailRow label="Тип жилья" value={PL.apartmentType(property.apartment_type)} />}
        {property.room_type && <DetailRow label="Тип комнат" value={property.room_type} />}
        {property.object_type && isHouse && <DetailRow label="Тип объекта" value={PL.houseObjectType(property.object_type)} />}
        {property.commercial_type && isCommercial && <DetailRow label="Тип коммерции" value={PL.commercialType(property.commercial_type)} />}
        {property.land_status && (isLand || isHouse) && <DetailRow label="Статус земли" value={PL.landStatus(property.land_status)} />}
      </Section>

      {/* Building */}
      {(isApt || isHouse || isCommercial) && (
        <Section title="Здание">
          {property.house_type && <DetailRow label="Тип дома" value={PL.houseType(property.house_type)} />}
          {property.walls_type && isHouse && <DetailRow label="Материал стен" value={PL.wallsType(property.walls_type)} />}
          {property.year_built && <DetailRow label="Год постройки" value={property.year_built} />}
          {property.renovation && <DetailRow label="Ремонт" value={PL.renovation(property.renovation)} />}
          {property.ceiling_height && <DetailRow label="Высота потолков" value={`${property.ceiling_height} м`} />}
        </Section>
      )}

      {/* Layout */}
      {(isApt || isHouse) && (
        <Section title="Планировка">
          {property.bathroom && <DetailRow label="Санузел" value={isHouse ? PL.houseBathroom(property.bathroom) : PL.bathroom(property.bathroom)} />}
          {property.bathroom_location && isHouse && <DetailRow label="Расположение санузла" value={PL.houseBathroom(property.bathroom_location)} />}
          {property.balcony && <DetailRow label="Балкон / лоджия" value={PL.balcony(property.balcony)} />}
          {property.view_from_window && <DetailRow label="Вид из окон" value={PL.view(property.view_from_window)} />}
        </Section>
      )}

      {/* Elevators & parking */}
      {(isApt || isCommercial) && (
        <Section title="Инфраструктура дома">
          {typeof property.passenger_elevator_count === 'number' && (
            <DetailRow label="Пассажирских лифтов" value={property.passenger_elevator_count === 0 ? 'Нет' : property.passenger_elevator_count} />
          )}
          {typeof property.freight_elevator_count === 'number' && (
            <DetailRow label="Грузовых лифтов" value={property.freight_elevator_count === 0 ? 'Нет' : property.freight_elevator_count} />
          )}
          {property.parking && <DetailRow label="Парковка" value={PL.parking(property.parking)} />}
        </Section>
      )}

      {/* Utilities (houses) */}
      {isHouse && ud && (
        <Section title="Коммуникации">
          {ud.water_supply_type && <DetailRow label="Водоснабжение" value={PL.waterSupply(ud.water_supply_type)} />}
          {ud.sewerage_type && <DetailRow label="Канализация" value={PL.sewerage(ud.sewerage_type)} />}
          {ud.gas_supply_type && <DetailRow label="Газоснабжение" value={PL.gasSupply(ud.gas_supply_type)} />}
          {ud.heating_type && <DetailRow label="Отопление" value={PL.heating(ud.heating_type)} />}
          {ud.electricity && <DetailRow label="Электричество" value={PL.electricity(ud.electricity)} />}
        </Section>
      )}

      {/* Rent conditions */}
      {isRent && (
        <Section title="Условия аренды">
          {property.furniture && <DetailRow label="Мебель" value={PL.furniture(property.furniture)} />}
          {property.prepayment && <DetailRow label="Предоплата" value={PL.prepayment(property.prepayment)} />}
          {property.lease_term && <DetailRow label="Срок аренды" value={PL.leaseTerm(property.lease_term)} />}
          {property.deposit_amount && <DetailRow label="Залог" value={property.deposit_amount} />}
        </Section>
      )}

      {/* Appliances & amenities */}
      {isRent && (
        <Section title="Бытовая техника и удобства">
          {property.conditioner && <DetailRow label="Кондиционер" value={PL.yesNo(property.conditioner)} />}
          {property.washing_machine && <DetailRow label="Стиральная машина" value={PL.yesNo(property.washing_machine)} />}
          {property.fridge && <DetailRow label="Холодильник" value={PL.yesNo(property.fridge)} />}
          {property.internet && <DetailRow label="Интернет" value={PL.yesNo(property.internet)} />}
          {property.dishwasher && <DetailRow label="Посудомоечная машина" value={PL.yesNo(property.dishwasher)} />}
          {property.tv && <DetailRow label="Телевизор" value={PL.yesNo(property.tv)} />}
        </Section>
      )}

      {/* Rules */}
      {isRent && (
        <Section title="Правила проживания">
          {property.pets_allowed && <DetailRow label="Можно с животными" value={PL.yesNo(property.pets_allowed)} />}
          {property.children_allowed && <DetailRow label="Можно с детьми" value={PL.yesNo(property.children_allowed)} />}
          {property.smoking_allowed && <DetailRow label="Можно курить" value={PL.yesNo(property.smoking_allowed)} />}
        </Section>
      )}

      {/* Tenant requirements */}
      {isRent && property.tenant_requirements && (
        <div className="p-4 rounded-xl bg-zinc-900/40 border border-white/5">
          <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Требования к арендаторам</p>
          <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{property.tenant_requirements}</p>
        </div>
      )}

      {/* Infrastructure & transport */}
      {(property.infrastructure || property.transport_accessibility) && (
        <Section title="Окружение">
          {property.infrastructure && <DetailRow label="Инфраструктура" value={property.infrastructure} />}
          {property.transport_accessibility && <DetailRow label="Транспортная доступность" value={property.transport_accessibility} />}
        </Section>
      )}
    </>
  );
}
