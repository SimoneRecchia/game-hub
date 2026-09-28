import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * Il dizionario dello Scarabeo anche compresso, accanto a quello intero.
 * Cloudflare non comprime i file binari, e il DAWG arriverebbe al telefono
 * intero, 1,3 MB: il browser scarica la copia gzip, che e' poco piu' della
 * meta', e la apre con DecompressionStream. Quello intero resta per il server,
 * che lo legge con env.ASSETS senza spendere CPU ad aprirlo.
 */
function dizionarioCompresso(): Plugin {
  return {
    name: 'dizionario-compresso',
    apply: 'build',
    generateBundle() {
      const intero = readFileSync(fileURLToPath(new URL('./public/scarabeo/dizionario.dawg', import.meta.url)))
      this.emitFile({ type: 'asset', fileName: 'scarabeo/dizionario.dawg.gz', source: gzipSync(intero, { level: 9 }) })
    },
  }
}

export default defineConfig({
  plugins: [react(), dizionarioCompresso()],
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
