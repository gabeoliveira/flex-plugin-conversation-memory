/**
 * Shared env + auth helper for the agent-productivity provisioning scripts.
 * All Twilio control-plane calls use API Key SID + Secret as HTTP Basic.
 */
import { config } from 'dotenv';

config();

export function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

export function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

/** `Basic base64(SK:secret)` from TWILIO_API_KEY / TWILIO_API_SECRET. */
export function authHeader(): string {
  const key = required('TWILIO_API_KEY');
  const secret = required('TWILIO_API_SECRET');
  return 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');
}

/** A well-formed Twilio Type ID: `<prefix>_` + 26 lowercase alphanumerics. */
export function isRealId(value: string | undefined, prefix: string): value is string {
  return !!value && new RegExp(`^${prefix}_[0-9a-z]{26}$`).test(value);
}

/** Poll an async operation `statusUrl` until it completes (memory / CO create). */
export async function pollUntilComplete(statusUrl: string, attempts = 60): Promise<unknown> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(statusUrl, { headers: { Authorization: authHeader() } });
    const data = (await res.json()) as Record<string, unknown>;
    const status = String(data.status ?? data.state ?? data.operationStatus ?? '').toLowerCase();
    if (status.includes('complet') || status === 'active' || status === 'succeeded') return data;
    if (status.includes('fail')) throw new Error(`Operation failed: ${JSON.stringify(data)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Operation did not complete after ${attempts} attempts: ${statusUrl}`);
}
