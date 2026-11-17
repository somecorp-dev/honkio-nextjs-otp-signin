/**
 * Turns what a person typed ("613 555 0123", "(613) 555-0123", "+1 613...")
 * into E.164 (+16135550123), or null when it is not a North American number.
 * HonkIO then decides whether it is a Canadian number that can get texts.
 */
export function toE164(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  // Area code and exchange both start with 2 to 9 in the North American plan.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return `+1${digits}`;
}

/** +16135550123 shown as (613) 555-0123. */
export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
