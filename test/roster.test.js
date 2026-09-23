import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectionRoster, liveRoster, sanitizeRoster } from '../lib/lol-roster.mjs';
import { createLolReader } from '../lib/lol-client.js';
import { createVoiceServer } from '../server.js';
import { WebSocket } from 'ws';

test('seleção descarta identidades mesmo quando o cliente as fornece', () => {
  const roster=selectionRoster({localPlayerCellId:1,myTeam:[{cellId:0,championId:0,championPickIntent:12,assignedPosition:'top',summonerName:'SEGREDO',puuid:'PRIVATE'},{cellId:1,championId:21,assignedPosition:'bottom',gameName:'SEGREDO'}]});
  assert.equal(roster.stage,'select');assert.equal(roster.players[0].championId,12);assert.equal(roster.players[0].locked,false);assert.equal(roster.players[1].isSelf,true);
  assert.ok(roster.players.every(p=>p.name===''));assert.doesNotMatch(JSON.stringify(roster),/SEGREDO|PRIVATE|puuid|summonerName/);
});
test('partida mostra somente aliados e seus Riot IDs, sem estatísticas ou contas internas',()=>{
  const roster=liveRoster([{team:'ORDER',riotId:'Ana#BR1',rawChampionName:'game_character_displayname_Ahri',position:'MIDDLE',puuid:'PRIVATE'},{team:'CHAOS',riotId:'Inimigo#BR1'}],100,'Ana#BR1');
  assert.equal(roster.players.length,1);assert.equal(roster.players[0].name,'Ana#BR1');assert.equal(roster.players[0].championKey,'Ahri');assert.equal(roster.players[0].isSelf,true);
  assert.doesNotMatch(JSON.stringify(roster),/Inimigo|PRIVATE|puuid/);assert.equal(liveRoster([],300,''),null);
});
test('servidor remove nomes na seleção e no carregamento e limita os dados aceitos',()=>{
  const roster={stage:'live',players:[{name:'SEGREDO',championId:103,championKey:'https://evil.invalid',role:'HACK',token:'PRIVATE'}]};
  for(const [state,phase] of [['idle','ChampSelect'],['playing','GameStart']]){const safe=sanitizeRoster({state,phase,roster});assert.equal(safe.players[0].name,'');assert.equal(safe.players[0].championKey,'');assert.doesNotMatch(JSON.stringify(safe),/SEGREDO|PRIVATE|HACK/);}
  assert.equal(sanitizeRoster({state:'ended',phase:'EndOfGame',roster}),null);
  assert.equal(sanitizeRoster({state:'playing',phase:'InProgress',roster}).players[0].name,'SEGREDO');
});
async function fakeReader(t, options){const folder=await mkdtemp(join(tmpdir(),'elo-roster-'));t.after(()=>rm(folder,{recursive:true,force:true}));const lockfile=join(folder,'lockfile');await writeFile(lockfile,'LeagueClient:123:1234:test-only:https');return createLolReader({lockfile,includeRoster:true,...options});}
test('seleção não consulta nomes, contas ou Live API',async t=>{
 const paths=[];const read=await fakeReader(t,{request:async(_c,path)=>{paths.push(path);if(path.endsWith('gameflow-phase'))return 'ChampSelect';if(path==='/lol-champ-select/v1/session')return {myTeam:[{cellId:0,championId:103,summonerName:'Hidden'}],localPlayerCellId:0};throw Error('Unexpected');},requestLive:async()=>{throw Error('Não pode consultar a partida na seleção');}});
 const result=await read();assert.equal(result.phase,'ChampSelect');assert.equal(result.roster.players[0].name,'');assert.deepEqual(paths,['/lol-gameflow/v1/gameflow-phase','/lol-champ-select/v1/session']);
});
test('troca de fase durante leitura descarta nomes da partida anterior',async t=>{
 let phases=0;const read=await fakeReader(t,{request:async(_c,path)=>{if(path.endsWith('gameflow-phase'))return ++phases===1?'InProgress':'ChampSelect';if(path.endsWith('/session'))return {phase:'InProgress',gameData:{gameId:1,teamOne:[{summonerId:1}],teamTwo:[]}};if(path.endsWith('current-summoner'))return {summonerId:1};return {region:'BR'};},requestLive:async path=>path.endsWith('playerlist')?[{team:'ORDER',riotId:'Old name#BR1'}]:'Old name#BR1'});
 assert.deepEqual(await read(),{state:'idle',phase:'ChampSelect'});
});
function inbox(ws){const queue=[],waiters=[];ws.on('message',raw=>{const m=JSON.parse(raw);const i=waiters.findIndex(w=>w.type===m.type);if(i<0)queue.push(m);else{const w=waiters.splice(i,1)[0];clearTimeout(w.timer);w.resolve(m);}});return {queue,take:type=>{const i=queue.findIndex(m=>m.type===type);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={type,resolve,timer:setTimeout(()=>reject(Error('Timeout '+type)),3000)};waiters.push(w);});}};}
test('lista de aliados é encaminhada somente ao navegador pareado',async t=>{
 const app=createVoiceServer();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());const base=`ws://127.0.0.1:${app.server.address().port}`;
 const owner=new WebSocket(base+'/ws'),o=inbox(owner);const other=new WebSocket(base+'/ws'),b=inbox(other);await o.take('welcome');await b.take('welcome');
 owner.send(JSON.stringify({type:'identify',name:'Owner'}));await o.take('identified');owner.send(JSON.stringify({type:'auto-enable'}));const {code}=await o.take('auto-pair');const agent=new WebSocket(base+'/lol-agent'),a=inbox(agent);await new Promise(r=>agent.once('open',r));agent.send(JSON.stringify({code}));await a.take('paired');
 agent.send(JSON.stringify({type:'snapshot',snapshot:{state:'playing',phase:'InProgress',match:{key:'BR:1:100',region:'BR',gameId:'1',teamId:100,capacity:5},roster:{stage:'live',players:[{name:'ONLY-OWNER#BR1',championId:103}]}}}));
 const result=await o.take('lol-roster');assert.equal(result.roster.players[0].name,'ONLY-OWNER#BR1');await new Promise(r=>setTimeout(r,40));assert.doesNotMatch(JSON.stringify(b.queue),/ONLY-OWNER|lol-roster/);assert.doesNotMatch(JSON.stringify([...app.rooms.values()]),/ONLY-OWNER/);
 agent.close();assert.equal((await o.take('lol-roster')).roster,null);
});
