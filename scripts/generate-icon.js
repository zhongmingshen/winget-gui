const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
// png-to-ico v3 is ESM-only; load dynamically inside async function
let pngToIco;

async function generate() {
    const repoRoot = path.resolve(__dirname, '..');
    const buildDir = path.join(repoRoot, 'build');
    const svgPath = path.join(buildDir, 'icon.svg');
    const outIco = path.join(buildDir, 'icon.ico');

    if (!fs.existsSync(svgPath)) {
        console.error('icon.svg not found at', svgPath);
        process.exit(1);
    }

    const sizes = [256, 128, 64, 48, 32, 16];
    const tempPngs = [];

    try {
        const svgBuffer = fs.readFileSync(svgPath);
        for (const s of sizes) {
            const outPng = path.join(buildDir, `icon-${s}.png`);
            await sharp(svgBuffer).resize(s, s).png().toFile(outPng);
            tempPngs.push(outPng);
        }

        // dynamically import png-to-ico (ESM)
        pngToIco = (await import('png-to-ico')).default;
        const icoBuffer = await pngToIco(tempPngs);
        fs.writeFileSync(outIco, icoBuffer);
        console.log('Generated', outIco);
    } catch (err) {
        console.error('Failed to generate icon.ico:', err);
        process.exit(1);
    } finally {
        // cleanup temp pngs
        for (const p of tempPngs) {
            try { fs.unlinkSync(p); } catch (e) { }
        }
    }
}

generate();
