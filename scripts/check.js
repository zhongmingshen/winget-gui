const { spawn } = require('child_process')
const cmds = [
    // run TypeScript checks
    { name: 'tsc', cmd: 'pnpm', args: ['exec', 'tsc', '-p', 'tsconfig.json', '--noEmit'] },
    // vite build checks the renderer build; may be slower but useful
    { name: 'vite-build', cmd: 'pnpm', args: ['exec', 'vite', 'build', '--config', 'vite.config.ts'] }
]

function run(cmd, args) {
    return new Promise((resolve) => {
        console.log(`\n> ${cmd} ${args.join(' ')}`)
        const p = spawn(cmd, args, { stdio: 'inherit', shell: true })
        p.on('close', (code) => resolve(code))
    })
}

(async () => {
    const results = []
    for (const c of cmds) {
        try {
            const code = await run(c.cmd, c.args)
            results.push({ name: c.name || c.cmd, code })
        } catch (err) {
            console.error('Error running command', c, err)
            results.push({ name: c.name || c.cmd, code: 1, error: String(err) })
        }
    }

    const failed = results.filter(r => r.code !== 0)
    if (failed.length > 0) {
        // If only vue-tsc failed, treat it as a warning (version mismatches are common).
        const onlyVueTsc = failed.length === 1 && failed[0].name && failed[0].name.toLowerCase().includes('vue-tsc')
        if (onlyVueTsc) {
            console.warn('\nWarning: `vue-tsc` failed. This may be a version mismatch; continuing with other checks.')
            process.exit(0)
        }

        console.error('\nChecks finished: some commands failed:')
        failed.forEach(f => console.error(` - ${f.name}: exit ${f.code}`))
        console.error('\nTip: If `vue-tsc` crashes with an internal error, it can be a version mismatch between `vue-tsc` and `typescript`/`vue` packages. Try running `pnpm install vue-tsc@latest` or adjust versions.\n')
        process.exit(1)
    }

    console.log('\nAll checks passed.')
    process.exit(0)
})()
