import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    // Sanity check in dev so misconfiguration is caught early
    if (!env.GEMINI_API_KEY) {
        console.warn('[scribe] GEMINI_API_KEY is not set. Transcription will fail.');
    }

    return {
      // GitHub Pages serves this project at https://<user>.github.io/Scribe/,
      // so asset URLs must be relative to that sub-path (not the domain root).
      base: '/Scribe/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.REACT_APP_GOOGLE_CLIENT_ID': JSON.stringify(env.GOOGLE_CLIENT_ID || ''),
        // Cobalt API configuration for social media URL import
        // Note: COBALT_API_KEY is kept server-side in the Worker (functions/proxy.ts)
        // This is only needed if the client needs to know the instance URL
        'import.meta.env.VITE_COBALT_API_URL': JSON.stringify(env.COBALT_API_URL || '')
      },
      envPrefix: 'VITE_',
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});