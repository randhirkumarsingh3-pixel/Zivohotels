import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
        },
      },
    },
    define: {
      // Dynamic fallback for VITE_API_URL in production when not explicitly configured
      'import.meta.env.VITE_API_URL': JSON.stringify(
        process.env.VITE_API_URL || 
        (isProduction ? 'https://zivohotels-api.onrender.com/api/v1' : '')
      )
    }
  };
})
