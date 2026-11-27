import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  // The app has no path routing. A missing file is a 404, as on GitHub Pages, not the app page.
  appType: 'mpa',
  plugins: [react()],
  // The validator library uses top-level await, which module workers support but the default iife format does not.
  worker: { format: 'es' },
})
