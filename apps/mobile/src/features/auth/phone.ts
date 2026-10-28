/**
 * Phone sign-in, kept simple: one field, the country code optional for North American numbers
 * (Ojoro starts in Montréal). Everything else must start with + or 00.
 */

export type PhoneResult = { ok: true; e164: string } | { ok: false; error: string };

export function normalizePhone(raw: string): PhoneResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: 'Enter your phone number.' };
  if (/[^\d\s()+.-]/.test(trimmed)) {
    return { ok: false, error: 'Use digits only, with + before the country code.' };
  }
  const plus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (!plus && digits.startsWith('00')) digits = digits.slice(2);
  else if (!plus && digits.length === 10) digits = `1${digits}`;
  else if (!plus && !(digits.length === 11 && digits.startsWith('1'))) {
    return {
      ok: false,
      error: 'Add your country code, like +44 for the UK. Canada and the US work without it.',
    };
  }
  if (digits.startsWith('1') && digits.length !== 11) {
    return { ok: false, error: 'Numbers in Canada and the US have 10 digits after +1.' };
  }
  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, error: "That number looks too short or too long. Check it and try again." };
  }
  return { ok: true, e164: `+${digits}` };
}

/** "+1 555 555 0199" for North America; other numbers as "+44 7700900123". */
export function formatPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  const cc = digits.length > 10 ? digits.length - 10 : 2;
  return `+${digits.slice(0, cc)} ${digits.slice(cc)}`;
}

export const CODE_LENGTH = 6;

/** Only digits, at most six (pasted codes keep their digits). */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

export function isCompleteCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/** Wait between code requests, so taps don't burn the SMS limit. */
export const RESEND_AFTER_S = 30;

export function resendSecondsLeft(sentAt: number, now: number, after = RESEND_AFTER_S): number {
  return Math.max(0, Math.ceil((sentAt + after * 1000 - now) / 1000));
}

/** The shape of a Supabase AuthError we care about. */
export type AuthFailure = { code?: string | undefined; status?: number | undefined; name?: string | undefined };

/** Sign-in errors in words. Never red, never blaming. Codes from Supabase Auth. */
export function authErrorMessage(error: AuthFailure | null | undefined, step: 'send' | 'verify'): string {
  const code = error?.code;
  if (error?.name === 'AuthRetryableFetchError' || error?.status === 0) {
    return "You're offline. Connect and try again.";
  }
  switch (code) {
    case 'otp_expired':
    case 'invalid_credentials':
      return "That code didn't work. It may have expired. Check it, or send a new one.";
    case 'over_sms_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many codes asked for in a short time. Wait a minute, then send a new one.';
    case 'sms_send_failed':
    case 'phone_provider_disabled':
      return "We couldn't send a code to that number. Check it, or try again in a minute.";
    case 'validation_failed':
      return 'That number looks wrong. Check it, with + before the country code.';
    case 'signup_disabled':
    case 'phone_not_confirmed':
      return "New sign-ups by phone aren't open right now.";
    case 'user_banned':
      return "This account can't sign in. Contact Ojoro support.";
    default:
      return step === 'send'
        ? "We couldn't send a code. Try again in a minute."
        : "We couldn't check that code. Try again.";
  }
}
