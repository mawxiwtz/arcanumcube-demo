import path from 'node:path';
import process from 'node:process';
import { readFile, writeFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const distDir = path.resolve(process.cwd(), 'dist');

const targets = [
    {
        source: 'arcanumcube-demo.esm.js',
        output: 'arcanumcube-demo.esm.min.js',
        format: 'esm',
    },
    {
        source: 'arcanumcube-demo.cjs',
        output: 'arcanumcube-demo.min.cjs',
        format: 'cjs',
    },
    {
        source: 'arcanumcube-demo.umd.js',
        output: 'arcanumcube-demo.umd.min.js',
        format: 'iife',
    },
];

const run = async () => {
    for (const target of targets) {
        const sourcePath = path.join(distDir, target.source);
        const outputPath = path.join(distDir, target.output);

        const sourceCode = await readFile(sourcePath, 'utf8');

        const result = await transform(sourceCode, {
            format: target.format,
            minify: true,
            legalComments: 'none',
            sourcefile: target.source,
            sourcemap: true,
            globalName: target.format === 'iife' ? 'ArcanumcubeDemo' : '',
        });

        const sourceMapFile = `${path.basename(target.output)}.map`;
        const minifiedCode =
            result.code + (result.map ? `\n//# sourceMappingURL=${sourceMapFile}\n` : '\n');

        await writeFile(outputPath, minifiedCode, 'utf8');

        if (result.map) {
            await writeFile(`${outputPath}.map`, result.map, 'utf8');
        }
    }
};

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
