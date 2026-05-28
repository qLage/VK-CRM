import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Calculator,
    Calendar,
    CreditCard,
    LayoutDashboard,
    Settings,
    User,
    Users,
    FileText,
    Building,
    Building2,
    UserPlus,
    ContactRound,
    LogOut,
    PlusCircle,
} from "lucide-react";

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from "@/components/ui/command";
import { DialogTitle } from "@/components/ui/dialog"; // Ensure accessible title
import { useAuth } from "@/hooks/useAuth";

export function GlobalSearch() {
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();
    const { signOut } = useAuth();

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };

        document.addEventListener("keydown", down);

        const handleCustomOpen = () => setOpen(true);
        window.addEventListener("open-global-search", handleCustomOpen);

        return () => {
            document.removeEventListener("keydown", down);
            window.removeEventListener("open-global-search", handleCustomOpen);
        };
    }, []);

    const runCommand = (command: () => void) => {
        setOpen(false);
        command();
    };

    return (
        <>


            <CommandDialog open={open} onOpenChange={setOpen}>
                <DialogTitle className="sr-only">Глобальный поиск</DialogTitle>
                <CommandInput placeholder="Введите команду или поиск..." />
                <CommandList>
                    <CommandEmpty>Ничего не найдено.</CommandEmpty>

                    <CommandGroup heading="Быстрый переход">
                        <CommandItem onSelect={() => runCommand(() => navigate("/"))}>
                            <LayoutDashboard className="mr-2 h-4 w-4" />
                            <span>Дашборд</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => navigate("/properties"))}>
                            <Building2 className="mr-2 h-4 w-4" />
                            <span>Объекты</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => navigate("/leads"))}>
                            <UserPlus className="mr-2 h-4 w-4" />
                            <span>Лиды</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => navigate("/clients"))}>
                            <ContactRound className="mr-2 h-4 w-4" />
                            <span>Клиенты</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => navigate("/employees"))}>
                            <Users className="mr-2 h-4 w-4" />
                            <span>Сотрудники</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => navigate("/reports"))}>
                            <FileText className="mr-2 h-4 w-4" />
                            <span>Отчеты</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => navigate("/finances"))}>
                            <Calculator className="mr-2 h-4 w-4" />
                            <span>Финансы</span>
                        </CommandItem>
                    </CommandGroup>

                    <CommandSeparator />

                    <CommandGroup heading="Навигация">
                        <CommandItem onSelect={() => runCommand(() => navigate("/profile"))}>
                            <User className="mr-2 h-4 w-4" />
                            <span>Профиль</span>
                            <CommandShortcut>⌘P</CommandShortcut>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => navigate("/planning"))}>
                            <Calendar className="mr-2 h-4 w-4" />
                            <span>Планирование</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => navigate("/new-buildings"))}>
                            <Building className="mr-2 h-4 w-4" />
                            <span>Новостройки</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => navigate("/settings"))}>
                            <Settings className="mr-2 h-4 w-4" />
                            <span>Настройки</span>
                            <CommandShortcut>⌘S</CommandShortcut>
                        </CommandItem>
                    </CommandGroup>

                    <CommandSeparator />

                    <CommandGroup heading="Действия">
                        <CommandItem onSelect={() => runCommand(() => navigate("/reports?new=true"))}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            <span>Создать отчет</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => navigate("/finances?action=income"))}>
                            <CreditCard className="mr-2 h-4 w-4" />
                            <span>Добавить доход</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => signOut())}>
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Выйти</span>
                        </CommandItem>
                    </CommandGroup>

                </CommandList>
            </CommandDialog>
        </>
    );
}
