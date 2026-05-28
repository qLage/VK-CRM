/**
 * Formats a raw phone string into Russian format: +7 (XXX) XXX-XX-XX
 */
export function formatPhoneRu(value: string): string {
    const digits = value.replace(/\D/g, '');
    let d = digits;

    // Handle start with 8 or 7
    if (d.startsWith('8')) d = '7' + d.slice(1);
    if (d.length > 0 && !d.startsWith('7')) d = '7' + d;

    d = d.slice(0, 11);

    if (d.length === 0) return '';
    if (d.length <= 1) return '+7';
    if (d.length <= 4) return `+7 (${d.slice(1)}`;
    if (d.length <= 7) return `+7 (${d.slice(1, 4)}) ${d.slice(4)}`;
    if (d.length <= 9) return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
    return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
}

/**
 * Normalizes phone number to raw digits (e.g. 79991234567)
 */
export function normalizePhone(value: string): string {
    let digits = value.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('8')) {
        digits = '7' + digits.slice(1);
    }
    return digits;
}
