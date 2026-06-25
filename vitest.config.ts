import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      // The data layer imports `server-only`, whose default export throws to
      // block use from client bundles. Under vitest there is no client bundle,
      // so resolve it to the package's empty server build.
      'server-only': fileURLToPath(
        new URL('./node_modules/server-only/empty.js', import.meta.url),
      ),
      // Mirror the tsconfig `@/*` path alias so server actions and data modules
      // resolve the same way they do under Next.js.
      '@': root.replace(/\/$/, ''),
    },
  },
})
