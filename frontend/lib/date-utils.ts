/**
 * Date Utility Functions for Bajaj Dyeing Unit
 * Handles local date formatting, validations, and conversions without UTC midnight timezone bugs.
 */

/**
 * Returns today's date in YYYY-MM-DD format using the user's local timezone (IST).
 * Avoids the UTC offset issue where `new Date().toISOString().split('T')[0]`
 * would return yesterday's date between 12:00 AM and 5:30 AM IST.
 */
export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Validates whether a date string is in strict YYYY-MM-DD format
 * and corresponds to an actual valid calendar date (e.g. rejects "99 sept 2026", Feb 31, etc.)
 */
export function isValidDateString(dateStr: string | null | undefined): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const [y, m, d] = trimmed.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dateObj = new Date(y, m - 1, d);
  return (
    dateObj.getFullYear() === y &&
    dateObj.getMonth() === m - 1 &&
    dateObj.getDate() === d
  );
}

/**
 * Formats a YYYY-MM-DD date into a friendly readable format.
 * e.g. "2026-11-12" -> "Thu, 12 Nov 2026" (or "12 Nov 2026" if includeDayName = false)
 */
export function formatDisplayDate(dateStr: string | null | undefined, includeDayName = true): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (!isValidDateString(trimmed)) return trimmed;

  const [y, m, d] = trimmed.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const monthName = months[dateObj.getMonth()];
  const dayName = days[dateObj.getDay()];
  const dayNum = String(d).padStart(2, '0');

  return includeDayName
    ? `${dayName}, ${dayNum} ${monthName} ${y}`
    : `${dayNum} ${monthName} ${y}`;
}

/**
 * Returns a friendly relative label if date is Today, Yesterday, or Tomorrow.
 * Otherwise returns formatted display date.
 */
export function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (!isValidDateString(trimmed)) return trimmed;

  const today = getTodayDateString();
  const yesterday = addDaysToDate(today, -1);
  const tomorrow = addDaysToDate(today, 1);

  if (trimmed === today) {
    return `Today (${formatDisplayDate(trimmed, false)})`;
  }
  if (trimmed === yesterday) {
    return `Yesterday (${formatDisplayDate(trimmed, false)})`;
  }
  if (trimmed === tomorrow) {
    return `Tomorrow (${formatDisplayDate(trimmed, false)})`;
  }

  return formatDisplayDate(trimmed, true);
}

/**
 * Adds or subtracts days from a YYYY-MM-DD date string.
 * @param dateStr Base date string in YYYY-MM-DD format (defaults to today if invalid)
 * @param days Number of days to add (can be negative)
 */
export function addDaysToDate(dateStr: string | null | undefined, days: number): string {
  const base = isValidDateString(dateStr) ? (dateStr as string) : getTodayDateString();
  const [y, m, d] = base.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  dateObj.setDate(dateObj.getDate() + days);

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

