import esbuild from 'esbuild';
import chalk from 'chalk';
import fse from 'fs-extra';

const progname = 'demo';
const srcdir = './src';
const sources = [`${srcdir}/main.ts`];
const externals = [];
const destdir = './dist';
const staticdir = './static';
const isServeMode = process.argv.includes('--serve');

// create directory and copy files
try {
    fse.rmSync(destdir, { recursive: true, force: true });
    fse.mkdirsSync(destdir);
    fse.copyFileSync(`${staticdir}/index.html`, `${destdir}/index.html`);
    fse.copySync(`${staticdir}/asset`, `${destdir}/asset`);
    fse.copySync(`${staticdir}/img`, `${destdir}/img`);
} catch (err) {
    console.error(`[${chalk.red('copying files or directories for distibution failed:')}]\n`, err);
    process.exit(1);
}

/////////////////////////////////////
// build ESM library and start server
const buildOptionsESM = {
    target: 'esnext',
    platform: 'node',
    format: 'esm',
    entryPoints: sources,
    outfile: `${destdir}/${progname}.js`,
    bundle: true,
    minify: true,
    sourcemap: true,
    external: externals,
};

if (isServeMode) {
    // with test server
    let ctx = await esbuild.context({
        ...buildOptionsESM,
        plugins: [
            {
                name: 'on-end',
                setup(build) {
                    build.onEnd((result) => {
                        const message = `Sources rebuilded (error: ${result.errors.length}, warning: ${result.warnings.length})`;
                        console.log(`${chalk.cyan(message)}`);
                    });
                },
            },
        ],
    });

    await ctx.watch();
    console.log(`[${chalk.green('Watching source files ...')}]`);

    await ctx.serve({
        host: 'localhost',
        port: 3000,
        servedir: `${destdir}/`,
    });
    console.log(`[${chalk.green('Web server starting ...')}]`);
} else {
    // build only
    await esbuild.build(buildOptionsESM);
}
