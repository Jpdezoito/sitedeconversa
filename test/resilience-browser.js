import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createVoiceServer} from '../server.js';
const app=process.env.ELO_TEST_URL ? null : createVoiceServer();
if(app)await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const base=process.env.ELO_TEST_URL || `http://localhost:${app.server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const errors=[],pages=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function makePage(url) {
 const context=await browser.newContext({permissions:['microphone','clipboard-read','clipboard-write'],viewport:{width:1366,height:1000}});
 await context.addInitScript(()=>{
  window.testPeers=[];window.testStreams=[];window.testSockets=[];window.iceRestarts=0;
  const PC=RTCPeerConnection;window.RTCPeerConnection=class extends PC {constructor(...args){super(...args);window.testPeers.push(this);}createOffer(options){if(options?.iceRestart){window.iceRestarts++;delete this.connectionState;}return super.createOffer(options);}};
  const WS=WebSocket;window.WebSocket=class extends WS{constructor(...args){super(...args);window.testSockets.push(this);}};
  const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async c=>{const s=await gum(c);window.testStreams.push(s);return s;};
 });
 const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{errors.push('Caixa inesperada: '+d.type());await d.dismiss();});
 await page.goto(url);await page.getByText('Tudo pronto para conectar',{exact:true}).waitFor({timeout:90000});assert.equal(await page.locator('#name-dialog, #name-input, #profile-button').count(),0);return page;
}
async function bytes(page){return page.evaluate(async()=>{let count=0;for(const pc of window.testPeers.filter(p=>p.connectionState==='connected')){for(const s of (await pc.getStats()).values())if(s.type==='inbound-rtp'&&s.kind==='audio')count+=s.bytesReceived||0;}return count;});}
try {
 const a=await makePage(base);const roomName='Teste de estabilidade '+Date.now();
 await a.getByRole('button',{name:'Criar meu grupo'}).click();await a.locator('#room-name').fill(roomName);await a.locator('#create-submit').click();await a.locator('#call-section').waitFor();
 await a.locator('#invite-button').click();const invite=await a.evaluate(()=>navigator.clipboard.readText());
 const b=await makePage(invite);
 for(const p of [a,b])await p.getByText('Áudio conectado',{exact:true}).waitFor({timeout:30000});
 assert.equal(await a.locator('#profile-name').textContent(),'Participante 1');assert.equal(await b.locator('#profile-name').textContent(),'Participante 2');
 await b.locator('#mute-button').click();
 // An interruption of the signaling socket must preserve the same media tracks and peer connection.
 const before=await bytes(b);
 await Promise.all([a,b].map(p=>p.evaluate(()=>window.testSockets.at(-1).close())));
 await b.getByText('Reconectando…',{exact:true}).first().waitFor();
 for(const p of [a,b]){
  assert.equal(await p.locator('#call-section').isVisible(),true);
  assert.equal(await p.evaluate(()=>window.testStreams.at(-1).active),true);
  await p.getByText('Tudo pronto para conectar',{exact:true}).waitFor({timeout:15000});
  assert.equal(await p.evaluate(()=>window.testPeers.length),1);
 }
 assert.equal(await b.locator('#profile-name').textContent(),'Participante 2');assert.equal(await b.evaluate(()=>window.testStreams[0].getAudioTracks()[0].enabled),false);
 assert.ok(await bytes(b)>before,'O áudio deve continuar durante a reconexão de sinalização');
 await b.locator('#mute-button').click();
 // Exercise real ICE renegotiation after notifying the recovery code of a failed transport.
 const oldSdp=await a.evaluate(()=>window.testPeers[0].localDescription.sdp);
 await Promise.all([a,b].map(p=>p.evaluate(()=>{const pc=window.testPeers[0];Object.defineProperty(pc,'connectionState',{configurable:true,get:()=> 'failed'});pc.dispatchEvent(new Event('connectionstatechange'));})));
 await a.waitForFunction(old=>window.testPeers[0].localDescription.sdp!==old,oldSdp,{timeout:20000});
 for(const p of [a,b])await p.evaluate(()=>{delete window.testPeers[0].connectionState;window.testPeers[0].dispatchEvent(new Event('connectionstatechange'));});
 for(const p of [a,b])await p.getByText('Áudio conectado',{exact:true}).waitFor({timeout:20000});
 assert.ok((await a.evaluate(()=>window.iceRestarts))+(await b.evaluate(()=>window.iceRestarts))>0);
 let prev=await Promise.all([a,b].map(bytes));const seconds=Number(process.env.ELO_SOAK_SECONDS||30);const start=Date.now();
 while(Date.now()-start<seconds*1000){
  await pause(5000);const next=await Promise.all([a,b].map(bytes));for(let i=0;i<2;i++)assert.ok(next[i]>prev[i],'Pacotes de áudio devem continuar chegando nos dois sentidos');prev=next;
  if(Math.floor((Date.now()-start)/1000)%30<5)console.log(`Voz ativa: ${Math.round((Date.now()-start)/1000)}s, áudio recebido nos dois sentidos.`);
 }
 // Leaving during reconnect must stop capture and never rejoin on its own.
 await b.evaluate(()=>window.testSockets.at(-1).close());await b.getByText('Reconectando…',{exact:true}).first().waitFor();await b.locator('#leave-button').click();
 await b.getByText('Tudo pronto para conectar',{exact:true}).waitFor({timeout:15000});assert.equal(await b.locator('#call-section').isVisible(),false);assert.equal(await b.evaluate(()=>window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
 await a.locator('#leave-button').click();
 assert.deepEqual(errors,[]);console.log('OK: convite sem caixa de nome; números; áudio bidirecional; reconexão sem perder chamada/mute; reinício ICE; saída durante reconexão.');
} finally {for(const p of pages){await p.evaluate(()=>{window.testSockets.at(-1)?.send(JSON.stringify({type:'leave'}));}).catch(()=>{});}await browser.close();await app?.close();}
