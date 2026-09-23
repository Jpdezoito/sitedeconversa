import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { createLolRooms } from './lib/lol-rooms.js';

export function createVoiceServer(options = {}) {
  const rooms = new Map();
  const clients = new Map();
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({ urls: process.env.TURN_URL, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
  const files = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']],
    ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
    ['/elo-conector.zip', ['elo-conector.zip', 'application/zip']],
  ]);
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(self)');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}'); return; }
    const file = files.get(pathname);
    if (!file) { res.writeHead(404).end('Não encontrado'); return; }
    try {
      const body = await readFile(new URL(`./public/${file[0]}`, import.meta.url));
      res.writeHead(200, { 'Content-Type': file[1] }).end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(500).end('Não foi possível abrir a página.'); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32768 });
  const agents = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  server.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin;
    const allowedOrigin = options.origin || process.env.PUBLIC_ORIGIN;
    let sameHost = false;
    try { sameHost = new URL(origin).host === req.headers.host; } catch {}
    if (!['/ws', '/lol-agent'].includes(req.url) || (origin && (allowedOrigin ? origin !== allowedOrigin : !sameHost)) || clients.size + agents.clients.size >= 500) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return;
    }
    const endpoint = req.url === '/lol-agent' ? agents : wss;
    endpoint.handleUpgrade(req, socket, head, ws => endpoint.emit('connection', ws));
  });
  const send = (client, data) => {
    if (client?.ws.readyState === WebSocket.OPEN) client.ws.send(JSON.stringify(data));
  };
  const member = c => ({ id: c.id, name: c.name, muted: c.muted, deafened: c.deafened });
  const roomData = room => ({ id: room.id, name: room.name, theme: room.theme, capacity: room.capacity || 12, kind: room.kind || 'manual', ...(room.match ? { match: room.match } : {}), members: [...room.members].map(id => member(clients.get(id))) });
  const broadcast = () => {
    for (const c of clients.values()) send(c, { type: 'rooms', rooms: [...rooms.values()].map(roomData), lol: autoStatus(c) });
  };
  function autoStatus(c) { return { ...lol.status(c.id), enabled: Boolean(c.auto), paired: Boolean(c.agent), roomId: c.auto ? lol.status(c.id).roomId : null }; }
  function closeRoom(id, message) {
    const room = rooms.get(id);
    if (!room) return;
    for (const memberId of room.members) {
      const client = clients.get(memberId);
      if (client) { client.roomId = null; send(client, { type: 'room-closed', roomId: id, message }); }
    }
    rooms.delete(id);
  }
  const lol = createLolRooms({ rooms, closeRoom, ...options.lol, changed: () => { syncAuto(); broadcast(); } });
  function syncAuto() {
    for (const c of clients.values()) if (c.auto) {
      const target = rooms.get(lol.status(c.id).roomId);
      if (target && c.roomId !== target.id) {
        try { join(c, target); } catch { send(c, { type: 'auto-notice', message: 'A sala da partida está cheia. Aguardando uma vaga.' }); }
      } else if (!target && c.roomId && rooms.get(c.roomId)?.kind === 'lol') {
        leave(c); send(c, { type: 'auto-wait' });
      }
    }
  }
  function disableAuto(c) {
    c.auto = false; c.pairCode = null; c.agentToken = null;
    const agent = c.agent; c.agent = null;
    agent?.close(1000, 'Modo automatico desligado');
    lol.remove(c.id);
  }
  function leave(c) {
    const room = rooms.get(c.roomId);
    if (!room) return;
    room.members.delete(c.id);
    for (const id of room.members) send(clients.get(id), { type: 'peer-left', id: c.id });
    if (!room.members.size && room.kind !== 'lol') rooms.delete(room.id);
    c.roomId = null;
  }
  function join(c, room) {
    if (c.roomId === room.id) return;
    if (room.members.size >= (room.capacity || 12)) throw new Error('Este grupo está cheio. Escolha outro ou crie o seu.');
    leave(c);
    c.roomId = room.id;
    const peers = [...room.members].map(id => member(clients.get(id)));
    room.members.add(c.id);
    send(c, { type: 'joined', room: roomData(room), peers });
    for (const peer of peers) send(clients.get(peer.id), { type: 'peer-joined', peer: member(c) });
    broadcast();
  }
  const clean = (value, max) => typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';
  wss.on('connection', ws => {
    const c = { id: randomUUID(), ws, name: '', roomId: null, muted: false, deafened: false, alive: true, count: 0, window: Date.now(), lastCreate: 0 };
    clients.set(c.id, c);
    send(c, { type: 'welcome', id: c.id, iceServers, rooms: [...rooms.values()].map(roomData), lol: autoStatus(c) });
    ws.on('pong', () => { c.alive = true; });
    ws.on('error', () => {});
    ws.on('message', raw => {
      try {
        if (Date.now() - c.window > 10000) { c.window = Date.now(); c.count = 0; }
        if (++c.count > 250) { ws.close(1008, 'Muitas solicitações'); return; }
        const msg = JSON.parse(raw.toString());
        if (!msg || typeof msg !== 'object') throw new Error('Solicitação inválida.');
        if (msg.type === 'identify') {
          const name = clean(msg.name, 24);
          if (!name) throw new Error('Informe como você quer ser chamado.');
          c.name = name; send(c, { type: 'identified', name }); broadcast(); return;
        }
        if (!c.name) throw new Error('Escolha seu nome antes de entrar.');
        if (msg.type === 'auto-enable') {
          if (c.auto) { send(c, { type: 'auto-pair', code: c.pairCode, paired: Boolean(c.agent) }); return; }
          c.auto = true; c.agentToken = randomBytes(32).toString('hex'); c.pairCode = randomBytes(16).toString('hex'); c.pairExpires = Date.now() + 300000;
          leave(c); lol.update({ state: 'waiting' }, c.id);
          send(c, { type: 'auto-pair', code: c.pairCode, paired: false }); broadcast(); return;
        }
        if (msg.type === 'auto-disable') { leave(c); disableAuto(c); send(c, { type: 'left' }); broadcast(); return; }
        if (msg.type === 'create') {
          if (c.auto) throw new Error('Desative o modo automático para criar um grupo manual.');
          const name = clean(msg.name, 40);
          if (!name) throw new Error('Dê um nome ao grupo.');
          if (rooms.size >= 100) throw new Error('Limite de grupos atingido. Tente novamente mais tarde.');
          if (Date.now() - c.lastCreate < 3000) throw new Error('Aguarde alguns segundos antes de criar outro grupo.');
          c.lastCreate = Date.now();
          const room = { id: randomUUID(), name, theme: ['coffee', 'game', 'music', 'work'].includes(msg.theme) ? msg.theme : 'coffee', members: new Set() };
          rooms.set(room.id, room); join(c, room);
        } else if (msg.type === 'join') {
          const room = rooms.get(msg.roomId);
          if (!room) throw new Error('Este grupo já foi encerrado. Você pode criar outro.');
          if (room.kind === 'lol' && (!c.auto || lol.status(c.id).roomId !== room.id)) throw new Error('Esta sala é exclusiva de quem está com o conector ativo na mesma partida e no mesmo time.');
          if (c.auto && room.kind !== 'lol') throw new Error('Desative o modo automático para entrar em um grupo manual.');
          join(c, room);
        } else if (msg.type === 'leave') {
          leave(c); disableAuto(c); send(c, { type: 'left' }); broadcast();
        } else if (msg.type === 'state') {
          c.muted = Boolean(msg.muted); c.deafened = Boolean(msg.deafened); broadcast();
        } else if (msg.type === 'signal') {
          const target = clients.get(msg.to);
          if (!c.roomId || target?.roomId !== c.roomId || target === c) throw new Error('Participante indisponível.');
          if (!msg.data || typeof msg.data !== 'object') throw new Error('Sinal inválido.');
          send(target, { type: 'signal', from: c.id, data: msg.data });
        }
      } catch (error) {
        send(c, { type: 'error', message: error instanceof SyntaxError ? 'Solicitação inválida.' : error.message });
      }
    });
    ws.on('close', () => { leave(c); clients.delete(c.id); disableAuto(c); broadcast(); });
  });
  agents.on('connection', ws => {
    let owner = null, lastSnapshot = 0, count = 0, windowAt = Date.now();
    const authTimeout = setTimeout(() => { if (!owner) ws.close(1008, 'Pareamento necessario'); }, 10000);
    ws.on('error', () => {});
    ws.on('message', raw => {
      try {
        if (Date.now() - windowAt > 10000) { count = 0; windowAt = Date.now(); }
        if (++count > 20) { ws.close(1008, 'Muitas mensagens'); return; }
        const msg = JSON.parse(raw);
        if (!owner) {
          owner = [...clients.values()].find(c => c.auto && (
            (typeof msg.code === 'string' && c.pairCode === msg.code && c.pairExpires > Date.now()) ||
            (typeof msg.token === 'string' && c.agentToken === msg.token)
          ));
          if (!owner) { ws.close(1008, 'Codigo invalido ou expirado'); return; }
          clearTimeout(authTimeout);
          owner.agent?.close(1000, 'Conector substituido'); owner.agent = ws; owner.pairCode = null;
          owner.lastAgentSeen = Date.now();
          ws.send(JSON.stringify({ type: 'paired', token: owner.agentToken }));
          send(owner, { type: 'auto-paired' }); broadcast(); return;
        }
        if (owner.agent !== ws || !owner.auto) { ws.close(); return; }
        if (msg.type === 'snapshot' && Date.now() - lastSnapshot >= 500) {
          lastSnapshot = Date.now(); owner.lastAgentSeen = lastSnapshot;
          lol.update(msg.snapshot, owner.id); syncAuto();
        }
      } catch { ws.close(1008, 'Mensagem invalida'); }
    });
    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (owner?.agent === ws) { owner.agent = null; lol.update({ state: 'offline' }, owner.id); broadcast(); }
    });
  });
  const heartbeat = setInterval(() => {
    for (const c of clients.values()) {
      if (c.auto && c.lastAgentSeen && Date.now() - c.lastAgentSeen > 15000) lol.update({ state: 'offline' }, c.id);
      if (c.auto && c.pairCode && c.pairExpires < Date.now()) { disableAuto(c); send(c, { type: 'auto-expired' }); }
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false; c.ws.ping();
    }
  }, 15000);
  heartbeat.unref();
  server.on('close', () => clearInterval(heartbeat));
  return { server, wss, agents, rooms, lol, close: async () => {
    clearInterval(heartbeat);
    for (const c of clients.values()) c.ws.terminate();
    for (const ws of agents.clients) ws.terminate();
    await new Promise(resolve => agents.close(resolve));
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const app = createVoiceServer();
  const { server } = app;
  server.listen(Number(process.env.PORT) || 3000, process.env.HOST || '0.0.0.0', () => console.log(`Elo está disponível em http://localhost:${server.address().port}`));
}
