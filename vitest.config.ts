import { defineConfig, mergeConfig } from 'vitest/config'
import vite from './vite.config'

export default mergeConfig(
  vite,
  defineConfig({
    test: {
      include: ['src/**/*.test.ts'],
      // The project is also checked out in an agent worktree that carries its own
      // copies of these files. Only this tree's tests should run, or every count
      // is quietly doubled and failures get lost in the noise.
      exclude: ['**/node_modules/**', '**/dist/**', '**/.kilo/**'],
    },
  }),
)
