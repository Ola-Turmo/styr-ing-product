import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : entry.name.endsWith('.astro') ? [file] : [];
  });
}

let total = 0;
let failures = 0;
for (const file of walk('src/pages')) {
  const source = readFileSync(file, 'utf8');
  const scripts = /<script(?:[^>]*)>([\s\S]*?)<\/script>/g;
  let match;
  let index = 0;
  while ((match = scripts.exec(source))) {
    index += 1;
    total += 1;
    try {
      Function(match[1]);
    } catch (error) {
      failures += 1;
      console.error(`Inline script failed: ${file} (${index})`);
      console.error(error instanceof Error ? error.message : String(error));
    }
  }
}

if (existsSync('dist')) {
  const walkHtml = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? walkHtml(file) : entry.name.endsWith('.html') ? [file] : [];
  });
  for (const file of walkHtml('dist')) {
    const source = readFileSync(file, 'utf8');
    const scripts = /<script(?:[^>]*)>([\s\S]*?)<\/script>/g;
    let match;
    let index = 0;
    while ((match = scripts.exec(source))) {
      index += 1;
      if (!match[1].trim() || /type=["']application\/ld\+json["']/.test(match[0])) continue;
      total += 1;
      try {
        new vm.Script(match[1], { filename: `${file}#script-${index}` });
      } catch (error) {
        failures += 1;
        console.error(`Built script failed: ${file} (${index})`);
        console.error(error instanceof Error ? error.message : String(error));
      }
    }
  }
}
if (failures) process.exit(1);
console.log(`INLINE SCRIPT SYNTAX: PASS (${total} scripts)`);
