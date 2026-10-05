import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    env: { DATABASE_URL: 'postgresql://postgres@localhost:5432/ita_test' },
    fileParallelism: false,
    testTimeout: 30000,
  },
});
