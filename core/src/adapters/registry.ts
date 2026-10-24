import type { MemberAdapter } from './types.js';

export class AdapterRegistry {
  private adapters = new Map<string, MemberAdapter>();

  register(adapter: MemberAdapter): this {
    this.adapters.set(adapter.type, adapter);
    return this;
  }

  get(type: string): MemberAdapter | undefined {
    return this.adapters.get(type);
  }

  list(): MemberAdapter[] {
    return [...this.adapters.values()];
  }
}
