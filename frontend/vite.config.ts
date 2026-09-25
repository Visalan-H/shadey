import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const api = 'http://localhost:3001';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    build: { outDir: 'dist', emptyOutDir: true },
    server: { proxy: { '/api': api, '/p/': api, '/og/': api } },
});
