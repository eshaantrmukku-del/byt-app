import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Rules tests use the app's own write builders, so they need the same alias.
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
