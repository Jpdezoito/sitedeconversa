import { writeFile } from 'node:fs/promises';
let serverUrl = '';
if (process.env.ELO_SERVER_URL) {
  const url = new URL(process.env.ELO_SERVER_URL.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('ELO_SERVER_URL deve ser uma origem HTTPS.');
  serverUrl = url.origin;
}
await writeFile(new URL('../desktop/server-config.json', import.meta.url), JSON.stringify({ serverUrl }));
console.log(serverUrl ? `Comunidade incluída: ${serverUrl}` : 'Sem comunidade incluída: o aplicativo solicitará o endereço ao abrir.');
