import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        target: 'es2018',
        sourcemap: true,
    },
    server: {
        port: 5173,
        strictPort: true,
    },
});
