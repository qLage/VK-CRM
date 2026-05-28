import { useState } from 'react';
import { Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FormBuilder, type FieldConfig } from './FormBuilder';
import { DAILY_PLAN_FIELDS } from '@/components/service-requests/constants';

// Export hook for usage in DailyPlanButton
export function useDailyPlanConfig() {
    const [fields, setFields] = useState<FieldConfig[]>(() => {
        const stored = localStorage.getItem('crm_daily_plan_fields');
        if (stored) return JSON.parse(stored);

        return DAILY_PLAN_FIELDS;
    });

    const updateFields = (newFields: FieldConfig[]) => {
        setFields(newFields);
        localStorage.setItem('crm_daily_plan_fields', JSON.stringify(newFields));
    };

    return { fields, updateFields, isLoading: false };
}

export function DailyPlanSettings() {
    const { fields, updateFields } = useDailyPlanConfig();

    return (
        <Card className="glass-card border-white/5 overflow-hidden">
            <CardHeader className="bg-white/5 border-b border-white/5 pb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Target className="h-5 w-5 text-amber-500" />
                            Конструктор плана на день
                        </CardTitle>
                        <CardDescription className="mt-1">
                            Настройте поля, которые сотрудники должны заполнять в начале рабочего дня
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-4 bg-zinc-900/40">
                <FormBuilder
                    fields={fields}
                    onFieldsChange={updateFields}
                />
            </CardContent>
        </Card>
    );
}
