import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve('src/pages');
const failures = [];
let pageCount = 0;
let scriptCount = 0;
const componentContracts = {
  'src/components/EHFInboxQuick.astro': ['name="currency"', 'value="NOK"', 'name="documentRef"', 'name="supplierName"'],
  'src/components/ReceivablesPayablesQuick.astro': ['<section class="cash-control"', 'id="cash-payment-form"', 'id="collection-case-form"', '<script is:inline>', '</script>', '<style>', '</style>'],
};

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await walk(path); continue; }
    if (!entry.name.endsWith('.astro')) continue;
    pageCount += 1;
    const source = await readFile(path, 'utf8');
    const label = relative(process.cwd(), path);
    for (const token of componentContracts[label] || []) if (!source.includes(token)) failures.push(`${label}: mangler nødvendig brukerfelt (${token})`);
    if (!source.startsWith('---\n') && !source.startsWith('---\r\n')) failures.push(`${label}: mangler gyldig Astro-frontmatter`);
    for (const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      scriptCount += 1;
      try { new vm.Script(match[1], { filename: label }); }
      catch (error) { failures.push(`${label}: ugyldig nettleser-JavaScript (${error.message})`); }
    }
    const ids = [...source.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]).filter((id) => !id.includes('{'));
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    if (duplicates.length) failures.push(`${label}: dupliserte HTML-id-er (${duplicates.join(', ')})`);
    for (const pattern of [/x-styr-api-key/i, /preview-write/i, /sk_(?:live|test)_[a-z0-9]+/i, /CLOUDFLARE_API_TOKEN/i]) if (pattern.test(source)) failures.push(`${label}: mulig skrivehemmelighet eller API-nøkkel i offentlig side`);
  }
}

await walk(root);
if (failures.length) {
  console.error(`SOURCE INTEGRITY: FAIL (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`SOURCE INTEGRITY: PASS (${pageCount} sider, ${scriptCount} nettleserskript)`);
