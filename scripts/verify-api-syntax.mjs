import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const esbuild = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : entry.name.endsWith('.ts') ? [file] : [];
  });
}
if (!existsSync(esbuild)) { console.error(`Missing local esbuild binary: ${esbuild}`); process.exit(1); }
const files = walk(join(root, 'functions'));
for (const file of files) {
  const result = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', esbuild, file, '--loader:.ts=ts', '--format=esm', '--log-level=error', '--outfile=.api-syntax-check.js'], { cwd: root, encoding: 'utf8', windowsHide: true })
    : spawnSync(esbuild, [file, '--loader:.ts=ts', '--format=esm', '--log-level=error', '--outfile=.api-syntax-check.js'], { cwd: root, encoding: 'utf8', windowsHide: true });
  rmSync(join(root, '.api-syntax-check.js'), { force: true });
  if (result.status !== 0) { console.error(`API syntax failed: ${relative(root, file)}\n${result.stderr || result.stdout}`); process.exit(result.status || 1); }
}
console.log(`API syntax OK (${files.length} TypeScript modules)`);
