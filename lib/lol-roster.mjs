// Only display data: never return account IDs, hidden selection names or credentials.
const clean = (value, limit = 64) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, limit) : '';
const positions = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);
const role = value => positions.has(String(value).toUpperCase()) ? String(value).toUpperCase() : '';
const championId = value => Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) < 100000 ? Number(value) : 0;
export function selectionRoster(session) {
  if (!Array.isArray(session?.myTeam)) return null;
  return { stage: 'select', players: session.myTeam.slice(0, 12).map((player, index) => ({
    slot: index, name: '', championId: championId(player.championId || player.championPickIntent),
    championKey: '', championName: '', role: role(player.assignedPosition),
    isSelf: Number.isInteger(session.localPlayerCellId) && player.cellId === session.localPlayerCellId,
    locked: championId(player.championId) > 0
  })) };
}
export function liveRoster(players, teamId, activeName) {
  if (!Array.isArray(players) || ![100, 200].includes(teamId)) return null;
  const team = teamId === 100 ? 'ORDER' : 'CHAOS';
  const allies = players.filter(player => player.team === team).slice(0, 12);
  if (!allies.length) return null;
  return { stage: 'live', players: allies.map((player, index) => {
    const fullName = player.riotId || (player.riotIdGameName ? player.riotIdGameName + (player.riotIdTagLine ? '#' + player.riotIdTagLine : '') : player.summonerName);
    return { slot: index, name: clean(fullName), championId: championId(player.championId),
      championKey: clean(player.rawChampionName, 100).replace(/^game_character_displayname_/, ''),
      championName: clean(player.championName, 40), role: role(player.position),
      isSelf: Boolean(activeName && [player.riotId, fullName, player.summonerName].includes(activeName)), locked: true };
  }) };
}
export function sanitizeRoster(snapshot) {
  const roster = snapshot?.roster;
  let stage;
  if (snapshot?.phase === 'ChampSelect' && snapshot.state === 'idle') stage = 'select';
  else if (snapshot?.state === 'playing' && ['InProgress', 'Reconnect'].includes(snapshot.phase) && roster?.stage === 'live') stage = 'live';
  else if (snapshot?.state === 'playing' && ['GameStart', 'InProgress', 'Reconnect'].includes(snapshot.phase)) stage = 'loading';
  if (!stage || !Array.isArray(roster?.players) || !roster.players.length) return null;
  return { stage, players: roster.players.slice(0, 12).map((player, index) => ({
    slot: index, name: stage === 'live' ? clean(player?.name) : '',
    championId: championId(player?.championId),
    championKey: /^[A-Za-z0-9]{1,40}$/.test(player?.championKey) ? player.championKey : '',
    championName: clean(player?.championName, 40), role: role(player?.role),
    isSelf: player?.isSelf === true, locked: player?.locked === true
  })) };
}
