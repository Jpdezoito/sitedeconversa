import { randomUUID } from 'node:crypto';

export function createLolRooms({ rooms, closeRoom, changed, now = Date.now, graceMs = 90000 }) {
  const sources = new Map();
  const status = id => sources.get(id)?.status || { state: 'disabled', roomId: null };
  function record(id) {
    if (!sources.has(id)) sources.set(id, { status: { state: 'waiting', roomId: null }, lastPlaying: now(), idleSince: null, endedKey: null });
    return sources.get(id);
  }
  function detach(id, message) {
    const source = sources.get(id), roomId = source?.status.roomId;
    if (!source || !roomId) return;
    source.status = { state: 'waiting', roomId: null };
    if (![...sources.values()].some(s => s.status.roomId === roomId)) closeRoom(roomId, message);
  }
  function endMatch(roomId) {
    const key = rooms.get(roomId)?.match.key;
    for (const source of sources.values()) if (source.status.roomId === roomId) {
      source.endedKey = key;
      source.status = { state: 'ended', roomId: null };
    }
    closeRoom(roomId, 'A partida terminou. A voz foi desconectada. Aguardando sua próxima partida.');
  }
  return {
    status,
    remove(id) { detach(id, 'Todos os conectores desta partida foram desligados.'); sources.delete(id); changed(); },
    update(snapshot, id = 'host') {
      const source = record(id);
      const before = JSON.stringify([...sources.values()].map(s => s.status));
      let capacityChanged = false;
      if (snapshot?.state === 'playing') {
        const m = snapshot.match;
        if (!m || !/^[A-Z0-9]{2,8}:[1-9]\d{0,19}:(100|200)$/.test(m.key) || m.key !== `${m.region}:${m.gameId}:${m.teamId}` || !Number.isInteger(m.capacity) || m.capacity < 1 || m.capacity > 12) return;
        if (m.key === source.endedKey) return;
        source.lastPlaying = now(); source.idleSince = null;
        if (rooms.get(source.status.roomId)?.match.key !== m.key) {
          detach(id, 'Uma nova partida começou. A sala anterior foi encerrada.');
          let room = [...rooms.values()].find(r => r.kind === 'lol' && r.match.key === m.key);
          if (!room) {
            if (rooms.size >= 100) { source.status = { state: 'limit', roomId: null }; changed(); return; }
            const roomId = randomUUID();
            room = { id: roomId, name: `LoL · ${m.region} ${m.gameId} · ${m.teamId === 100 ? 'Azul' : 'Vermelho'}`, theme: 'game', capacity: m.capacity, kind: 'lol', match: { key: m.key, region: m.region, gameId: m.gameId, teamId: m.teamId }, members: new Set() };
            rooms.set(roomId, room);
          }
          if (m.capacity > room.capacity) { room.capacity = m.capacity; capacityChanged = true; }
          source.status = { state: 'playing', roomId: room.id };
        } else source.status = { state: 'playing', roomId: source.status.roomId };
        const currentRoom = rooms.get(source.status.roomId);
        if (currentRoom && m.capacity > currentRoom.capacity) { currentRoom.capacity = m.capacity; capacityChanged = true; }
      } else if (snapshot?.state === 'ended') {
        if (source.status.roomId) endMatch(source.status.roomId);
        source.status = { state: 'ended', roomId: null };
      } else if (['disabled', 'unsupported'].includes(snapshot?.state)) {
        detach(id, 'A sessão do LoL foi encerrada.'); source.status = { state: snapshot.state, roomId: null };
      } else if (snapshot?.state === 'idle') {
        if (source.status.roomId) {
          source.idleSince ??= now();
          if (now() - source.idleSince >= 6000) detach(id, 'O cliente voltou ao lobby. A sala da partida foi encerrada.');
        }
        source.status = { state: source.status.roomId ? 'checking' : 'idle', roomId: source.status.roomId };
      } else {
        source.idleSince = null;
        if (source.status.roomId && now() - source.lastPlaying >= graceMs) detach(id, 'A conexão com os conectores foi perdida.');
        source.status = { state: source.status.roomId ? 'reconnecting' : ['offline', 'waiting'].includes(snapshot?.state) ? snapshot.state : 'unavailable', roomId: source.status.roomId };
      }
      if (capacityChanged || before !== JSON.stringify([...sources.values()].map(s => s.status))) changed();
    }
  };
}
