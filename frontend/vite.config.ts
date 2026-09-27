/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    // In production Vercel forwards these paths instead, see vercel.json.
    const api = loadEnv(mode, '.').VITE_API_URL || 'http://localhost:3001';
    return {
        plugins: [react(), tailwindcss()],
        build: { outDir: 'dist', emptyOutDir: true },
        server: { proxy: { '/api': api, '/p/': api, '/og/': api } },
        test: { environment: 'jsdom', setupFiles: ['src/test/setup.ts'] },
    };
});
