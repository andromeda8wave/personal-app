import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
const REPO = 'canvas-finance-tracker'
export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? `/${REPO}/` : '/'
})