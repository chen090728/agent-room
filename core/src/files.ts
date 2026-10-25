import type { Attachment, AttachmentKind } from './types.js';

/** Where uploaded bytes live: a local directory on Node, an R2 bucket on Cloudflare. */
export interface FileStore {
  put(key: string, data: Uint8Array, meta: { contentType: string; name: string }): Promise<void>;
  get(key: string): Promise<{ data: Uint8Array; contentType: string; name: string } | null>;
  delete(key: string): Promise<void>;
}

/** In-memory store for tests. */
export class MemoryFileStore implements FileStore {
  readonly items = new Map<string, { data: Uint8Array; contentType: string; name: string }>();

  async put(key: string, data: Uint8Array, meta: { contentType: string; name: string }) {
    this.items.set(key, { data: new Uint8Array(data), ...meta });
  }
  async get(key: string) {
    return this.items.get(key) ?? null;
  }
  async delete(key: string) {
    this.items.delete(key);
  }
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 6;

/** Limits on what is put in front of a model. */
export const MAX_TEXT_CHARS_PER_FILE = 30_000;
export const MAX_TEXT_CHARS_TOTAL = 100_000;
export const MAX_IMAGES_PER_REQUEST = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const IMAGE_EXTENSIONS: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

const TEXT_EXTENSIONS = new Set(
  (
    'txt md markdown rst log csv tsv json jsonc yaml yml toml ini cfg conf env xml html htm css scss less ' +
    'js mjs cjs jsx ts tsx py rb go rs java kt kts swift c h cc cpp hpp cs php sh bash zsh ps1 sql graphql proto ' +
    'lua r dart vue svelte tex gradle makefile dockerfile gitignore'
  ).split(' '),
);

const extensionOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : name.toLowerCase());

/**
 * Decides how a file is used, or null when it is not supported. Images and
 * PDFs are matched by type; text and code by type or extension.
 */
export function classifyFile(name: string, mime: string): { kind: AttachmentKind; mime: string } | null {
  const type = mime.split(';')[0].trim().toLowerCase();
  const ext = extensionOf(name);
  if (IMAGE_MIMES.has(type)) return { kind: 'image', mime: type };
  if (!type || type === 'application/octet-stream') {
    if (IMAGE_EXTENSIONS[ext]) return { kind: 'image', mime: IMAGE_EXTENSIONS[ext] };
  }
  if (type === 'application/pdf' || ext === 'pdf') return { kind: 'pdf', mime: 'application/pdf' };
  if (
    type.startsWith('text/') ||
    ['application/json', 'application/xml', 'application/x-yaml', 'application/javascript', 'application/x-sh'].includes(type) ||
    TEXT_EXTENSIONS.has(ext)
  ) {
    return { kind: 'text', mime: 'text/plain' };
  }
  return null;
}

/** Keeps a file name harmless: no path parts, no control characters, bounded length. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim().slice(-120);
  return cleaned || '文件';
}

export const fileKey = (groupId: string, fileId: string) => `${groupId}/${fileId}`;

/** Extracts the text of a PDF. Returns '' when it has none (e.g. a scanned document). */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join('\n') : text).trim();
}

export function decodeText(data: Uint8Array): string {
  return new TextDecoder().decode(data).replace(/\u0000/g, '');
}

export function toBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(binary);
}

// ---- signed download links ----
// Opening a file in the phone's browser cannot send an Authorization header,
// so the App asks for a short-lived signed link instead.

const encoder = new TextEncoder();

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(`agenthub-file-links:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function signFileLink(secret: string, groupId: string, fileId: string, expiresAt: number): Promise<string> {
  return hex(await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(`${groupId}/${fileId}/${expiresAt}`)));
}

export async function verifyFileLink(secret: string, groupId: string, fileId: string, expiresAt: number, signature: string): Promise<boolean> {
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = await signFileLink(secret, groupId, fileId, expiresAt);
  // Constant-time comparison.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export type { Attachment };
