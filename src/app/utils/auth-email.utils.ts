/** Synthetic email domain for accounts created with phone-only signup (Firebase requires an email). */
const SIGNUP_DOMAIN = 'signup.alala.app';

export function contactNumberToAuthEmail(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  return digits ? `p${digits}@${SIGNUP_DOMAIN}` : '';
}

/** If input has @, use as email; otherwise treat as contact number and map to synthetic email. */
export function resolveAuthEmailOrPhone(input: string): string {
  const t = (input || '').trim();
  if (!t) return '';
  if (t.includes('@')) return t;
  return contactNumberToAuthEmail(t);
}
