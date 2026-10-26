import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The dev and preview servers' SPA fallback would answer /emma with the main app; send it to its own page (vercel.json does the same).
const toEmma = (req: { url?: string }, _res: unknown, next: () => void) => {
  if (req.url?.match(/^\/emma(\?|$)/)) req.url = req.url.replace('/emma', '/emma/')
  next()
}
const emmaRoute: Plugin = {
  name: 'emma-route',
  configureServer: (server) => void server.middlewares.use(toEmma),
  configurePreviewServer: (server) => void server.middlewares.use(toEmma),
}

export default defineConfig({
  plugins: [react(), emmaRoute],
  build: {
    target: 'es2022',
    rollupOptions: {
      // One page per entry: / is the explorer, /emma the visit guide.
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        emma: fileURLToPath(new URL('emma/index.html', import.meta.url)),
      },
      output: {
        // React gets its own chunk so /emma doesn't pull in three/r3f just for it.
        manualChunks(id) {
          const pkg = id.match(/node_modules\/(@react-three\/[^/]+|[^/@.][^/]*)\//g)?.pop()
          if (!pkg) return
          if (/\/(react|react-dom|scheduler)\/$/.test(pkg)) return 'react'
          if (pkg === 'node_modules/three/') return 'three'
          if (pkg.includes('@react-three/')) return 'r3f'
        },
      },
    },
  },
})
