import type { FileStore } from '@agenthub/core';

/** Stores uploads in a Cloudflare R2 bucket; the type and name travel with the object. */
export class R2FileStore implements FileStore {
  constructor(private bucket: R2Bucket) {}

  async put(key: string, data: Uint8Array, meta: { contentType: string; name: string }) {
    await this.bucket.put(key, data, {
      httpMetadata: { contentType: meta.contentType },
      // Header-safe: file names can contain any characters.
      customMetadata: { name: encodeURIComponent(meta.name) },
    });
  }

  async get(key: string) {
    const object = await this.bucket.get(key);
    if (!object) return null;
    return {
      data: new Uint8Array(await object.arrayBuffer()),
      contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
      name: decodeURIComponent(object.customMetadata?.name ?? ''),
    };
  }

  async delete(key: string) {
    await this.bucket.delete(key);
  }
}
