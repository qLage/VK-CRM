/**
 * Normalizes phone number to raw digits (e.g. 79991234567)
 * Handles Russian 8 to 7 conversion.
 */
function normalizePhone(phone) {
    if (!phone) return '';
    let digits = String(phone).replace(/\D/g, '');

    // If starts with 8 and has 11 digits, change to 7
    if (digits.length === 11 && digits.startsWith('8')) {
        digits = '7' + digits.slice(1);
    }

    return digits;
}

module.exports = {
    normalizePhone
};
