import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Phone, Mail, Eye, EyeOff, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';


type LoginMode = 'phone' | 'email';

const AuroraBackground = () => {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-zinc-950">
      <div className="absolute inset-0 opacity-40">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-600/20 rounded-full mix-blend-screen filter blur-[128px] animate-pulse-slow" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-teal-600/20 rounded-full mix-blend-screen filter blur-[128px] animate-pulse-slow delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.05),transparent_50%)]" />
      </div>

      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

      {/* Subtle Noise Gradient */}
      <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#ffffff_1px,transparent_1px)] bg-[size:2px_2px]" />
    </div>
  );
};

export default function Auth() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [mode, setMode] = useState<LoginMode>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const digits = value.replace(/\D/g, '');

    // Format without +7 prefix since we display it separately
    if (digits.length === 0) {
      setPhone('');
    } else if (digits.length <= 3) {
      setPhone(`(${digits}`);
    } else if (digits.length <= 6) {
      setPhone(`(${digits.slice(0, 3)}) ${digits.slice(3)}`);
    } else if (digits.length <= 8) {
      setPhone(`(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`);
    } else {
      setPhone(`(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'phone') {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 10 || !password.trim()) {
        toast.error('Введите корректный номер и пароль');
        return;
      }
    } else {
      if (!email.trim() || !password.trim()) {
        toast.error('Заполните все поля');
        return;
      }
    }

    setLoading(true);

    try {
      const credentials = mode === 'phone'
        ? { phone: '+7' + phone.replace(/\D/g, ''), password }
        : { email: email.trim(), password };

      const { error } = await signIn(credentials);

      if (error) {
        toast.error(error.message || 'Ошибка входа');
      } else {
        toast.success('Доступ разрешен');
        navigate('/');
      }
    } catch (err) {
      toast.error('Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-black selection:bg-emerald-500/30">
      <AuroraBackground />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[400px] md:max-w-[480px] lg:max-w-[520px] z-10"
      >
        <div className="text-center mb-10 space-y-4">
          <div className="flex justify-center mb-4 md:mb-6">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="flex items-center justify-center p-5 md:p-6 bg-zinc-900/50 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-xl group"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-500 blur-xl opacity-20 group-hover:opacity-40 transition-opacity" />
                <div className="flex items-center justify-center">
                  <img src="/logo.svg" alt="Logo" className="h-20 md:h-24 w-auto object-contain" />
                </div>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
              Ваша Крыша <span className="text-emerald-500">CRM</span>
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-2 font-medium">
              Корпоративная экосистема
            </p>
          </motion.div>
        </div>

        <div className="relative group perspective-1000">
          <div className="relative bg-zinc-950/70 backdrop-blur-xl border border-white/5 p-6 sm:p-8 md:p-10 rounded-3xl shadow-2xl ring-1 ring-white/10">

            <div className="flex p-1 bg-zinc-900/50 rounded-xl mb-6 md:mb-8 border border-white/5">
              <button
                type="button"
                onClick={() => setMode('phone')}
                className={cn(
                  "flex-1 flex items-center justify-center py-2.5 md:py-3 text-xs md:text-sm font-bold uppercase tracking-wider rounded-lg transition-all duration-300",
                  mode === 'phone' ? "bg-zinc-800 text-white shadow-lg ring-1 ring-white/10" : "text-muted-foreground hover:text-white"
                )}
              >
                <Phone className="h-3.5 w-3.5 md:h-4 md:w-4 mr-2" />
                Телефон
              </button>
              <button
                type="button"
                onClick={() => setMode('email')}
                className={cn(
                  "flex-1 flex items-center justify-center py-2.5 md:py-3 text-xs md:text-sm font-bold uppercase tracking-wider rounded-lg transition-all duration-300",
                  mode === 'email' ? "bg-zinc-800 text-white shadow-lg ring-1 ring-white/10" : "text-muted-foreground hover:text-white"
                )}
              >
                <Mail className="h-3.5 w-3.5 md:h-4 md:w-4 mr-2" />
                Почта
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 md:space-y-6">
              <AnimatePresence mode="wait">
                {mode === 'phone' ? (
                  <motion.div
                    key="phone"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-2.5 md:space-y-3"
                  >
                    <Label className="text-xs font-semibold text-zinc-400 pl-1 block">Номер телефона</Label>
                    <div className={cn(
                      "relative transition-all duration-300 rounded-xl bg-black/40 border",
                      focusedField === 'phone' ? "border-emerald-500/50 ring-1 ring-emerald-500/20" : "border-white/5 hover:border-white/10"
                    )}>
                      <Phone className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-muted-foreground pointer-events-none" />
                      <div className="absolute left-11 md:left-12 top-1/2 -translate-y-1/2 text-white font-mono text-sm md:text-base pointer-events-none select-none">
                        +7
                      </div>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={phone}
                        onChange={handlePhoneChange}
                        onFocus={() => setFocusedField('phone')}
                        onBlur={() => setFocusedField(null)}
                        className="pl-[68px] sm:pl-[68px] md:pl-20 lg:pl-20 h-12 md:h-14 bg-transparent border-0 focus-visible:ring-0 text-white font-mono text-sm md:text-base"
                        placeholder="(___) ___-__-__"
                        maxLength={16}
                      />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="email"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-2.5 md:space-y-3"
                  >
                    <Label className="text-xs font-semibold text-zinc-400 pl-1 block">Email Адрес</Label>
                    <div className={cn(
                      "relative transition-all duration-300 rounded-xl bg-black/40 border",
                      focusedField === 'email' ? "border-emerald-500/50 ring-1 ring-emerald-500/20" : "border-white/5 hover:border-white/10"
                    )}>
                      <Mail className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-muted-foreground pointer-events-none" />
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onFocus={() => setFocusedField('email')}
                        onBlur={() => setFocusedField(null)}
                        className="pl-11 sm:pl-11 md:pl-12 lg:pl-12 h-12 md:h-14 bg-transparent border-0 focus-visible:ring-0 text-white text-sm md:text-base"
                        placeholder="agent@goldkey.com"
                      />
                    </div>
                  </motion.div>
                )
                }
              </AnimatePresence>

              <div className="space-y-2.5 md:space-y-3">
                <Label className="text-xs font-semibold text-zinc-400 pl-1 block">Пароль</Label>
                <div className={cn(
                  "relative transition-all duration-300 rounded-xl bg-black/40 border",
                  focusedField === 'password' ? "border-emerald-500/50 ring-1 ring-emerald-500/20" : "border-white/5 hover:border-white/10"
                )}>
                  <Lock className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-muted-foreground pointer-events-none" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    className="pl-11 sm:pl-11 md:pl-12 lg:pl-12 pr-11 sm:pr-11 md:pr-12 lg:pr-12 h-12 md:h-14 bg-transparent border-0 focus-visible:ring-0 text-white text-sm md:text-base"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 md:pt-3">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 md:h-14 rounded-xl text-sm md:text-base font-bold bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:opacity-90 transition-all duration-300 shadow-lg shadow-emerald-500/25 border-0"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Авторизация...</span>
                    </div>
                  ) : (
                    <span className="flex items-center gap-2">
                      Войти в систему <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </div>

              <div className="text-center pt-2">
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest flex items-center justify-center gap-2">
                  <ShieldCheck className="h-3 w-3" />
                  Secure Enterprise Connection
                </p>
              </div>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

