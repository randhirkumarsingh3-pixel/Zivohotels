import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    // Production builds leave out debug messages (console.log / console.debug); warnings and
    // errors stay so problems can still be seen in the browser console
    esbuild: mode === 'production' ? { pure: ['console.log', 'console.debug'] } : {},
    build: {
      rollupOptions: {
        output: {
          // Libraries change rarely, so they go in their own files that browsers keep cached
          // between releases; each page's own code loads when that page is opened (see App.jsx)
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            forms: ['react-hook-form', 'react-day-picker', 'date-fns'],
            icons: ['lucide-react'],
          },
        },
      },
    },
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
  };
})
