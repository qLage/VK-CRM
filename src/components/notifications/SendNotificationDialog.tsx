import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Send, Users, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { localAPI } from '@/integrations/localAPI';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useSharedData, useEmployeesData } from '@/hooks/useSharedData';

interface SendNotificationDialogProps {
  trigger?: React.ReactNode;
}

export function SendNotificationDialog({ trigger }: SendNotificationDialogProps) {
  const { profile, accessLevel } = useAuth();
  const { branches, teams } = useSharedData();
  const { data: employees = [] } = useEmployeesData();
  
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<'all' | 'one'>('all');
  
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<string>('');
  
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'warning' | 'error'>('info');
  const [isForced, setIsForced] = useState(false);

  const isDirectorOrAdmin = accessLevel >= 90;
  const userBranchId = profile?.branch_id || '';

  // Filter logic
  const availableBranches = useMemo(() => {
    if (isDirectorOrAdmin) return branches;
    return branches.filter((b: any) => b.id === userBranchId);
  }, [branches, isDirectorOrAdmin, userBranchId]);

  const availableTeams = useMemo(() => {
    const branchToFilter = isDirectorOrAdmin ? selectedBranch : userBranchId;
    if (branchToFilter === 'all' || !branchToFilter) return [];
    return teams.filter((t: any) => t.branch_id === branchToFilter);
  }, [teams, isDirectorOrAdmin, selectedBranch, userBranchId]);

  const filteredEmployees = useMemo(() => {
    let list = employees.filter((e: any) => e.is_active);
    const branchToFilter = isDirectorOrAdmin ? selectedBranch : userBranchId;
    
    if (branchToFilter && branchToFilter !== 'all') {
      list = list.filter((e: any) => e.branch_id === branchToFilter);
    }
    if (selectedTeam && selectedTeam !== 'all') {
      list = list.filter((e: any) => e.team_id === selectedTeam);
    }
    return list;
  }, [employees, isDirectorOrAdmin, selectedBranch, userBranchId, selectedTeam]);

  const handleSend = async () => {
    if (!title || !message) {
      toast.error('Заполните заголовок и текст уведомления');
      return;
    }

    setSending(true);
    try {
      const payload: any = {
        title,
        message,
        type,
        is_forced: isForced
      };

      if (mode === 'all') {
        payload.branch_id = isDirectorOrAdmin ? selectedBranch : userBranchId;
        payload.team_id = selectedTeam;
      } else {
        if (!selectedUser) {
          toast.error('Выберите сотрудника');
          setSending(false);
          return;
        }
        payload.user_id = selectedUser;
      }

      const { error } = await localAPI.request('/notifications/send', {
        method: 'POST',
        body: payload,
      });

      if (error) throw error;
      
      toast.success(mode === 'all' ? 'Уведомление отправлено всем выбранным адресатам' : 'Уведомление отправлено');

      setTitle('');
      setMessage('');
      setSelectedUser('');
      setSelectedBranch('all');
      setSelectedTeam('all');
      setIsForced(false);
      setOpen(false);
    } catch (error) {
      console.error('Error sending notification:', error);
      toast.error('Ошибка отправки уведомления');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Send className="h-4 w-4" />
            Уведомление
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl bg-zinc-900/40 backdrop-blur-3xl border-white/5 rounded-[2rem] p-0 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="p-6 pb-4 shrink-0 border-b border-white/5 bg-transparent">
          <DialogTitle className="flex items-center gap-3 text-xl font-black uppercase tracking-tighter italic text-white">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            Отправить уведомление
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable Form Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {/* Mode selector */}
          <div className="flex p-1 bg-white/[0.03] rounded-2xl border border-white/5 shrink-0">
            <button
              onClick={() => setMode('all')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all duration-300 font-black uppercase text-[10px] tracking-widest",
                mode === 'all' ? "bg-primary text-white shadow-lg" : "text-white/40 hover:text-white/60"
              )}
            >
              <Users className="h-3.5 w-3.5" />
              Всем
            </button>
            <button
              onClick={() => setMode('one')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all duration-300 font-black uppercase text-[10px] tracking-widest",
                mode === 'one' ? "bg-primary text-white shadow-lg" : "text-white/40 hover:text-white/60"
              )}
            >
              <User className="h-3.5 w-3.5" />
              Одному
            </button>
          </div>

          <div className="space-y-5">
            {/* Branch Selector */}
            {(isDirectorOrAdmin || mode === 'all') && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <Label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Филиал</Label>
                <Select 
                  value={(mode === 'one' && selectedBranch === 'all') ? '' : (isDirectorOrAdmin ? selectedBranch : userBranchId)} 
                  onValueChange={(val: any) => {
                    setSelectedBranch(val);
                    setSelectedTeam('all');
                    setSelectedUser('');
                  }}
                  disabled={!isDirectorOrAdmin}
                >
                  <SelectTrigger className="bg-white/5 border-white/5 h-12 md:h-14 font-black uppercase">
                    <SelectValue placeholder="Выберите филиал" />
                  </SelectTrigger>
                  <SelectContent>
                    {isDirectorOrAdmin && mode === 'all' && <SelectItem value="all">Все филиалы</SelectItem>}
                    {availableBranches.map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Team Selector */}
            <AnimatePresence>
              {(selectedBranch !== 'all' || !isDirectorOrAdmin) && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Команда</Label>
                  <Select 
                    value={(mode === 'one' && selectedTeam === 'all') ? '' : selectedTeam} 
                    onValueChange={(val: any) => {
                      setSelectedTeam(val);
                      setSelectedUser('');
                    }}
                  >
                    <SelectTrigger className="bg-white/5 border-white/5 h-12 md:h-14 font-black uppercase">
                      <SelectValue placeholder="Выберите команду" />
                    </SelectTrigger>
                    <SelectContent>
                      {mode === 'all' && <SelectItem value="all">Все команды</SelectItem>}
                      {availableTeams.map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </motion.div>
              )}
            </AnimatePresence>

            {/* User Selector */}
            <AnimatePresence>
              {mode === 'one' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Сотрудник</Label>
                  <Select value={selectedUser} onValueChange={setSelectedUser}>
                    <SelectTrigger className="bg-white/5 border-white/5 h-12 md:h-14 font-black uppercase">
                      <SelectValue placeholder="Выберите сотрудника" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredEmployees.map((emp: any) => (
                        <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>
                      ))}
                      {filteredEmployees.length === 0 && (
                        <div className="p-4 text-center text-[10px] font-black uppercase text-white/20 italic">Нет доступных сотрудников</div>
                      )}
                    </SelectContent>
                  </Select>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Type selector */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Тип уведомления</Label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger className="bg-white/5 border-white/5 h-12 md:h-14 font-black uppercase">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Информация</SelectItem>
                  <SelectItem value="success">Успех</SelectItem>
                  <SelectItem value="warning">Предупреждение</SelectItem>
                  <SelectItem value="error">Ошибка</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Заголовок</Label>
              <Input
                value={title}
                onChange={(e: any) => setTitle(e.target.value)}
                placeholder="Громкий заголовок..."
                className="bg-white/5 border-white/5 rounded-xl h-12 md:h-14 font-black uppercase tracking-tight placeholder:opacity-20"
              />
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Текст сообщения</Label>
              <Textarea
                value={message}
                onChange={(e: any) => setMessage(e.target.value)}
                placeholder="Введите текст уведомления..."
                rows={3}
                className="bg-white/5 border-white/5 rounded-2xl font-medium leading-relaxed placeholder:opacity-20 resize-none min-h-[100px]"
              />
            </div>

            {/* Forced notification checkbox */}
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/10 transition-all hover:bg-primary/10 group/forced">
              <Checkbox 
                id="forced-toggle" 
                checked={isForced} 
                onCheckedChange={(checked) => setIsForced(!!checked)}
                className="w-5 h-5 rounded-lg border-primary/30 data-[state=checked]:bg-primary transition-all duration-300"
              />
              <div className="flex flex-col gap-0.5 cursor-pointer" onClick={() => setIsForced(!isForced)}>
                <Label 
                  htmlFor="forced-toggle" 
                  className="text-[10px] font-black uppercase tracking-widest text-primary cursor-pointer select-none"
                >
                  Принудительное уведомление
                </Label>
                <p className="text-[9px] font-bold text-white/20 uppercase tracking-tight">Откроется на весь экран у получателя</p>
              </div>
            </div>
          </div>
        </div>

        {/* Fixed Actions at Bottom */}
        <div className="p-6 pt-4 border-t border-white/5 bg-transparent shrink-0">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-12 md:h-14 rounded-2xl border-white/10 text-white/60 font-black uppercase tracking-widest text-[10px] hover:bg-white/5"
              onClick={() => setOpen(false)}
              disabled={sending}
            >
              Отмена
            </Button>
            <Button
              className="flex-1 h-12 md:h-14 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20"
              onClick={handleSend}
              disabled={sending}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Отправить
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
