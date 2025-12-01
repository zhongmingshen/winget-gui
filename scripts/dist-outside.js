const { build } = require('electron-builder');
const path = require('path');
const fs = require('fs');

// Determine repository root (assumes script is in ./scripts)
const repoRoot = path.resolve(__dirname, '..');

(async () => {
    try {
        // Priority: BUILD_OUT_DIR env var -> repo publish folder -> system temp fallback
        let outDir = process.env.BUILD_OUT_DIR && process.env.BUILD_OUT_DIR.trim()
            ? path.resolve(process.env.BUILD_OUT_DIR)
            : path.join(repoRoot, 'publish');

        // Ensure directory exists
        try {
            fs.mkdirSync(outDir, { recursive: true });
        } catch (e) {
            // if mkdir fails, fall back to OS temp dir
            outDir = path.join(require('os').tmpdir(), 'winget-gui-build');
            fs.mkdirSync(outDir, { recursive: true });
        }

        console.log('electron-builder: Using output dir ->', outDir);

        await build({
            config: {
                directories: {
                    output: outDir
                }
            }
        });

        console.log('electron-builder: Build finished. Artifacts placed in', outDir);
    } catch (err) {
        console.error('electron-builder: Build failed:', err);
        process.exit(1);
    }
})();
