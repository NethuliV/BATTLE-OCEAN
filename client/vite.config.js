import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const backendPort = Number(
  process.env.BACKEND_PORT || process.env.VITE_BACKEND_PORT || 5004,
)

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
      '/socket.io': {
        target: `http://localhost:${backendPort}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
