import { selectionRoster, liveRoster, sanitizeRoster } from './lol-roster.mjs';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const playing = new Set(['GameStart', 'InProgress', 'Reconnect']);
const finished = new Set(['WaitingForStats', 'PreEndOfGame', 'EndOfGame', 'TerminatedInError']);
const idle = new Set(['None', 'Lobby', 'Matchmaking', 'ReadyCheck', 'ChampSelect', 'CheckedIntoTournament']);

// Credentials never leave this module or the loopback interface.
export function parseLockfile(raw) {
  const [name, pid, port, password, protocol] = raw.trim().split(':');
  if (name !== 'LeagueClient' || !/^\d+$/.test(pid) || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535 || !password || protocol !== 'https') throw new Error('Lockfile do LoL inválido.');
  return { port: Number(port), password };
}

export function readClient(connection, path) {
  const allowed = new Set(['/lol-gameflow/v1/gameflow-phase', '/lol-gameflow/v1/session', '/lol-summoner/v1/current-summoner', '/riotclient/region-locale', '/lol-champ-select/v1/session']);
  if (!allowed.has(path)) return Promise.reject(new Error('Endpoint não autorizado.'));
  return new Promise((resolve, reject) => {
    // LCU uses a self-signed certificate. This exception is local and per request.
    const request = https.get({ hostname: '127.0.0.1', port: connection.port, path, auth: `riot:${connection.password}`, rejectUnauthorized: false, timeout: 2500 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; if (body.length > 1024 * 1024) request.destroy(new Error('Resposta excedeu o limite.')); });
      response.on('end', () => {
        if (response.statusCode !== 200) { reject(new Error('Cliente do LoL indisponível.')); return; }
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Resposta inválida do LoL.')); }
      });
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Tempo de leitura do LoL excedido.')));
    request.on('error', reject);
  });
}


export function readLiveClient(path) {
  if (!['/liveclientdata/playerlist', '/liveclientdata/activeplayername'].includes(path)) return Promise.reject(new Error('Endpoint não autorizado.'));
  return new Promise((resolve, reject) => {
    const req = https.get({ hostname: '127.0.0.1', port: 2999, path, rejectUnauthorized: false, timeout: 2000 }, res => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; if (body.length > 1024 * 1024) req.destroy(new Error('Resposta excedeu o limite.')); });
      res.on('end', () => { if (res.statusCode !== 200) { reject(new Error('Partida indisponível.')); return; } try { resolve(JSON.parse(body)); } catch { reject(new Error('Resposta inválida.')); } });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Partida indisponível.'))); req.on('error', reject);
  });
}

export function normalizeSession(session, summoner, region) {
  const phase = session?.phase;
  if (finished.has(phase)) return { state: 'ended', phase };
  if (idle.has(phase)) return { state: 'idle', phase };
  if (!playing.has(phase)) return { state: 'unavailable', reason: 'phase' };
  const data = session?.gameData;
  // Do not create team rooms for spectator sessions, TFT or unknown modes.
  if (session?.gameClient?.isSpectating || session?.gameData?.isSpectating || data?.queue?.gameMode === 'TFT') return { state: 'unsupported' };
  const gameId = String(data?.gameId ?? '');
  const platform = String(data?.platformId || region?.region || '').toUpperCase();
  if (!/^[1-9]\d{0,19}$/.test(gameId) || (typeof data?.gameId === 'number' && !Number.isSafeInteger(data.gameId)) || !/^[A-Z0-9]{2,8}$/.test(platform)) return { state: 'unavailable', reason: 'metadata' };
  const matches = player => Boolean(
    (summoner?.puuid && player.puuid === summoner.puuid) ||
    (summoner?.summonerId && String(player.summonerId) === String(summoner.summonerId))
  );
  const one = Array.isArray(data.teamOne) ? data.teamOne : [];
  const two = Array.isArray(data.teamTwo) ? data.teamTwo : [];
  const inOne = one.some(matches), inTwo = two.some(matches);
  if (inOne === inTwo) return { state: 'unavailable', reason: 'team' };
  const teamId = inOne ? 100 : 200;
  return { state: 'playing', phase, match: { key: `${platform}:${gameId}:${teamId}`, region: platform, gameId, teamId, capacity: Math.max(1, Math.min(12, (inOne ? one : two).length)) } };
}

export function createLolReader({ lockfile = process.env.LOL_LOCKFILE, request = readClient, discover, includeRoster = false, requestLive = readLiveClient } = {}) {
  let cachedPath, lastDiscovery = 0;
  async function findConnection() {
    const candidates = [lockfile, cachedPath, 'C:/Riot Games/League of Legends/lockfile', 'D:/Riot Games/League of Legends/lockfile'].filter(Boolean);
    for (const candidate of new Set(candidates)) {
      try { const connection = parseLockfile(await readFile(candidate, 'utf8')); cachedPath = candidate; return connection; } catch {}
    }
    if (Date.now() - lastDiscovery < 20000) return null;
    lastDiscovery = Date.now();
    try {
      let executable;
      if (discover) executable = await discover();
      else if (process.platform === 'win32') {
        const result = await execute('powershell.exe', ['-NoProfile', '-Command', "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; (Get-Process LeagueClientUx -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path)"], { windowsHide: true, timeout: 4000, maxBuffer: 16384 });
        executable = result.stdout.trim();
      }
      if (executable) {
        const path = join(dirname(executable), 'lockfile');
        const connection = parseLockfile(await readFile(path, 'utf8')); cachedPath = path; return connection;
      }
    } catch {}
    return null;
  }
  return async () => {
    const connection = await findConnection();
    if (!connection) return { state: 'offline' };
    try {
      const phase = await request(connection, '/lol-gameflow/v1/gameflow-phase');
      if (includeRoster && phase === 'ChampSelect') {
        const snapshot = normalizeSession({ phase });
        try { snapshot.roster = selectionRoster(await request(connection, '/lol-champ-select/v1/session')); } catch { snapshot.roster = null; }
        return snapshot;
      }
      if (!playing.has(phase)) return normalizeSession({ phase });
      const session = await request(connection, '/lol-gameflow/v1/session');
      if (!playing.has(session?.phase)) return normalizeSession(session);
      const [summoner, region] = await Promise.all([
        request(connection, '/lol-summoner/v1/current-summoner'),
        request(connection, '/riotclient/region-locale')
      ]);
      const snapshot = normalizeSession(session, summoner, region);
      if (includeRoster && snapshot.state === 'playing') {
        const team = snapshot.match.teamId === 100 ? session.gameData.teamOne : session.gameData.teamTwo;
        snapshot.roster = { stage: 'loading', players: team.slice(0, 12).map(p => ({ championId: p.championId || p.championSelection, role: p.position, isSelf: Boolean((summoner.puuid && p.puuid === summoner.puuid) || (summoner.summonerId && String(p.summonerId) === String(summoner.summonerId))) })) };
        if (['InProgress', 'Reconnect'].includes(phase)) {
          try {
            const [players, active] = await Promise.all([requestLive('/liveclientdata/playerlist'), requestLive('/liveclientdata/activeplayername').catch(() => '')]);
            snapshot.roster = liveRoster(players, snapshot.match.teamId, active) || snapshot.roster;
          } catch { /* Keep anonymous loading cards until live data is available. */ }
        }
        // Recheck phase after reads: do not show names from an old match in a new selection.
        const currentPhase = await request(connection, '/lol-gameflow/v1/gameflow-phase');
        if (currentPhase !== phase) return normalizeSession({ phase: currentPhase });
        snapshot.roster = sanitizeRoster(snapshot);
      }
      return snapshot;
    } catch { return { state: 'unavailable', reason: 'connection' }; }
  };
}

export function startLolWatcher(app, { read = createLolReader(), intervalMs = 3000 } = {}) {
  let stopped = false, timer;
  async function tick() {
    let snapshot;
    try { snapshot = await read(); } catch { snapshot = { state: 'unavailable' }; }
    if (stopped) return;
    app.lol.update(snapshot);
    timer = setTimeout(tick, intervalMs); timer.unref();
  }
  app.lol.update({ state: 'waiting' });
  tick();
  const stop = () => { stopped = true; clearTimeout(timer); };
  app.server.once('close', stop);
  return stop;
}
