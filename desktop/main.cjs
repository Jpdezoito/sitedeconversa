const { app, BrowserWindow, ipcMain, session } = require('electron');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { WebSocket, WebSocketServer } = require('ws');
const { connectLol } = require('./connector.cjs');

let window, ui, origin, serverUrl = '', stopLol = () => {};
const proxies = new Set();
function validServer(raw) {
  const url = new URL(String(raw).trim());
  const local = !app.isPackaged && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Use o endereço HTTPS da comunidade, sem caminhos ou senhas.');
  return url.origin;
}
function wsUrl(route) {
  const url = new URL(route, serverUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}
function stopConnections() {
  stopLol(); stopLol = () => {};
  for (const ws of proxies) ws.terminate();
  proxies.clear();
}
function trusted(event) {
  if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error('Origem não autorizada.');
}
app.whenReady().then(async () => {
  const saved = path.join(app.getPath('userData'), 'community.json');
  try { serverUrl = validServer(JSON.parse(await fs.readFile(saved, 'utf8')).serverUrl); } catch {}
  if (!serverUrl) {
    try { serverUrl = validServer((!app.isPackaged && process.env.ELO_SERVER_URL) || require('./server-config.json').serverUrl); } catch {}
  }
  const reader = (await import(pathToFileURL(path.join(__dirname, '../lib/lol-client.js')).href)).createLolReader();
  const assets = new Map([
    ['/', ['../public/index.html', 'text/html']], ['/app.js', ['../public/app.js', 'text/javascript']],
    ['/style.css', ['../public/style.css', 'text/css']], ['/favicon.svg', ['../public/favicon.svg', 'image/svg+xml']],
    ['/setup', ['setup.html', 'text/html']], ['/setup.js', ['setup.js', 'text/javascript']]
  ]);
  ui = http.createServer(async (req, res) => {
    if (req.headers.host !== new URL(origin).host || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(403).end(); return; }
    const route = new URL(req.url, origin).pathname;
    const asset = assets.get(route === '/' && !serverUrl ? '/setup' : route);
    if (!asset) { res.writeHead(404).end(); return; }
    try {
      const body = await fs.readFile(path.join(__dirname, asset[0]));
      res.writeHead(200, {
        'Content-Type': asset[1] + '; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(500).end(); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 65536 });
  ui.on('upgrade', (req, socket, head) => {
    if (!serverUrl || req.url !== '/ws' || req.headers.origin !== origin || req.headers.host !== new URL(origin).host) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, local => {
      const remote = new WebSocket(wsUrl('/ws'), { origin: serverUrl, handshakeTimeout: 90000, maxPayload: 1024 * 1024 });
      proxies.add(local); proxies.add(remote);
      const close = () => { local.terminate(); remote.terminate(); proxies.delete(local); proxies.delete(remote); };
      local.on('error', close); remote.on('error', close);
      local.on('close', close); remote.on('close', close);
      local.on('message', data => { if (remote.readyState === WebSocket.OPEN) remote.send(data.toString()); });
      remote.on('message', data => { if (local.readyState === WebSocket.OPEN) local.send(data.toString()); });
    });
  });
  await new Promise(resolve => ui.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${ui.address().port}`;
  const ses = session.fromPartition('elo-local');
  ses.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => contents === window?.webContents && permission === 'media' && requestingOrigin === origin && details.mediaType === 'audio');
  ses.setPermissionRequestHandler((contents, permission, callback, details) => callback(contents === window?.webContents && permission === 'media' && details.isMainFrame && new URL(details.requestingUrl).origin === origin && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio'));
  window = new BrowserWindow({ width: 1360, height: 900, minWidth: 700, minHeight: 600, backgroundColor: '#0d0e14', title: 'Elo Voice', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => { if (isMainFrame && !inPlace) stopConnections(); });
  ipcMain.handle('elo:config', event => { trusted(event); return { serverUrl }; });
  ipcMain.handle('elo:server', async (event, raw) => {
    trusted(event);
    const next = validServer(raw);
    await fs.mkdir(path.dirname(saved), { recursive: true });
    await fs.writeFile(saved, JSON.stringify({ serverUrl: next }));
    stopConnections(); serverUrl = next;
    setImmediate(() => window.loadURL(origin));
  });
  ipcMain.handle('elo:settings', event => { trusted(event); stopConnections(); setImmediate(() => window.loadURL(origin + '/setup')); });
  ipcMain.handle('elo:stop', event => { trusted(event); stopLol(); stopLol = () => {}; });
  ipcMain.handle('elo:lol', (event, code) => {
    trusted(event);
    if (!serverUrl || typeof code !== 'string' || !/^[a-f0-9]{32}$/.test(code)) throw new Error('Ative a voz novamente.');
    stopLol(); stopLol = connectLol({ endpoint: wsUrl('/lol-agent'), code, read: reader });
  });
  await window.loadURL(origin);
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { stopConnections(); ui?.close(); });
