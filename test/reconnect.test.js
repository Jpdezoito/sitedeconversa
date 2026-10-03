import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createVoiceServer} from '../server.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function setup(t,grace=1000) {
 const app=createVoiceServer({reconnectGraceMs:grace});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const base=`ws://127.0.0.1:${app.server.address().port}`;
 async function connect(token) {
  const ws=new WebSocket(base+'/ws'),queue=[],waiters=[];
  ws.on('message',raw=>{const m=JSON.parse(raw);const i=waiters.findIndex(w=>w.type===m.type);if(i<0)queue.push(m);else {const w=waiters.splice(i,1)[0];clearTimeout(w.timer);w.resolve(m);}});
  const take=type=>{const i=queue.findIndex(m=>m.type===type);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>waiters.push({type,resolve,timer:setTimeout(()=>reject(Error(type)),3000)}));};
  const send=m=>ws.send(JSON.stringify(m));await take('welcome');send({type:'hello',token});const welcome=await take('welcome');
  const disconnect=()=>new Promise(r=>{ws.once('close',r);ws.terminate();});
  return {ws,take,send,welcome,disconnect};
 }
 return {...app,connect,base};
}
test('numeração pertence à sala, não aceita apelidos e não reutiliza números de quem saiu',async t=>{
 const app=await setup(t),a=await app.connect(),b=await app.connect();
 a.send({type:'create',name:'Sala'});let room=(await a.take('joined')).room;
 b.send({type:'join',roomId:room.id});room=(await b.take('joined')).room;
 assert.deepEqual(room.members.map(m=>m.name),['Participante 1','Participante 2']);
 b.send({type:'identify',name:'OFENSA'});assert.equal((await b.take('identified')).name,'Participante 2');
 b.send({type:'leave'});await b.take('left');b.send({type:'join',roomId:room.id});room=(await b.take('joined')).room;
 assert.deepEqual(room.members.map(m=>m.number),[1,3]);
 b.send({type:'create',name:'Outra'});assert.equal((await b.take('joined')).room.members[0].number,1);
});
test('queda temporária preserva sala, número, mute e identidade; token errado não retoma',async t=>{
 const app=await setup(t),a=await app.connect();a.send({type:'create',name:'Estável'});const room=(await a.take('joined')).room;
 a.send({type:'state',muted:true,deafened:true});a.send({type:'ping'});await a.take('pong');await a.disconnect();await delay(30);
 assert.equal(app.rooms.size,1);
 const stranger=await app.connect('0'.repeat(64));assert.equal(stranger.welcome.resumed,false);assert.notEqual(stranger.welcome.id,a.welcome.id);
 const b=await app.connect(a.welcome.token);assert.equal(b.welcome.resumed,true);assert.equal(b.welcome.id,a.welcome.id);assert.equal(b.welcome.roomId,room.id);
 assert.equal(b.welcome.rooms[0].members[0].number,1);assert.equal(b.welcome.rooms[0].members[0].deafened,true);
 const active=await app.connect(a.welcome.token);assert.equal(active.welcome.resumed,false);
 b.send({type:'leave'});await b.take('left');assert.equal(app.rooms.size,0);
});
test('sessão expirada remove sala vazia e token não pode ressuscitá-la',async t=>{
 const app=await setup(t,60),a=await app.connect();a.send({type:'create',name:'Temporária'});await a.take('joined');await a.disconnect();await delay(150);
 assert.equal(app.rooms.size,0);const b=await app.connect(a.welcome.token);assert.equal(b.welcome.resumed,false);assert.deepEqual(b.welcome.rooms,[]);
});
test('reconexão mantém pareamento do LoL e ainda encerra a sala ao terminar a partida',async t=>{
 const app=await setup(t),a=await app.connect();a.send({type:'auto-enable'});const {code}=await a.take('auto-pair');
 const agent=new WebSocket(app.base+'/lol-agent');await new Promise(r=>agent.once('open',r));
 const paired=new Promise(r=>agent.once('message',r));agent.send(JSON.stringify({code}));await paired;
 agent.send(JSON.stringify({type:'snapshot',snapshot:{state:'playing',match:{key:'BR:123:100',region:'BR',gameId:'123',teamId:100,capacity:5}}}));const room=(await a.take('joined')).room;
 await a.disconnect();await delay(30);const b=await app.connect(a.welcome.token);assert.equal(b.welcome.resumed,true);assert.equal(b.welcome.lol.paired,true);assert.equal(b.welcome.roomId,room.id);
 await delay(510);agent.send(JSON.stringify({type:'snapshot',snapshot:{state:'ended'}}));await b.take('room-closed');assert.equal(app.rooms.size,0);
});
