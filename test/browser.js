import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createVoiceServer } from '../server.js';

const app=createVoiceServer();
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base=`http://localhost:${app.server.address().port}`;
let browser;
try {
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  const errors=[];
  const makePage=async()=>{
    const context=await browser.newContext({permissions:['microphone','clipboard-read','clipboard-write'],viewport:{width:1440,height:1080}});
    await context.addInitScript(()=>{
      window.testPeers=[]; window.testStreams=[];
      const NativePeer=window.RTCPeerConnection;
      window.RTCPeerConnection=class extends NativePeer { constructor(...args) { super(...args); window.testPeers.push(this); } };
      const getMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await getMedia(constraints);window.testStreams.push(stream);return stream;};
    });
    const page=await context.newPage(); page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base); await page.getByText('Tudo pronto para conectar').waitFor(); return page;
  };
  const a=await makePage(),b=await makePage();
  await mkdir('test-results',{recursive:true});
  await a.screenshot({path:'test-results/home-desktop.png',fullPage:true});
  await a.getByRole('button',{name:'Criar meu grupo'}).click();
  await a.getByLabel('Seu nome',{exact:true}).fill('Ana');
  await a.getByRole('button',{name:'Pode me chamar assim'}).click();
  await a.getByLabel('Nome do grupo',{exact:true}).fill('Resenha da galera');
  await a.getByRole('button',{name:'Criar e entrar'}).click();
  await a.locator('#call-name').getByText('Resenha da galera').waitFor();
  await b.locator('.join-button').click();
  await b.getByLabel('Seu nome',{exact:true}).fill('Bruno');
  await b.getByRole('button',{name:'Pode me chamar assim'}).click();
  await a.getByText('Áudio conectado',{exact:true}).waitFor({timeout:20000});
  await b.getByText('Áudio conectado',{exact:true}).waitFor({timeout:20000});
  for(const page of [a,b]) await page.waitForFunction(async()=>{
    for(const peer of window.testPeers) {
      const stats=await peer.getStats();
      if([...stats.values()].some(s=>s.type==='inbound-rtp' && s.kind==='audio' && s.bytesReceived>0)) return true;
    }
    return false;
  });
  assert.equal(await a.locator('.participant').count(),2);
  assert.equal(await b.locator('#audio-container audio').count(),1);
  await a.getByRole('button',{name:'Desligar microfone',exact:true}).click();
  await b.getByText('Microfone desligado',{exact:true}).waitFor();
  await a.getByRole('button',{name:'Ligar microfone',exact:true}).click();
  await a.getByRole('button',{name:'Desligar som',exact:true}).click();
  await b.getByText('Som desligado',{exact:true}).waitFor();
  await a.getByRole('button',{name:'Ligar som',exact:true}).click();
  await a.getByRole('button',{name:'Convidar',exact:true}).click();
  const invite=await a.evaluate(()=>navigator.clipboard.readText()); assert.match(invite,/grupo=/);
  await a.screenshot({path:'test-results/call-desktop.png',fullPage:true});
  await b.setViewportSize({width:390,height:844});
  await b.screenshot({path:'test-results/call-mobile.png',fullPage:true});
  assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await b.locator('.groups-section [data-create]').first().click();
  await b.getByLabel('Nome do grupo',{exact:true}).fill('Jogatina');
  await b.locator('.theme-options label').filter({hasText:'Jogatina'}).click();
  await b.getByRole('button',{name:'Criar e entrar'}).click();
  await b.locator('#call-name').getByText('Jogatina',{exact:true}).waitFor();
  await a.waitForFunction(()=>document.querySelectorAll('.participant').length===1);
  assert.equal(await a.locator('.room-card').count(),2);
  assert.equal(await a.locator('#active-rooms').textContent(),'2');
  assert.equal(await a.locator('#active-people').textContent(),'2');
  await a.locator('[data-filter="game"]').click();
  assert.equal(await a.locator('.room-card').count(),1);
  assert.equal(await a.locator('.room-card').getAttribute('data-theme'),'game');
  await a.locator('[data-filter="music"]').click();
  await a.locator('#no-results').waitFor();
  await a.locator('[data-filter="all"]').click();
  assert.equal(await a.locator('#audio-container audio').count(),0);
  await a.locator('#search').fill('jogatina'); assert.equal(await a.locator('.room-card').count(),1);
  await a.locator('#search').fill('inexistente'); await a.locator('#no-results').waitFor();
  await a.locator('#search').fill('');
  await a.getByRole('button',{name:'Sair do grupo'}).click();
  await b.getByRole('button',{name:'Sair do grupo'}).click();
  await a.locator('#empty-state').waitFor();
  await b.locator('#empty-state').waitFor();
  await b.screenshot({path:'test-results/home-mobile.png',fullPage:true});
  for(const page of [a,b]) assert.equal(await page.evaluate(()=>window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
  for(const ws of app.wss.clients) ws.terminate();
  await a.getByText('Reconectando…',{exact:true}).first().waitFor();
  await a.getByText('Tudo pronto para conectar').waitFor();
  const expired=await makePage(); await expired.goto(invite); await expired.getByText(/Este convite expirou/).waitFor();
  // A denied microphone must not create a room or leave the form busy.
  await expired.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('denied','NotAllowedError'));});
  await expired.getByRole('button',{name:'Criar meu grupo'}).click();
  await expired.getByLabel('Seu nome',{exact:true}).fill('Carol'); await expired.getByRole('button',{name:'Pode me chamar assim'}).click();
  await expired.getByLabel('Nome do grupo',{exact:true}).fill('Sem permissão'); await expired.getByRole('button',{name:'Criar e entrar'}).click();
  await expired.getByText('Permita o acesso ao microfone no navegador para conversar.').waitFor();
  assert.equal(app.rooms.size,0);
  assert.deepEqual(errors,[]);
  console.log('OK: voz entre 2 navegadores, mute, som, convites, salas isoladas, busca, limpeza, permissão negada e layout mobile.');
} finally { await browser?.close(); await app.close(); }
