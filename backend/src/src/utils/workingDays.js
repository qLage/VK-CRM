// Russian public holidays for 2024-2027
const russianHolidays = {
    2024: [
        '2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06', '2024-01-07', '2024-01-08', // New Year
        '2024-02-23', // Defender of the Fatherland Day
        '2024-03-08', // International Women's Day
        '2024-05-01', // Labour Day
        '2024-05-09', // Victory Day
        '2024-06-12', // Russia Day
        '2024-11-04', // Unity Day
    ],
    2025: [
        '2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04', '2025-01-05', '2025-01-06', '2025-01-07', '2025-01-08',
        '2025-02-23',
        '2025-03-08',
        '2025-05-01',
        '2025-05-09',
        '2025-06-12',
        '2025-11-04',
    ],
    2026: [
        '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08',
        '2026-02-23',
        '2026-03-08',
        '2026-05-01',
        '2026-05-09',
        '2026-06-12',
        '2026-11-04',
    ],
    2027: [
        '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08',
        '2027-02-23',
        '2027-03-08',
        '2027-05-01',
        '2027-05-09',
        '2027-06-12',
        '2027-11-04',
    ]
};

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Check if a date is a Russian public holiday
 */
function isHoliday(date) {
    const year = date.getFullYear();
    const dateStr = date.toISOString().split('T')[0];
    const holidays = russianHolidays[year] || [];
    return holidays.includes(dateStr);
}

/**
 * Check if a date is a working day (not weekend and not holiday)
 */
function isWorkingDay(date) {
    return !isWeekend(date) && !isHoliday(date);
}

/**
 * Get all working days in a month
 */
function getWorkingDaysInMonth(year, month) {
    const workingDays = [];
    const date = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0).getDate();

    for (let day = 1; day <= lastDay; day++) {
        date.setDate(day);
        if (isWorkingDay(date)) {
            workingDays.push(new Date(date));
        }
    }

    return workingDays;
}

/**
 * Count working days in a month
 */
function countWorkingDays(year, month) {
    return getWorkingDaysInMonth(year, month).length;
}

/**
 * Get all working days in a quarter
 */
function getWorkingDaysInQuarter(year, quarter) {
    const startMonth = (quarter - 1) * 3 + 1;
    const workingDays = [];

    for (let m = 0; m < 3; m++) {
        const month = startMonth + m;
        workingDays.push(...getWorkingDaysInMonth(year, month));
    }

    return workingDays;
}

module.exports = {
    isWeekend,
    isHoliday,
    isWorkingDay,
    getWorkingDaysInMonth,
    countWorkingDays,
    getWorkingDaysInQuarter
};
