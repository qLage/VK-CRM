import Decimal from 'decimal.js';

// Configure decimal.js for financial calculations
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN, // Banker's rounding
  toExpNeg: -7,
  toExpPos: 21,
});

/**
 * Formats a monetary value to a string with 2 decimal places.
 *
 * @param value - The value to format (Decimal, number, or string)
 * @returns Formatted string with 2 decimal places (e.g., "1234567.89")
 *
 * @example
 * formatMoney(1234567.89) // "1234567.89"
 * formatMoney(new Decimal("1234567.89")) // "1234567.89"
 * formatMoney("1234567.89") // "1234567.89"
 */
export function formatMoney(value: Decimal | number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return "0.00";
  }
  const decimal = value instanceof Decimal ? value : new Decimal(value);
  return decimal.toFixed(2);
}

/**
 * Formats a percentage value to a string with 1 decimal place.
 *
 * @param value - The value to format (Decimal, number, or string)
 * @returns Formatted string with 1 decimal place (e.g., "45.7")
 *
 * @example
 * formatPercent(45.678) // "45.7"
 * formatPercent(new Decimal("45.678")) // "45.7"
 * formatPercent("45.678") // "45.7"
 */
export function formatPercent(value: Decimal | number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return "0.0";
  }
  const decimal = value instanceof Decimal ? value : new Decimal(value);
  return decimal.toFixed(1);
}

/**
 * Safely converts a value to Decimal, handling null and undefined.
 *
 * @param value - The value to parse (number, string, null, or undefined)
 * @returns Decimal instance (returns Decimal(0) for null/undefined)
 *
 * @example
 * parseNumeric(123.45) // Decimal(123.45)
 * parseNumeric("123.45") // Decimal(123.45)
 * parseNumeric(null) // Decimal(0)
 * parseNumeric(undefined) // Decimal(0)
 */
export function parseNumeric(value: number | string | null | undefined): Decimal {
  if (value === null || value === undefined) {
    return new Decimal(0);
  }
  return new Decimal(value);
}

/**
 * Safely divides two Decimal values, returning 0 if denominator is zero.
 *
 * @param numerator - The numerator
 * @param denominator - The denominator
 * @returns Result of division, or Decimal(0) if denominator is zero
 *
 * @example
 * safeDiv(new Decimal(10), new Decimal(2)) // Decimal(5)
 * safeDiv(new Decimal(10), new Decimal(0)) // Decimal(0)
 */
export function safeDiv(numerator: Decimal, denominator: Decimal): Decimal {
  if (denominator.isZero()) {
    return new Decimal(0);
  }
  return numerator.dividedBy(denominator);
}

/**
 * Calculates the sum of an array of Decimal values.
 *
 * @param values - Array of Decimal values
 * @returns Sum of all values
 *
 * @example
 * sum([new Decimal(1), new Decimal(2), new Decimal(3)]) // Decimal(6)
 * sum([]) // Decimal(0)
 */
export function sum(values: Decimal[]): Decimal {
  return values.reduce((acc, val) => acc.plus(val), new Decimal(0));
}

/**
 * Calculates the average of an array of Decimal values.
 *
 * @param values - Array of Decimal values
 * @returns Average of all values, or Decimal(0) if array is empty
 *
 * @example
 * average([new Decimal(1), new Decimal(2), new Decimal(3)]) // Decimal(2)
 * average([]) // Decimal(0)
 */
export function average(values: Decimal[]): Decimal {
  if (values.length === 0) {
    return new Decimal(0);
  }
  return sum(values).dividedBy(values.length);
}
