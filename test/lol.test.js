import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createVoiceServer } from '../server.js';
import { normalizeSession, parseLockfile, createLolReader } from '../lib/lol-client.js';

const match = (gameId='123',teamId=100,region='BR') => ({ state:'playing', match:{ key:`${region}:${gameId}:${teamId}`,region,gameId,teamId,capacity:5 } });
function inbox(ws) {
  const messages=[],waiters=[];
  ws.on('message',raw=>{const msg=JSON.parse(raw);const i=waiters.findIndex(w=>w.type===msg.type);if(i<0)messages.push(msg);else {const w=waiters.splice(i,1)[0];clearTimeout(w.timer);w.resolve(msg);}});
  return type=>{const i=messages.findIndex(m=>m.type===type);if(i>=0)return Promise.resolve(messages.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={type,resolve,timer:setTimeout(()=>reject(new Error(`Timeout ${type}`)),3000)};waiters.push(w);});};
}
async function setup(t) {
  let time=100000;
  const app=createVoiceServer({lol:{now:()=>time}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>app.close());
  const base=`ws://127.0.0.1:${app.server.address().port}`;
  async function client(name) {
    const ws=new WebSocket(base+'/ws'),take=inbox(ws),send=msg=>ws.send(JSON.stringify(msg));
    const welcome=await take('welcome');send({type:'identify',name});await take('identified');
    return {ws,take,send,id:welcome.id};
  }
  async function pair(c) {
    c.send({type:'auto-enable'});const {code}=await c.take('auto-pair');
    const ws=new WebSocket(base+'/lol-agent'),take=inbox(ws);
    await new Promise(resolve=>ws.once('open',resolve));ws.send(JSON.stringify({code}));
    const {token}=await take('paired');await c.take('auto-paired');
    return {ws,take,code,token,send:snapshot=>ws.send(JSON.stringify({type:'snapshot',snapshot}))};
  }
  return {...app,base,client,pair,advance:ms=>time+=ms};
}
test('identifica partida, região e time sem publicar nome, senha ou lista de jogadores',()=>{
  const session={phase:'InProgress',gameData:{gameId:123,teamOne:[{summonerId:1,puuid:'aaa'}],teamTwo:[{summonerId:2,puuid:'bbb'}]}};
  assert.equal(normalizeSession(session,{puuid:'aaa'},{region:'BR'}).match.key,'BR:123:100');
  assert.equal(normalizeSession(session,{summonerId:2},{region:'BR'}).match.key,'BR:123:200');
  assert.equal(normalizeSession(session,{summonerId:3},{region:'BR'}).state,'unavailable');
  assert.equal(normalizeSession({...session,gameClient:{isSpectating:true}},{summonerId:1},{region:'BR'}).state,'unsupported');
  assert.equal(normalizeSession({phase:'ChampSelect'}).state,'idle');
  assert.equal(normalizeSession({phase:'EndOfGame'}).state,'ended');
  assert.equal(normalizeSession({phase:'Unexpected'}).state,'unavailable');
  assert.throws(()=>parseLockfile('LeagueClient:1:70000:fake:https'));
  assert.throws(()=>parseLockfile('LeagueClient:1:1234:fake:http'));
});
test('cliente sem partida usa phase; não depende de session que retorna 404 no lobby',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'elo-lcu-test-'));
  try {
    const lockfile=join(folder,'lockfile');await writeFile(lockfile,'LeagueClient:123:1234:fake-test-only:https');
    const paths=[];
    const read=createLolReader({lockfile,request:async(connection,path)=>{assert.equal(connection.port,1234);paths.push(path);return 'None';}});
    assert.deepEqual(await read(),{state:'idle',phase:'None'});
    assert.deepEqual(paths,['/lol-gameflow/v1/gameflow-phase']);
  } finally {await rm(folder,{recursive:true,force:true});}
});
test('pareamento reúne aliados automaticamente e separa partida, time e região',async t=>{
  const app=await setup(t);
  const people=await Promise.all(['A','B','Inimigo','Outra partida','Outro servidor'].map(app.client));
  const paired=[];for(const c of people)paired.push(await app.pair(c));
  const snapshots=[match(),match(),match('123',200),match('456'),match('123',100,'EUW')];
  for(let i=0;i<people.length;i++){paired[i].send(snapshots[i]);await people[i].take('joined');}
  assert.equal(app.rooms.size,4);
  const same=[...app.rooms.values()].find(r=>r.match.key==='BR:123:100');
  assert.equal(same.members.size,2);
  const outsider=await app.client('Sem conector');outsider.send({type:'join',roomId:same.id});
  assert.match((await outsider.take('error')).message,/exclusiva/);
  // A public browser cannot forge a snapshot to move into a protected room.
  outsider.send({type:'snapshot',snapshot:match()});
  outsider.send({type:'join',roomId:same.id});assert.match((await outsider.take('error')).message,/exclusiva/);
  const stolen=new WebSocket(app.base+'/lol-agent');
  await new Promise(resolve=>stolen.once('open',resolve));
  stolen.send(JSON.stringify({code:paired[0].code}));
  assert.equal(await new Promise(resolve=>stolen.once('close',resolve)),1008);
  app.lol.update({state:'ended'},people[0].id);
  await people[0].take('room-closed');await people[1].take('room-closed');
  assert.equal(app.rooms.has(same.id),false);
  app.lol.update(match(),people[1].id); // stale gameflow cannot resurrect an ended match
  assert.equal(app.rooms.has(same.id),false);
  app.lol.update(match('999'),people[0].id);const next=await people[0].take('joined');
  assert.notEqual(next.room.id,same.id);
  app.lol.update(match('999'),people[1].id);await people[1].take('joined');
  assert.equal(app.rooms.get(next.room.id).members.size,2);
  people[0].send({type:'auto-disable'});await people[0].take('left');
  assert.equal(app.rooms.get(next.room.id).members.size,1);
  assert.equal(app.lol.status(people[0].id).state,'disabled');
});
test('perda temporária do conector preserva sala; perda prolongada e lobby removem',async t=>{
  const app=await setup(t),c=await app.client('A');await app.pair(c);
  app.lol.update(match(),c.id);const first=await c.take('joined');
  app.lol.update({state:'offline'},c.id);assert.equal(app.rooms.has(first.room.id),true);
  app.advance(89999);app.lol.update({state:'offline'},c.id);assert.equal(app.rooms.has(first.room.id),true);
  app.advance(1);app.lol.update({state:'offline'},c.id);await c.take('room-closed');assert.equal(app.rooms.size,0);
  app.lol.update(match('456'),c.id);await c.take('joined');
  app.lol.update({state:'idle'},c.id);assert.equal(app.rooms.size,1);
  app.advance(6000);app.lol.update({state:'idle'},c.id);await c.take('room-closed');assert.equal(app.rooms.size,0);
});
test('grupo manual não é encerrado por fim de partida; dados inválidos não criam salas',async t=>{
  const app=await setup(t),c=await app.client('Manual');c.send({type:'create',name:'Resenha'});const {room}=await c.take('joined');
  app.lol.update({state:'playing',match:{...match().match,key:'malformed'}},'source');
  app.lol.update({state:'ended'},'source');assert.equal(app.rooms.has(room.id),true);assert.equal(app.rooms.size,1);
});
