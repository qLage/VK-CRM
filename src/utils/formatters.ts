/**
 * Unified number formatting utilities for consistent display across all pages
 * Plan 02-05: Frontend Integration and Number Formatting Consistency
 *
 * All formatters follow the backend contract:
 * - Money: 2 decimals, space thousand separators
 * - Percent: 1 decimal, % symbol
 * - Integer: no decimals, space thousand separators
 */

// Russian locale for space thousand separators
const LOCALE = 'ru-RU';

/**
 * Format money values with 2 decimal places and thousand separators
 * @param value - Numeric value or string from API
 * @returns Formatted string like "1 234 567.89"
 * @example
 * formatMoney(1234567.89) // "1 234 567,89 ₽"
 * formatMoney("1234567.89") // "1 234 567,89 ₽"
 * formatMoney(null) // "0,00 ₽"
 */
export function formatMoney(value: string | number | null | undefined): string {
  const numValue = parseApiNumber(value);
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numValue);
}

/** Рубли без лишних «,00» — для таблиц сделок и полей с целыми суммами. */
export function formatMoneyTrimTrailingZeros(value: string | number | null | undefined): string {
  const numValue = parseApiNumber(value);
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numValue);
}

/**
 * Format percentage values with 1 decimal place
 * @param value - Numeric value or string from API (already in percent, not decimal)
 * @returns Formatted string like "45.7%"
 * @example
 * formatPercent(45.7) // "45,7%"
 * formatPercent("45.7") // "45,7%"
 * formatPercent(null) // "0,0%"
 */
export function formatPercent(value: string | number | null | undefined): string {
  const numValue = parseApiNumber(value);
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(numValue / 100);
}

/**
 * Format integer values with thousand separators, no decimals
 * @param value - Numeric value or string from API
 * @returns Formatted string like "1 234"
 * @example
 * formatInteger(1234) // "1 234"
 * formatInteger("1234") // "1 234"
 * formatInteger(null) // "0"
 */
export function formatInteger(value: string | number | null | undefined): string {
  const numValue = parseApiNumber(value);
  return new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 0,
  }).format(numValue);
}

/**
 * Текстовые поля сумм (руб., целые): группировка тысяч; пустая строка при 0 — как SalariesSettings / PropertyFormDialog.
 */
export function groupedIntegerInputDisplay(value: number | string): string {
  if (value === '' || value === null || value === undefined) return '';
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d]/g, ''));
  if (!Number.isFinite(n) || n === 0) return '';
  return formatInteger(n);
}

/** Из ввода оставляет только цифры → целая сумма в рублях. */
export function clampIntAmountFromDigits(raw: string): number {
  const d = raw.replace(/[^0-9]/g, '');
  return d === '' ? 0 : Number(d);
}

/**
 * Format money values in compact notation for space-constrained contexts
 * @param value - Numeric value or string from API
 * @returns Formatted string like "1.2M ₽" or "345K ₽"
 * @example
 * formatCompactMoney(1234567) // "1M ₽"
 * formatCompactMoney(345000) // "345K ₽"
 * formatCompactMoney(null) // "0 ₽"
 */
export function formatCompactMoney(value: string | number | null | undefined): string {
  const numValue = parseApiNumber(value);
  return new Intl.NumberFormat(LOCALE, {
    notation: 'compact',
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(numValue);
}

/**
 * Safely parse API number values (string or number) to number
 * Handles null, undefined, empty strings, and invalid values
 * @param value - Value from API (can be string, number, null, undefined)
 * @returns Parsed number or 0 for invalid values
 * @example
 * parseApiNumber("1234.56") // 1234.56
 * parseApiNumber(1234.56) // 1234.56
 * parseApiNumber(null) // 0
 * parseApiNumber(undefined) // 0
 * parseApiNumber("") // 0
 */
export function parseApiNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }

  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}
