import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createLolReader } from './lol-client.mjs';

const input = createInterface({ input: stdin, output: stdout });
console.log('ELO - Conector de voz automatica do LoL');
console.log('Este programa so le o estado do seu LoL. A voz fica no navegador.');
const rawUrl = await input.question('Cole o endereco HTTPS do site: ');
let base;
try {
  base = new URL(rawUrl.trim());
  if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost','127.0.0.1'].includes(base.hostname))) || base.username || base.password) throw new Error();
} catch { console.error('Endereco invalido. Use o link HTTPS do Elo.'); input.close(); process.exit(1); }
const code = (await input.question('Cole o codigo que aparece ao ativar a voz automatica: ')).trim();
input.close();
if (!/^[a-f0-9]{32}$/.test(code)) { console.error('Codigo invalido. Copie o codigo completo do site.'); process.exit(1); }
const endpoint = new URL('/lol-agent', base); endpoint.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
const read = createLolReader({ includeRoster: true });
let token, timer, socket, stopping = false, label = '';
function report(text) { if (text !== label) { label = text; console.log(text); } }
function connect() {
  socket = new WebSocket(endpoint);
  const current = socket;
  socket.onopen = () => current.send(JSON.stringify(token ? { token } : { code }));
  socket.onmessage = async event => {
    const msg = JSON.parse(event.data);
    if (msg.type !== 'paired') return;
    token = msg.token;
    report('Conectado ao seu navegador. Mantenha esta janela e o site abertos.');
    async function poll() {
      const snapshot = await read();
      if (stopping || current !== socket || current.readyState !== WebSocket.OPEN) return;
      current.send(JSON.stringify({ type: 'snapshot', snapshot }));
      report(snapshot.state === 'playing' ? 'Partida detectada. O site vai reunir seu time na voz.' : snapshot.state === 'idle' ? 'LoL conectado. Aguardando sua partida.' : snapshot.state === 'ended' ? 'Partida encerrada. Aguardando a proxima.' : 'Aguardando o cliente do LoL ficar disponivel.');
      timer = setTimeout(poll, 3000);
    }
    poll();
  };
  socket.onerror = () => {};
  socket.onclose = event => {
    clearTimeout(timer);
    if (stopping) return;
    if ([1000, 1008].includes(event.code)) {
      console.log('Sessao encerrada ou codigo expirado. Ative a voz no site e abra este conector novamente.');
      stopping = true; return;
    }
    report('Conexao interrompida. Tentando novamente...');
    timer = setTimeout(connect, 3000);
  };
}
process.on('SIGINT', () => { stopping = true; clearTimeout(timer); socket?.close(); process.exit(0); });
connect();
