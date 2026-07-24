/**
 * Builds the ordered list of Memora identifier candidates used to resolve a
 * customer profile, derived from the Flex task.
 *
 * The CHANNEL is known from the task, so we decide which identifier types to
 * try here (client-side) rather than having the serverless proxy sniff value
 * formats. The proxy just tries each candidate against Memora's Lookup
 * (`{ idType, value }`) in order — which mirrors Memora's flexible identifiers
 * (phone, email, whatsapp, custom ids) and means adding a new id type is a
 * client-only change with no proxy redeploy.
 *
 * Ordering: the channel-native identifier first, then the "universal"
 * identifiers (phone, email) that Memora can also resolve by — so a WhatsApp
 * task whose address is a Meta username still falls back to a phone taken from
 * a *different* attribute.
 */

export interface IdentifierCandidate {
  idType: string;
  value: string;
}

const ADDRESS_KEYS = ['customerAddress', 'from'];
const PHONE_KEYS = ['customerPhone', 'customerAddress', 'from', 'to'];
const EMAIL_KEYS = ['email', 'customerEmail'];

function firstString(attrs: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = attrs[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** First attribute that yields an E.164 phone (whatsapp: prefix stripped). */
function firstPhone(attrs: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = attrs[key];
    if (typeof value !== 'string') continue;
    const stripped = value.replace(/^whatsapp:/i, '').trim();
    if (stripped.startsWith('+')) return stripped;
  }
  return null;
}

function firstEmail(attrs: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = attrs[key];
    if (typeof value === 'string' && value.includes('@')) return value.trim();
  }
  return null;
}

export function buildIdentifierCandidates(attrs?: Record<string, unknown>): IdentifierCandidate[] {
  if (!attrs) return [];

  const address = firstString(attrs, ADDRESS_KEYS);
  const phone = firstPhone(attrs, PHONE_KEYS);
  const email = firstEmail(attrs, EMAIL_KEYS);

  // Prefer the task's declared channel; fall back to inferring from the address.
  const channel =
    (typeof attrs.channelType === 'string' && attrs.channelType.toLowerCase()) ||
    (address && /^whatsapp:/i.test(address) ? 'whatsapp' : '');

  const candidates: IdentifierCandidate[] = [];
  const push = (idType: string, value: string | null) => {
    if (!value) return;
    if (candidates.some((c) => c.idType === idType && c.value === value)) return;
    candidates.push({ idType, value });
  };

  // 1) Channel-native identifier first.
  switch (channel) {
    case 'whatsapp':
      if (address) push('whatsapp', address); // raw — keep the whatsapp: prefix
      break;
    case 'email':
      push('email', email);
      break;
    case 'sms':
    case 'voice':
    case 'call':
      push('phone', phone);
      break;
    default:
      break;
  }

  // 2) Universal fallbacks Memora can also resolve by.
  push('phone', phone);
  push('email', email);

  return candidates;
}

/** Human-readable label for the panel header (prefers a phone; strips whatsapp:). */
export function describeIdentifier(candidates: IdentifierCandidate[]): string {
  if (candidates.length === 0) return '';
  const phone = candidates.find((c) => c.idType === 'phone');
  if (phone) return phone.value;
  return candidates[0].value.replace(/^whatsapp:/i, '');
}
