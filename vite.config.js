import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Built pages ask for the main text font straight away, before the stylesheet is read, so text
// shows in the right font sooner (the font file name has a hash, so it's added at build time)
const preloadFonts = () => ({
  name: 'preload-fonts',
  apply: 'build',
  transformIndexHtml(html, ctx) {
    const files = Object.keys(ctx.bundle || {}).filter((f) => /inter-latin-wght-normal.*\.woff2$/.test(f));
    return files.map((f) => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${f}`, crossorigin: '' }, injectTo: 'head' }));
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [react(), preloadFonts()],
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
