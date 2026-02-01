import { defineConfig, type PluginOption } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
    base: './',
    plugins: [
        process.env.ANALYZE
            ? (visualizer({
                template: 'raw-data',
                filename: 'dist/bundle-stats.json',
                gzipSize: true,
                brotliSize: true,
            }) as PluginOption)
            : null,
    ],
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
