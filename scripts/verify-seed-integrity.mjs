import { readFile } from 'node:fs/promises';

const [schema, seed] = await Promise.all([
  readFile('d1/schema.sql', 'utf8'),
  readFile('d1/seed.sql', 'utf8'),
]);

const failures = [];
const tableNames = new Set(
  [...schema.matchAll(/CREATE TABLE IF NOT EXISTS\s+([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]),
);
const statements = [...seed.matchAll(/INSERT OR IGNORE INTO\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s+VALUES\s*([\s\S]*?);/g)];

if (statements.length === 0) failures.push('seed.sql inneholder ingen INSERT-setninger');
if (statements.length !== (seed.match(/INSERT OR IGNORE INTO/g) || []).length) {
  failures.push('alle INSERT-setninger må ha tabell, kolonneliste, VALUES og semikolon');
}
for (const match of statements) {
  const [, table, columns, values] = match;
  if (!tableNames.has(table)) failures.push(`seed refererer til ukjent tabell: ${table}`);
  const columnNames = columns.split(',').map((column) => column.trim()).filter(Boolean);
  if (columnNames.length === 0) failures.push(`${table}: tom kolonneliste`);
  if (!/^\s*\(/.test(values)) {
    failures.push(`${table}: VALUES må være omsluttet av parenteser`);
  }
}
for (const pattern of [
  /INSERT OR IGNORE INTO\s+VALUES\b/i,
  /VALUES\s+\d+:/,
  /INSERT OR IGNORE INTO\s+[A-Za-z_][A-Za-z0-9_]*\s+VALUES\s+VALUES/i,
]) {
  if (pattern.test(seed)) failures.push(`mistenkelig seed-format: ${pattern}`);
}

if (failures.length) {
  console.error(`SEED INTEGRITY: FAIL (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`SEED INTEGRITY: PASS (${statements.length} INSERT-setninger, ${tableNames.size} skjema-tabeller)`);
