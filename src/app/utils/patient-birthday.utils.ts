/** Shared birthday parsing/formatting for patient forms (dashboard modal + patient-details page). */

export const PATIENT_MIN_BIRTH_YMD = '1900-01-01';

export function formatUsDateFromYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return '';
  return `${m}/${d}/${y}`;
}

export function isoNoonFromYmd(ymd: string): string {
  const parts = ymd.split('-').map(Number);
  const y = parts[0];
  const mo = parts[1];
  const day = parts[2];
  if (!y || !mo || !day) return '';
  return new Date(Date.UTC(y, mo - 1, day, 12, 0, 0)).toISOString();
}

/** From ion-datetime / ISO string → YYYY-MM-DD */
export function normalizeDateOnlyFromIso(raw: string): string {
  if (!raw) return '';
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  return '';
}

/**
 * Parse MM/DD/YYYY, M/D/YYYY, or YYYY-MM-DD → YYYY-MM-DD if valid and in range.
 */
export function parseManualPatientBirthday(raw: string, maxDate: Date, minDate: Date): string | null {
  const t = (raw || '').trim();
  if (!t) return null;

  let y = 0;
  let mo = 0;
  let day = 0;

  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    y = +iso[1];
    mo = +iso[2];
    day = +iso[3];
  } else {
    const us = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (!us) return null;
    mo = +us[1];
    day = +us[2];
    y = +us[3];
  }

  if (y < 1900 || mo < 1 || mo > 12 || day < 1 || day > 31) return null;

  const dt = new Date(Date.UTC(y, mo - 1, day, 12, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== day) {
    return null;
  }

  if (dt > maxDate || dt < minDate) return null;

  return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function patientBirthdayForSave(
  display: string,
  pickerIso: string,
  maxDate: Date,
  minDate: Date
): string {
  const fromInput = parseManualPatientBirthday((display || '').trim(), maxDate, minDate);
  if (fromInput) return fromInput;
  return normalizeDateOnlyFromIso((pickerIso || '').toString().trim());
}
