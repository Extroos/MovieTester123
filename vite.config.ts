import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
        proxy: {
          '/vidsrc': {
            target: 'https://cinemovie-proxy.abderrahmanchakkouri.workers.dev',
            changeOrigin: true,
            followRedirects: true,
          },
          '/vidsrc-pm': {
            target: 'https://cinemovie-proxy.abderrahmanchakkouri.workers.dev',
            changeOrigin: true,
            followRedirects: true,
          },
          '/consumet': {
             target: 'https://api.consumet.org',
             changeOrigin: true,
             rewrite: (path) => path.replace(/^\/consumet/, ''),
          },
          '/proxy': {
            target: 'https://cinemovie-proxy.abderrahmanchakkouri.workers.dev', 
            changeOrigin: true,
          }
        }
      },
      plugins: [react()],
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-react': ['react', 'react-dom'],
              'vendor-motion': ['framer-motion'],
              'vendor-supabase': ['@supabase/supabase-js'],
              'vendor-hls': ['hls.js'],
              'vendor-query': ['react-query'],
            }
          }
        }
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
          'next-themes': path.resolve(__dirname, 'node_modules/next-themes'),
        }
      }
    };
});

