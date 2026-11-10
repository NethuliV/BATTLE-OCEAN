import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const backendPort = Number(
  process.env.BACKEND_PORT || process.env.VITE_BACKEND_PORT || 5005,
)

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{js,ts}'],
  },
  server: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
      },
      '/socket.io': {
        target: `http://127.0.0.1:${backendPort}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
