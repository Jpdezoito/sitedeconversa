import { readFile, writeFile } from 'node:fs/promises';
const project = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const configured = process.env.ELO_SERVER_URL ?? project.eloServerUrl;
let serverUrl = '';
if (configured) {
  const url = new URL(configured.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('ELO_SERVER_URL deve ser uma origem HTTPS.');
  serverUrl = url.origin;
}
await writeFile(new URL('../desktop/server-config.json', import.meta.url), JSON.stringify({ serverUrl }));
console.log(serverUrl ? `Comunidade incluída: ${serverUrl}` : 'Sem comunidade incluída: o aplicativo solicitará o endereço ao abrir.');
