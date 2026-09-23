import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createVoiceServer } from '../server.js';

async function setup(t) {
  const app=createVoiceServer();
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  async function client(name) {
    const ws=new WebSocket(base.replace('http:','ws:')+'/ws');
    const queue=[], waiting=[];
    ws.on('message',raw=>{
      const msg=JSON.parse(raw);
      const index=waiting.findIndex(w=>w.type===msg.type);
      if(index>=0) { const w=waiting.splice(index,1)[0]; clearTimeout(w.timer); w.resolve(msg); }
      else queue.push(msg);
    });
    const take=type=>{
      const index=queue.findIndex(m=>m.type===type);
      if(index>=0) return Promise.resolve(queue.splice(index,1)[0]);
      return new Promise((resolve,reject)=>{const waiter={type,resolve,timer:setTimeout(()=>reject(new Error(`Timeout: ${type}`)),3000)};waiting.push(waiter);});
    };
    const welcome=await take('welcome');
    const send=msg=>ws.send(JSON.stringify(msg));
    if(name) { send({type:'identify',name}); await take('identified'); }
    return {ws,take,send,id:welcome.id,welcome};
  }
  return {...app,base,client};
}
test('grupos independentes, sinalização restrita e encerramento sem histórico',async t=>{
  const app=await setup(t);
  const a=await app.client('Ana'),b=await app.client('Bruno'),c=await app.client('Caio');
  assert.deepEqual(a.welcome.rooms,[]);
  a.send({type:'create',name:'Resenha',theme:'coffee'});
  const {room}=await a.take('joined');
  b.send({type:'join',roomId:room.id});
  const joined=await b.take('joined');
  assert.equal(joined.peers[0].name,'Ana');
  b.send({type:'signal',to:a.id,data:{description:{type:'offer',sdp:'test'}}});
  assert.equal((await a.take('signal')).from,b.id);
  c.send({type:'create',name:'Jogatina',theme:'game'});
  const other=(await c.take('joined')).room;
  assert.equal(app.rooms.size,2);
  c.send({type:'signal',to:a.id,data:{candidate:{candidate:'test'}}});
  assert.match((await c.take('error')).message,/indisponível/);
  a.send({type:'leave'}); await a.take('left');
  assert.equal(app.rooms.get(room.id).members.size,1);
  b.send({type:'join',roomId:other.id}); await b.take('joined');
  assert.equal(app.rooms.has(room.id),false);
  b.send({type:'join',roomId:room.id});
  assert.match((await b.take('error')).message,/encerrado/);
  assert.equal(app.rooms.get(other.id).members.size,2);
  c.ws.close(); await new Promise(resolve=>c.ws.once('close',resolve));
  await b.take('peer-left');
  b.send({type:'leave'}); await b.take('left');
  assert.equal(app.rooms.size,0);
});
test('valida nomes, mensagens e estado de áudio',async t=>{
  const app=await setup(t),a=await app.client();
  a.send({type:'create',name:'Grupo'}); assert.match((await a.take('error')).message,/nome/);
  a.send({type:'identify',name:'   '}); assert.match((await a.take('error')).message,/chamado/);
  a.send({type:'identify',name:'Ana'}); await a.take('identified');
  a.send({type:'create',name:'  '}); assert.match((await a.take('error')).message,/nome/);
  a.ws.send('{broken'); assert.match((await a.take('error')).message,/inválida/);
  a.send({type:'create',name:'A'.repeat(80),theme:'invalid'});
  const {room}=await a.take('joined'); assert.equal(room.name.length,40); assert.equal(room.theme,'coffee');
  a.send({type:'state',muted:true,deafened:true});
  let update;
  do { update=await a.take('rooms'); } while(!update.rooms[0]?.members[0].deafened);
  assert.equal(update.rooms[0].members[0].muted,true);
});
test('limite de 12 participantes preserva a sala anterior',async t=>{
  const app=await setup(t),owner=await app.client('Dono');
  owner.send({type:'create',name:'Cheio'}); const {room}=await owner.take('joined');
  for(let i=0;i<11;i++) { const c=await app.client(`Pessoa ${i}`); c.send({type:'join',roomId:room.id}); await c.take('joined'); }
  const last=await app.client('Extra'); last.send({type:'create',name:'Outro'}); const other=(await last.take('joined')).room;
  last.send({type:'join',roomId:room.id}); assert.match((await last.take('error')).message,/cheio/);
  assert.equal(app.rooms.get(other.id).members.size,1); assert.equal(app.rooms.get(room.id).members.size,12);
});
test('serve apenas arquivos públicos e rejeita origem externa',async t=>{
  const app=await setup(t);
  const home=await fetch(app.base); assert.equal(home.status,200); assert.match(await home.text(),/<title>Elo/);
  assert.match(home.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal((await fetch(app.base+'/.env')).status,404);
  assert.equal((await fetch(app.base+'/server.js')).status,404);
  assert.equal((await fetch(app.base,{method:'POST'})).status,405);
  const ws=new WebSocket(app.base.replace('http:','ws:')+'/ws',{origin:'https://outro-site.example'});
  const error=await new Promise(resolve=>ws.once('error',resolve)); assert.match(error.message,/403/);
});
