/**
 * Parses a date string from the API and ensures it's treated as UTC if no timezone is present.
 */
export function parseUTCDate(dateStr: string | null | undefined): Date {
    if (!dateStr) return new Date();

    // If the string already has a timezone indicator (Z or +HH or +HH:mm or -HH:mm), parse it as-is
    if (dateStr.includes('Z') || /[-+]\d{2}(:?\d{2})?$/.test(dateStr)) {
        return new Date(dateStr);
    }

    // Otherwise, assume it's UTC and append Z (common for PostgreSQL TIMESTAMP WITHOUT TIME ZONE)
    // Also handle cases where there's a space instead of T
    const standardized = dateStr.replace(' ', 'T');
    return new Date(standardized + (standardized.includes('T') && !standardized.includes('+') && !standardized.includes('-') ? 'Z' : ''));
}
