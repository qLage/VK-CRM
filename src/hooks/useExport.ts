import { toast } from 'sonner';

interface ExportOptions {
    filename?: string;
    sheetName?: string;
}

/**
 * Hook for exporting data to various formats
 */
export function useExport() {
    /**
     * Export data to CSV format
     */
    const exportToCSV = <T extends Record<string, any>>(
        data: T[],
        filename: string = 'export.csv'
    ) => {
        try {
            if (!data || data.length === 0) {
                toast.error('Нет данных для экспорта');
                return;
            }

            // Get headers from first object
            const headers = Object.keys(data[0]);

            // Create CSV content
            const csvContent = [
                headers.join(','), // Header row
                ...data.map(row =>
                    headers.map(header => {
                        const value = row[header];
                        // Escape commas and quotes
                        const stringValue = String(value ?? '');
                        return stringValue.includes(',') || stringValue.includes('"')
                            ? `"${stringValue.replace(/"/g, '""')}"`
                            : stringValue;
                    }).join(',')
                )
            ].join('\n');

            // Create blob and download
            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);

            link.setAttribute('href', url);
            link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
            link.style.visibility = 'hidden';

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(url);
            toast.success('Данные экспортированы в CSV');
        } catch (error) {
            console.error('Error exporting to CSV:', error);
            toast.error('Ошибка при экспорте данных');
        }
    };

    /**
     * Export data to Excel format (using HTML table method)
     */
    const exportToExcel = <T extends Record<string, any>>(
        data: T[],
        options: ExportOptions = {}
    ) => {
        try {
            if (!data || data.length === 0) {
                toast.error('Нет данных для экспорта');
                return;
            }

            const { filename = 'export.xlsx', sheetName = 'Sheet1' } = options;

            // Get headers from first object
            const headers = Object.keys(data[0]);

            // Create HTML table
            const htmlTable = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
          <head>
            <meta charset="utf-8">
            <!--[if gte mso 9]>
            <xml>
              <x:ExcelWorkbook>
                <x:ExcelWorksheets>
                  <x:ExcelWorksheet>
                    <x:Name>${sheetName}</x:Name>
                    <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
                  </x:ExcelWorksheet>
                </x:ExcelWorksheets>
              </x:ExcelWorkbook>
            </xml>
            <![endif]-->
          </head>
          <body>
            <table>
              <thead>
                <tr>
                  ${headers.map(h => `<th>${h}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${data.map(row => `
                  <tr>
                    ${headers.map(h => `<td>${row[h] ?? ''}</td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </body>
        </html>
      `;

            // Create blob and download
            const blob = new Blob([htmlTable], { type: 'application/vnd.ms-excel' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);

            link.setAttribute('href', url);
            link.setAttribute('download', filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
            link.style.visibility = 'hidden';

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(url);
            toast.success('Данные экспортированы в Excel');
        } catch (error) {
            console.error('Error exporting to Excel:', error);
            toast.error('Ошибка при экспорте данных');
        }
    };

    /**
     * Export data to JSON format
     */
    const exportToJSON = <T extends Record<string, any>>(
        data: T[],
        filename: string = 'export.json'
    ) => {
        try {
            if (!data || data.length === 0) {
                toast.error('Нет данных для экспорта');
                return;
            }

            const jsonContent = JSON.stringify(data, null, 2);

            const blob = new Blob([jsonContent], { type: 'application/json' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);

            link.setAttribute('href', url);
            link.setAttribute('download', filename.endsWith('.json') ? filename : `${filename}.json`);
            link.style.visibility = 'hidden';

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(url);
            toast.success('Данные экспортированы в JSON');
        } catch (error) {
            console.error('Error exporting to JSON:', error);
            toast.error('Ошибка при экспорте данных');
        }
    };

    return {
        exportToCSV,
        exportToExcel,
        exportToJSON,
    };
}
