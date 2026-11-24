import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // The validator library uses top-level await, which module workers support but the default iife format does not.
  worker: { format: 'es' },
})
