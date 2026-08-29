import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // React in un chunk a parte: cambia raramente, quindi resta in cache
        // fra un deploy e l'altro. Il dizionario dei tentativi finisce da solo
        // in un chunk suo, perché e' caricato con un import dinamico.
        manualChunks(id) {
          if (id.includes('node_modules/react')) return 'react'
        },
      },
    },
  },
  server: { port: 5173, host: true },
})
