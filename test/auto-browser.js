import { chromium } from '@playwright/test';
import { WebSocket } from 'ws';
import { createVoiceServer } from '../server.js';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const app=createVoiceServer();
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base=process.env.ELO_TEST_URL || `http://localhost:${app.server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const agents=[],errors=[];
try {
  const pages=[];
  for(const name of ['Ana','Bruno']) {
    const context=await browser.newContext({permissions:['microphone'],viewport:{width:1366,height:1000}});
    await context.addInitScript(()=>{
      window.testStreams=[]; window.testPeers=[];
      const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia=async c=>{const s=await gum(c);window.testStreams.push(s);return s;};
      const PC=RTCPeerConnection;window.RTCPeerConnection=class extends PC{constructor(...args){super(...args);window.testPeers.push(this);}};
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
    await page.getByText('Tudo pronto para conectar').waitFor();
    await page.getByRole('button',{name:'Ativar voz automática'}).click();
    await page.getByLabel('Seu nome',{exact:true}).fill(name);await page.getByRole('button',{name:'Pode me chamar assim'}).click();
    await page.locator('#pair-panel').waitFor();
    assert.equal(await page.evaluate(()=>window.testStreams.at(-1).getAudioTracks()[0].enabled),false);
    const code=await page.locator('#pair-code').textContent();
    const ws=new WebSocket(base.replace(/^http/,'ws')+'/lol-agent');
    await new Promise(resolve=>ws.once('open',resolve));
    const ready=new Promise(resolve=>ws.once('message',resolve));ws.send(JSON.stringify({code}));await ready;
    agents.push(ws);pages.push(page);
  }
  const sendGame=(ws,id)=>ws.send(JSON.stringify({type:'snapshot',snapshot:{state:'playing',match:{key:`BR:${id}:100`,region:'BR',gameId:id,teamId:100,capacity:5}}}));
  for(const ws of agents)sendGame(ws,'123');
  for(const page of pages) {
    await page.getByText('Áudio conectado',{exact:true}).waitFor({timeout:20000});
    assert.equal(await page.locator('.participant').count(),2);
    assert.equal(await page.evaluate(()=>window.testStreams.at(-1).getAudioTracks()[0].enabled),true);
    await page.waitForFunction(async()=>{for(const p of window.testPeers){const s=await p.getStats();if([...s.values()].some(x=>x.type==='inbound-rtp' && x.kind==='audio' && x.bytesReceived>0))return true;}return false;});
  }
  await mkdir('test-results',{recursive:true});
  await pages[0].screenshot({path:'test-results/lol-auto-desktop.png',fullPage:true});
  await pages[1].setViewportSize({width:390,height:844});
  await pages[1].screenshot({path:'test-results/lol-auto-mobile.png',fullPage:true});
  assert.equal(await pages[1].evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // Preserve mute preference across automatically joined matches.
  await pages[0].getByRole('button',{name:'Desligar microfone',exact:true}).click();
  await new Promise(resolve=>setTimeout(resolve,600));
  agents[0].send(JSON.stringify({type:'snapshot',snapshot:{state:'ended'}}));
  for(const page of pages) {
    await page.locator('#call-section').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.testStreams.at(-1).getAudioTracks()[0].enabled),false);
    await page.getByRole('button',{name:'Desativar voz automática'}).waitFor();
  }
  await new Promise(resolve=>setTimeout(resolve,600));
  for(const ws of agents)sendGame(ws,'456');
  for(const page of pages)await page.getByText('Áudio conectado',{exact:true}).waitFor({timeout:20000});
  assert.equal(await pages[0].evaluate(()=>window.testStreams.at(-1).getAudioTracks()[0].enabled),false);
  assert.equal(await pages[1].evaluate(()=>window.testStreams.at(-1).getAudioTracks()[0].enabled),true);
  for(const page of pages) {
    await page.getByRole('button',{name:'Desativar voz automática'}).click();
    await page.getByRole('button',{name:'Ativar voz automática'}).waitFor();
    assert.equal(await page.evaluate(()=>window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
  }
  assert.equal(app.rooms.size,0);assert.deepEqual(errors,[]);
  console.log('OK: pareamento, entrada automatica de aliados, audio real simulado, fim e proxima partida, mute preservado e microfone parado ao desativar.');
} finally {for(const ws of agents)ws.terminate();await browser.close();await app.close();}
