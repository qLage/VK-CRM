import React, { Component, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-background flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="max-w-md w-full space-y-6 text-center"
                    >
                        <div className="glass-card p-8 rounded-2xl border border-destructive/20">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.1, type: 'spring' }}
                                className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-destructive/10 mb-4"
                            >
                                <AlertTriangle className="h-8 w-8 text-destructive" />
                            </motion.div>

                            <h1 className="text-2xl font-bold text-foreground mb-2">
                                Что-то пошло не так
                            </h1>

                            <p className="text-muted-foreground mb-6">
                                Произошла непредвиденная ошибка. Попробуйте перезагрузить страницу.
                            </p>

                            {this.state.error && (
                                <details className="text-left mb-6">
                                    <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                                        Подробности ошибки
                                    </summary>
                                    <pre className="mt-2 p-3 bg-muted/50 rounded-lg text-xs overflow-auto max-h-40">
                                        {this.state.error.toString()}
                                    </pre>
                                </details>
                            )}

                            <Button
                                onClick={this.handleReset}
                                className="w-full gradient-accent text-primary-foreground"
                            >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Перезагрузить страницу
                            </Button>
                        </div>
                    </motion.div>
                </div>
            );
        }

        return this.props.children;
    }
}
