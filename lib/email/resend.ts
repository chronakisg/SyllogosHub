import { Resend } from 'resend';

let _resend: Resend | null = null;

/**
 * Lazy-initialized Resend client. Validates env vars at first call,
 * not at module load — prevents Next.js build-time crashes when
 * env vars are missing in preview/build environments.
 */
export function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set');
  }
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export function getFromEmail(): string {
  if (!process.env.RESEND_FROM_EMAIL) {
    throw new Error('RESEND_FROM_EMAIL is not set');
  }
  return process.env.RESEND_FROM_EMAIL;
}
