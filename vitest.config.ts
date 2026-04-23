import { defineConfig } from 'vitest/config'
import path from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // Default environment for API/engine/pure-function tests.
    environment: 'node',
    globals: true,
    // Component tests declare "// @vitest-environment jsdom" at the top of the file.
    setupFiles: ['./tests/setup-dom.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
