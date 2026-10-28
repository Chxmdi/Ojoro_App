import { describe, expect, it } from 'vitest';

import {
  authErrorMessage,
  cleanCode,
  formatPhone,
  isCompleteCode,
  normalizePhone,
  resendSecondsLeft,
} from './phone';

describe('normalizePhone', () => {
  it('asks for a number when empty', () => {
    expect(normalizePhone('  ')).toEqual({ ok: false, error: 'Enter your phone number.' });
  });

  it('accepts North American numbers without the country code', () => {
    expect(normalizePhone('(555) 555-0199')).toEqual({ ok: true, e164: '+15555550199' });
    expect(normalizePhone('1 555 555 0199')).toEqual({ ok: true, e164: '+15555550199' });
  });

  it('accepts + and 00 international forms', () => {
    expect(normalizePhone('+44 7700 900123')).toEqual({ ok: true, e164: '+447700900123' });
    expect(normalizePhone('0044 7700 900123')).toEqual({ ok: true, e164: '+447700900123' });
    expect(normalizePhone('+1 555.555.0100')).toEqual({ ok: true, e164: '+15555550100' });
  });

  it('rejects letters, missing country codes and bad lengths', () => {
    expect(normalizePhone('555-CALL').ok).toBe(false);
    expect(normalizePhone('7700 900123 99').ok).toBe(false);
    expect(normalizePhone('+1 555 555').ok).toBe(false);
    expect(normalizePhone('+44 12').ok).toBe(false);
    expect(normalizePhone('+44 1234 5678 9012 34').ok).toBe(false);
  });
});

describe('formatPhone', () => {
  it('groups North American numbers', () => {
    expect(formatPhone('+15555550199')).toBe('+1 555 555 0199');
  });
  it('splits the country code from other numbers', () => {
    expect(formatPhone('+447700900123')).toBe('+44 7700900123');
    expect(formatPhone('+3361234567')).toBe('+33 61234567');
  });
});

describe('codes', () => {
  it('keeps six digits', () => {
    expect(cleanCode('12 34-56 78')).toBe('123456');
    expect(cleanCode('abc')).toBe('');
  });
  it('knows a complete code', () => {
    expect(isCompleteCode('123456')).toBe(true);
    expect(isCompleteCode('12345')).toBe(false);
  });
  it('counts down to resend', () => {
    expect(resendSecondsLeft(0, 0)).toBe(30);
    expect(resendSecondsLeft(0, 29_100)).toBe(1);
    expect(resendSecondsLeft(0, 31_000)).toBe(0);
    expect(resendSecondsLeft(0, 1_000, 5)).toBe(4);
  });
});

describe('authErrorMessage', () => {
  it('says offline for network failures', () => {
    expect(authErrorMessage({ name: 'AuthRetryableFetchError' }, 'send')).toContain('offline');
    expect(authErrorMessage({ status: 0 }, 'verify')).toContain('offline');
  });
  it('maps known codes to words', () => {
    expect(authErrorMessage({ code: 'otp_expired' }, 'verify')).toContain("didn't work");
    expect(authErrorMessage({ code: 'invalid_credentials' }, 'verify')).toContain("didn't work");
    expect(authErrorMessage({ code: 'over_sms_send_rate_limit' }, 'send')).toContain('Wait a minute');
    expect(authErrorMessage({ code: 'over_request_rate_limit' }, 'send')).toContain('Wait a minute');
    expect(authErrorMessage({ code: 'sms_send_failed' }, 'send')).toContain("couldn't send");
    expect(authErrorMessage({ code: 'phone_provider_disabled' }, 'send')).toContain("couldn't send");
    expect(authErrorMessage({ code: 'validation_failed' }, 'send')).toContain('looks wrong');
    expect(authErrorMessage({ code: 'signup_disabled' }, 'send')).toContain("aren't open");
    expect(authErrorMessage({ code: 'phone_not_confirmed' }, 'send')).toContain("aren't open");
    expect(authErrorMessage({ code: 'user_banned' }, 'verify')).toContain("can't sign in");
  });
  it('falls back per step', () => {
    expect(authErrorMessage(null, 'send')).toBe("We couldn't send a code. Try again in a minute.");
    expect(authErrorMessage({ code: 'x' }, 'verify')).toBe("We couldn't check that code. Try again.");
  });
});
