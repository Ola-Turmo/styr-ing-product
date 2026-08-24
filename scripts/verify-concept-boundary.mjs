import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourcePath = resolve('src/pages/vilkar.astro');
const renderedPath = resolve('dist/vilkar/index.html');
const [source, rendered] = await Promise.all([
  readFile(sourcePath, 'utf8'),
  readFile(renderedPath, 'utf8'),
]);

const required = [
  'Vilkår for konseptdemoen',
  'Sidene er ikke en aktiv tjeneste, et abonnement eller et kjøpstilbud.',
  'ingen offentlig pris, registrering, innlogging, betaling, produktaktivering eller separat Styr.ing-pilot',
  'Ikke skriv inn virkelige personopplysninger',
  'En eventuell produksjonsløsning krever en separat, uttrykkelig bestilling eller kundeavtale.',
];

const forbidden = [
  'Du er ansvarlig for dine kontoopplysninger',
  'Abonnement og betaling',
  'Funksjoner merket "beta" eller "preview"',
  'Vi kan suspendere eller avslutte kontoen din',
  'DET DU BETALTE OSS I DE 12 SISTE MÅNEDENE',
];

const failures = [];
for (const text of required) {
  if (!source.includes(text) || !rendered.includes(text)) {
    failures.push(`missing required boundary text: ${text}`);
  }
}
for (const text of forbidden) {
  if (source.includes(text) || rendered.includes(text)) {
    failures.push(`stale service-contract text remains: ${text}`);
  }
}

if (failures.length > 0) {
  console.error(`CONCEPT BOUNDARY: FAIL (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`CONCEPT BOUNDARY: PASS (${required.length + forbidden.length} checks)`);
