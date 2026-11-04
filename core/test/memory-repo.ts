/** In-memory branches shared by the forge fakes. */
export class MemoryBranches {
  private n = 0;
  private snaps = new Map<string, Map<string, string>>();
  private tips = new Map<string, string>();

  constructor(initial: Record<string, string>, base = 'main') {
    this.commit(base, new Map(Object.entries(initial)));
  }

  private commit(branch: string, files: Map<string, string>): string {
    const hash = `commit-${++this.n}`;
    this.snaps.set(hash, new Map(files));
    this.tips.set(branch, hash);
    return hash;
  }

  tip(branch: string): string | undefined {
    return this.tips.get(branch);
  }

  has(branch: string): boolean {
    return this.tips.has(branch);
  }

  names(): string[] {
    return [...this.tips.keys()];
  }

  files(branch: string): Record<string, string> {
    const hash = this.tips.get(branch);
    if (!hash) return {};
    return Object.fromEntries(this.snaps.get(hash)!);
  }

  read(branch: string, path: string): string | undefined {
    const hash = this.tips.get(branch);
    return hash ? this.textAt(hash, path) : undefined;
  }

  textAt(hash: string, path: string): string | undefined {
    return this.snaps.get(hash)?.get(path);
  }

  branchFrom(from: string, to: string): boolean {
    const hash = this.tips.get(from);
    if (!hash || this.tips.has(to)) return false;
    this.commit(to, new Map(this.snaps.get(hash)!));
    return true;
  }

  branchFromHash(hash: string, to: string): boolean {
    const files = this.snaps.get(hash);
    if (!files || this.tips.has(to)) return false;
    this.commit(to, new Map(files));
    return true;
  }

  update(branch: string, mutate: (files: Map<string, string>) => void): boolean {
    const hash = this.tips.get(branch);
    if (!hash) return false;
    const next = new Map(this.snaps.get(hash)!);
    mutate(next);
    this.commit(branch, next);
    return true;
  }

  /** Point `target` at a copy of `source` and return the new commit id. */
  replaceWith(target: string, source: string): string | undefined {
    const hash = this.tips.get(source);
    if (!hash) return undefined;
    return this.commit(target, new Map(this.snaps.get(hash)!));
  }

  delete(branch: string): void {
    this.tips.delete(branch);
  }

  list(branchOrHash: string, dir: string, byHash = false): { path: string; type: 'file' | 'dir'; size: number }[] | 'missing' | 'file' {
    const files = byHash ? this.snaps.get(branchOrHash) : this.snaps.get(this.tips.get(branchOrHash) ?? '');
    if (!files) return 'missing';
    if (dir && files.has(dir)) return 'file';
    const prefix = dir ? `${dir}/` : '';
    if (dir && ![...files.keys()].some((file) => file.startsWith(prefix))) return 'missing';
    const entries = new Map<string, { type: 'file' | 'dir'; size: number }>();
    for (const [file, text] of files) {
      if (!file.startsWith(prefix)) continue;
      const [first, ...rest] = file.slice(prefix.length).split('/');
      const path = prefix + first;
      if (rest.length) entries.set(path, { type: 'dir', size: 0 });
      else if (!entries.has(path)) entries.set(path, { type: 'file', size: text.length });
    }
    return [...entries.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, entry]) => ({ path, ...entry }));
  }
}
