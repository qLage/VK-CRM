import { useState } from 'react';
import { List } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FormBuilder, type FieldConfig } from './FormBuilder';
import { DAILY_REPORT_FIELDS } from '@/components/service-requests/constants';

// Export hook for usage in DailyReportButton
export function useDailyReportConfig() {
  const [fields, setFields] = useState<FieldConfig[]>(() => {
    const stored = localStorage.getItem('crm_daily_report_fields');
    if (stored) return JSON.parse(stored);

    return DAILY_REPORT_FIELDS;
  });

  const updateFields = (newFields: FieldConfig[]) => {
    setFields(newFields);
    localStorage.setItem('crm_daily_report_fields', JSON.stringify(newFields));
  };

  return { fields, updateFields, isLoading: false };
}

export function DailyReportSettings() {
  const { fields, updateFields } = useDailyReportConfig();

  return (
    <Card className="glass-card border-white/5 overflow-hidden">
      <CardHeader className="bg-white/5 border-b border-white/5 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <List className="h-5 w-5 text-emerald-500" />
              Конструктор отчета
            </CardTitle>
            <CardDescription className="mt-1">
              Настройте поля, которые сотрудники должны заполнять ежедневно
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
