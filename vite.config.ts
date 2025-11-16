import path from 'node:path';
import { defineConfig } from 'vite';

const libEntry = path.resolve(__dirname, 'src/index.ts');

export default defineConfig({
    build: {
        lib: {
            entry: libEntry,
            name: 'ArcanumcubeDemo',
            fileName: (format) => {
                switch (format) {
                    case 'es':
                        return 'arcanumcube-demo.esm.js';
                    case 'cjs':
                        return 'arcanumcube-demo.cjs';
                    case 'umd':
                    default:
                        return 'arcanumcube-demo.umd.js';
                }
            },
            formats: ['es', 'cjs', 'umd'],
        },
        minify: false,
        sourcemap: true,
        rollupOptions: {
            output: {
                exports: 'named',
                globals: {
                    arcanumcube: 'ARCCUBE',
                    three: 'THREE',
                    '@tweenjs/tween.js': 'TWEEN',
                },
            },
            external: ['arcanumcube', 'three', '@tweenjs/tween.js'],
        },
    },
});
