/**
 * Display name from Profile / patient-details cache (nickname → name → first+last).
 */
export function readPatientDetailsDisplayNameFromLocalStorage(): string | null {
  try {
    const raw = localStorage.getItem('patientDetails');
    if (!raw) return null;
    const p = JSON.parse(raw) as Record<string, unknown>;
    const nick = String(p['nickname'] ?? '').trim();
    if (nick) return nick;
    const name = String(p['name'] ?? '').trim();
    if (name) return name;
    const first = String(p['firstName'] ?? '').trim();
    const last = String(p['lastName'] ?? '').trim();
    const combined = [first, last].filter(Boolean).join(' ').trim();
    if (combined) return combined;
  } catch {
    /* ignore */
  }
  return null;
}

export function formatFullName(lastName?: string, firstName?: string): string {
  const last = (lastName || '').trim();
  const first = (firstName || '').trim();
  if (!last && !first) return '';
  if (!last) return first;
  if (!first) return last;
  return `${last}, ${first}`;
}

export function calculateAge(dateOfBirth?: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  if (age < 0 || age > 150) return null;
  return age;
}

