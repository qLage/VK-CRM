import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);

        // Handle dynamic import failures (common after new deployment)
        const isChunkError = 
            error.message?.includes("Failed to fetch dynamically imported module") || 
            error.message?.includes("ChunkLoadError") ||
            error.name === "ChunkLoadError";

        if (isChunkError) {
            // Check if we already tried to reload in this session to avoid infinite loop
            const hasReloaded = sessionStorage.getItem("chunk_error_reloaded");
            
            if (!hasReloaded) {
                if (import.meta.env.DEV) {
                    console.log("Chunk load error detected. Attempting to reload page...");
                }
                sessionStorage.setItem("chunk_error_reloaded", "true");
                window.location.reload();
                return;
            } else {
                if (import.meta.env.DEV) {
                    console.warn("Already attempted to reload after chunk error, but it failed again.");
                }
                // We keep the error UI visible but might want to clear the flag after some time
                // or just let the user click the manual reload button
            }
        }
    }

    public render() {
        if (this.state.hasError) {
            const isChunkError = 
                this.state.error?.message?.includes("Failed to fetch dynamically imported module") || 
                this.state.error?.message?.includes("ChunkLoadError");

            return (
                <div className="min-h-[50vh] w-full flex flex-col items-center justify-center p-6 text-center space-y-6">
                    <div className="p-4 rounded-full bg-destructive/10 text-destructive mb-2">
                        <AlertTriangle className="h-10 w-10" />
                    </div>
                    <div className="space-y-2 max-w-md">
                        <h2 className="text-2xl font-bold tracking-tight">
                            {isChunkError ? "Обновление приложения" : "Что-то пошло не так"}
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            {isChunkError 
                                ? "Похоже, вышла новая версия приложения. Пожалуйста, перезагрузите страницу." 
                                : "Произошла ошибка при отображении этого компонента."}
                            {this.state.error?.message && <span className="block mt-2 font-mono text-xs bg-secondary/50 p-2 rounded">{this.state.error.message}</span>}
                        </p>
                    </div>
                    <Button
                        onClick={() => {
                            sessionStorage.removeItem("chunk_error_reloaded");
                            window.location.reload();
                        }}
                        className="gradient-accent hover:shadow-glow transition-all"
                    >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Перезагрузить страницу
                    </Button>
                </div>
            );
        }

        // On successful render, clear the reload flag if it exists
        if (sessionStorage.getItem("chunk_error_reloaded")) {
            sessionStorage.removeItem("chunk_error_reloaded");
        }

        return this.props.children;
    }
}
