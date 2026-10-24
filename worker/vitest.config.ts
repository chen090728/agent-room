import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Relays run through Durable Object alarms; give them room on slow CI.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
