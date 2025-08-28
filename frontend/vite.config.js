import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',              // <= IMPORTANT pour Electron (chemins relatifs)
  plugins: [react()],
  server: { port: 5173, strictPort: true }
})
