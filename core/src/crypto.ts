// Web Crypto only, so the same code runs on Node (20+) and Cloudflare Workers.

const VERSION = 'v2';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  // HKDF is enough here: AGENTHUB_SECRET is expected to be long and random.
  const base = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('agenthub-secrets-v2'), info: encoder.encode('member-secrets') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** AES-256-GCM encryption for member secrets (API keys) at rest. */
export class SecretBox {
  private key: Promise<CryptoKey>;

  constructor(secret: string) {
    this.key = deriveKey(secret);
  }

  async encrypt(plain: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.key, encoder.encode(plain)));
    const out = new Uint8Array(iv.length + data.length);
    out.set(iv);
    out.set(data, iv.length);
    return `${VERSION}:${toBase64(out)}`;
  }

  async decrypt(sealed: string): Promise<string> {
    const [version, payload] = sealed.split(':', 2);
    if (version !== VERSION || !payload) throw new Error('Unknown secret format');
    const raw = fromBase64(payload);
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, await this.key, raw.subarray(12));
      return decoder.decode(plain);
    } catch {
      throw new Error('无法解密已保存的 Key：AGENTHUB_SECRET 在保存之后被修改过');
    }
  }
}

/** Compares two strings without returning early on the first difference. */
export function safeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ (bb[i % bb.length] ?? 0);
  return diff === 0 && bb.length > 0;
}

/** "sk-abcdef123456" -> "sk-…3456" */
export function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 3)}…${value.slice(-4)}`;
}
