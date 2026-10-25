import type { FileStore } from '@agenthub/core';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const KEY = /^[\w-]+\/[\w-]+$/;

/** Stores uploads as plain files under a directory, with a small JSON file for the type and name. */
export class LocalFileStore implements FileStore {
  constructor(private dir: string) {}

  private paths(key: string) {
    // Keys are "groupId/fileId" made of safe characters; anything else could escape the directory.
    if (!KEY.test(key)) throw new Error('invalid file key');
    return { data: join(this.dir, key), meta: join(this.dir, `${key}.json`) };
  }

  async put(key: string, data: Uint8Array, meta: { contentType: string; name: string }) {
    const p = this.paths(key);
    await mkdir(dirname(p.data), { recursive: true });
    await writeFile(p.data, data);
    await writeFile(p.meta, JSON.stringify(meta));
  }

  async get(key: string) {
    const p = this.paths(key);
    try {
      const [data, meta] = await Promise.all([readFile(p.data), readFile(p.meta, 'utf8')]);
      const { contentType, name } = JSON.parse(meta);
      return { data: new Uint8Array(data), contentType, name };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    const p = this.paths(key);
    await Promise.all([rm(p.data, { force: true }), rm(p.meta, { force: true })]);
  }
}
