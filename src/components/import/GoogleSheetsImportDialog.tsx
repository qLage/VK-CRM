import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { localAPI } from '@/integrations/localAPI';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, Eye, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ImportResult {
  success: boolean;
  summary: {
    total: number;
    created?: number;
    matched?: number;
    unmatched?: number;
    skipped?: number;
    errors?: number;
  };
  preview?: any[];
}

interface GoogleSheetsImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function GoogleSheetsImportDialog({ open, onOpenChange, onSuccess }: GoogleSheetsImportDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [jsonData, setJsonData] = useState('');
  const [previewResult, setPreviewResult] = useState<ImportResult | null>(null);

  const handlePreview = async () => {
    if (!jsonData.trim()) {
      toast({
        title: 'Ошибка',
        description: 'Введите данные для импорта',
        variant: 'destructive',
      });
      return;
    }

    setPreviewing(true);
    setPreviewResult(null);

    try {
      const data = JSON.parse(jsonData);

      const result = await localAPI.request('/import/google-sheets/preview', {
        method: 'POST',
        body: data,
      });

      if (result.error) {
        throw new Error(result.error.message || 'Ошибка предпросмотра');
      }

      setPreviewResult(result);
      toast({
        title: 'Предпросмотр готов',
        description: `Найдено ${result.summary.total} сделок`,
      });
    } catch (error: any) {
      toast({
        title: 'Ошибка предпросмотра',
        description: error.message || 'Не удалось выполнить предпросмотр',
        variant: 'destructive',
      });
    } finally {
      setPreviewing(false);
    }
  };

  const handleImport = async () => {
    if (!jsonData.trim()) {
      toast({
        title: 'Ошибка',
        description: 'Введите данные для импорта',
        variant: 'destructive',
      });
      return;
    }

    // Confirm before importing
    if (!confirm('⚠️ ВНИМАНИЕ: Это удалит ВСЕ существующие сделки и заменит их новыми данными. Продолжить?')) {
      return;
    }

    setLoading(true);

    try {
      const data = JSON.parse(jsonData);

      const result = await localAPI.request('/import/google-sheets', {
        method: 'POST',
        body: data,
      });

      if (result.error) {
        throw new Error(result.error.message || 'Ошибка импорта');
      }

      toast({
        title: 'Импорт завершен',
        description: `Создано сделок: ${result.data.summary.created}, Пропущено: ${result.data.summary.skipped}`,
      });

      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      toast({
        title: 'Ошибка импорта',
        description: error.message || 'Не удалось выполнить импорт',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSampleData = () => {
    const sample = {
      sheets: {
        'Sales Group 1': [
          {
            deal_date: '2024-01-15',
            agent_name: 'Иванов Иван Иванович',
            property: 'ул. Ленина, д. 10, кв. 5',
            deal_price: 5000000,
            commission_total: 150000,
          },
        ],
        'Rich Realtor': [
          {
            date: '15.01.2024',
            агент: 'Петров Петр Петрович',
            объект: 'ул. Пушкина, д. 20',
            цена: '7 500 000',
            комиссия: '225 000',
          },
        ],
      },
      teamMapping: {
        'Sales Group 1': 'team-id-1',
        'Rich Realtor': 'team-id-2',
      },
    };

    setJsonData(JSON.stringify(sample, null, 2));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Импорт из Google Sheets</DialogTitle>
          <DialogDescription>
            Замена всех сделок данными из Google Sheets. Операция необратима!
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          <Alert className="bg-yellow-500/10 border-yellow-500/20">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <AlertDescription className="text-yellow-200">
              <strong>ВНИМАНИЕ:</strong> Эта операция удалит ВСЕ существующие сделки и заменит их новыми данными.
              Рекомендуется сначала использовать предпросмотр.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Данные JSON</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadSampleData}
                className="text-xs"
              >
                Загрузить пример
              </Button>
            </div>
            <Textarea
              value={jsonData}
              onChange={(e) => setJsonData(e.target.value)}
              placeholder='{"sheets": {"Sales Group 1": [...], "Rich Realtor": [...]}, "teamMapping": {...}}'
              className="font-mono text-xs min-h-[300px] bg-black/20"
            />
          </div>

          {previewResult && (
            <div className="space-y-3 p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <h3 className="font-semibold">Результаты предпросмотра</h3>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-white/60">Всего сделок</div>
                  <div className="text-2xl font-bold">{previewResult.summary.total}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-white/60">Сопоставлено</div>
                  <div className="text-2xl font-bold text-green-500">{previewResult.summary.matched}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-white/60">Не найдено</div>
                  <div className="text-2xl font-bold text-yellow-500">{previewResult.summary.unmatched}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-white/60">Листов</div>
                  <div className="text-2xl font-bold">{Object.keys(JSON.parse(jsonData).sheets || {}).length}</div>
                </div>
              </div>

              {previewResult.summary.unmatched! > 0 && (
                <Alert className="bg-yellow-500/10 border-yellow-500/20">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <AlertDescription className="text-yellow-200 text-sm">
                    {previewResult.summary.unmatched} сделок будут пропущены из-за несопоставленных сотрудников
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-4 border-t border-white/10">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading || previewing}
            className="flex-1"
          >
            Отмена
          </Button>
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={loading || previewing || !jsonData.trim()}
            className="flex-1"
          >
            {previewing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Предпросмотр...
              </>
            ) : (
              <>
                <Eye className="mr-2 h-4 w-4" />
                Предпросмотр
              </>
            )}
          </Button>
          <Button
            onClick={handleImport}
            disabled={loading || previewing || !jsonData.trim()}
            className="flex-1 bg-red-600 hover:bg-red-700"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Импорт...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Импортировать
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
