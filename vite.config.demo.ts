import path from 'node:path';
import { defineConfig } from 'vite';

const libEntry = path.resolve(__dirname, 'src/index.ts');

export default defineConfig({
    base: './',
    resolve: {
        alias: {
            '@arcanumcube-demo': path.resolve(__dirname, 'src'),
        },
    },
    build: {
        lib: {
            entry: libEntry,
            name: 'ArcanumcubeDemo',
            fileName: 'demo',
            formats: ['es'],
        },
        emptyOutDir: false,
        outDir: 'dist',
        minify: false,
        rollupOptions: {
            input: 'index.html',
            output: {
                exports: 'named',
                paths: {
                    '@arcanumcube-demo': 'arcanumcube-demo',
                },
            },
            external: ['@arcanumcube-demo', 'arcanumcube'],
        },
    },
});
