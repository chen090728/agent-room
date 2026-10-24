import type { IntegrationType } from './types.js';

export class IntegrationRegistry {
  private types = new Map<string, IntegrationType>();

  register(type: IntegrationType): this {
    this.types.set(type.type, type);
    return this;
  }

  get(type: string): IntegrationType | undefined {
    return this.types.get(type);
  }

  list(): IntegrationType[] {
    return [...this.types.values()];
  }
}
