const { build } = require('esbuild');
const path = require('path');

(async () => {
    try {
        const repoRoot = path.resolve(__dirname, '..');
        const mainEntry = path.resolve(repoRoot, 'src/main/main.ts');
        const preloadEntry = path.resolve(repoRoot, 'src/main/preload.ts');
        const outMain = path.resolve(repoRoot, 'dist/main/index.js');
        const outPreload = path.resolve(repoRoot, 'dist/main/preload.js');

        // build main
        await build({
            entryPoints: [mainEntry],
            bundle: true,
            platform: 'node',
            target: ['node18'],
            outfile: outMain,
            sourcemap: false,
            external: ['electron']
        });
        console.log('Built main process to', outMain);

        // build preload
        await build({
            entryPoints: [preloadEntry],
            bundle: true,
            platform: 'node',
            target: ['node18'],
            outfile: outPreload,
            sourcemap: false,
            external: ['electron']
        });
        console.log('Built preload script to', outPreload);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
