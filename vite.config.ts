import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server's SPA fallback would answer /emma with the main app; send it to its own page (vercel.json does the same).
const emmaRoute: Plugin = {
  name: 'emma-route',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url?.match(/^\/emma(\?|$)/)) req.url = req.url.replace('/emma', '/emma/')
      next()
    })
  },
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
        manualChunks: { three: ['three'], r3f: ['@react-three/fiber', '@react-three/drei'] },
      },
    },
  },
})
