import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { transform } from 'esbuild';

const root = resolve('functions/api');
const failures = [];
let fileCount = 0;
const malformedSql = [/\bSELECT\s+FROM\b/i, /\bFROM\s+(?:WHERE|LEFT\s+JOIN|RIGHT\s+JOIN|JOIN|ORDER|GROUP|LIMIT)\b/i, /\bAS\s+FROM\b/i, /\bUPDATE\s+SET\s+WHERE\b/i, /\bJOIN\s+ON\s*(?:WHERE|GROUP|ORDER|LIMIT)\b/i, /\bWHERE\s+AND\b/i, /\bCOUNT\(\s*\*\s*\)\s+AS\s+FROM\b/i];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await walk(path); continue; }
    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.js')) continue;
    fileCount += 1;
    const source = await readFile(path, 'utf8');
    const label = relative(process.cwd(), path);
    try { await transform(source, { loader: entry.name.endsWith('.ts') ? 'ts' : 'js', target: 'es2022' }); }
    catch (error) { failures.push(`${label}: kan ikke transpileres (${error.message.split('\n')[0]})`); }
    for (const pattern of malformedSql) if (pattern.test(source)) failures.push(`${label}: malformed SQL pattern ${pattern}`);
    if (/\.prepare\(\s*`[^`]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(source) && !source.includes('requireDb')) failures.push(`${label}: database route prepares SQL without requireDb guard`);
  }
}

await walk(root);
if (failures.length) {
  console.error(`API INTEGRITY: FAIL (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`API INTEGRITY: PASS (${fileCount} API modules)`);
