import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';
// Fixed salt: the secret itself is expected to be long and random (see .env.example).
const SALT = 'agenthub-secrets-v1';

/** AES-256-GCM encryption for member secrets (API keys) at rest. */
export class SecretBox {
  private key: Buffer;

  constructor(secret: string) {
    this.key = scryptSync(secret, SALT, 32);
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${VERSION}:${Buffer.concat([iv, tag, data]).toString('base64')}`;
  }

  decrypt(sealed: string): string {
    const [version, payload] = sealed.split(':', 2);
    if (version !== VERSION || !payload) throw new Error('Unknown secret format');
    const raw = Buffer.from(payload, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    try {
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    } catch {
      throw new Error('Cannot decrypt stored secret: AGENTHUB_SECRET has changed since it was saved');
    }
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** "sk-abcdef123456" -> "sk-…3456" */
export function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 3)}…${value.slice(-4)}`;
}
