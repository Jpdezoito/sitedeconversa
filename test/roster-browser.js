import { chromium } from '@playwright/test';
import { WebSocket } from 'ws';
import assert from 'node:assert/strict';
import { createVoiceServer } from '../server.js';
const app=createVoiceServer();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});let agent;const errors=[];
try{
 const context=await browser.newContext({permissions:['microphone'],viewport:{width:1440,height:1050}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${app.server.address().port}`);await page.getByText('Tudo pronto para conectar').waitFor();await page.locator('#auto-button').click();await page.locator('#name-input').fill('Jogador de teste');await page.locator('#name-form').getByRole('button',{name:'Pode me chamar assim'}).click();await page.locator('#pair-panel').waitFor();const code=await page.locator('#pair-code').textContent();
 agent=new WebSocket(`ws://127.0.0.1:${app.server.address().port}/lol-agent`);await new Promise(r=>agent.once('open',r));const paired=new Promise(r=>agent.once('message',r));agent.send(JSON.stringify({code}));await paired;
 const players=[{championId:266,role:'TOP'},{championId:64,role:'JUNGLE'},{championId:103,role:'MIDDLE'},{championId:360,role:'BOTTOM',isSelf:true},{championId:267,role:'UTILITY'}].map((p,i)=>({...p,name:'Aliado '+(i+1)+'#BR1',locked:true}));
 const selection={state:'idle',phase:'ChampSelect',roster:{stage:'select',players}};
 const send=snapshot=>agent.send(JSON.stringify({type:'snapshot',snapshot}));send(selection);
 await page.waitForFunction(()=>document.querySelectorAll('.ally-card').length===5);assert.deepEqual(await page.locator('.ally-card h3').allTextContents(),Array(5).fill('Anônimo'));assert.equal(await page.locator('#call-section').isVisible(),false);
 await page.locator('#allies-section').scrollIntoViewIfNeeded();await page.waitForTimeout(700);await page.screenshot({path:'test-results/allies-select-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('#allies-section').scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'test-results/allies-select-mobile.png'});await page.setViewportSize({width:1440,height:1050});
 send({state:'playing',phase:'InProgress',match:{key:'BR:98989:100',region:'BR',gameId:'98989',teamId:100,capacity:5},roster:{stage:'live',players}});
 await page.waitForFunction(()=>document.querySelector('.ally-card h3')?.textContent==='Aliado 1#BR1');await page.locator('#allies-section').scrollIntoViewIfNeeded();await page.waitForTimeout(700);await page.screenshot({path:'test-results/allies-live-desktop.png'});
 send({state:'ended',phase:'EndOfGame'});await page.locator('#allies-section').waitFor({state:'hidden'});assert.equal(await page.locator('.ally-card').count(),0);await page.waitForTimeout(600);send(selection);await page.locator('#allies-section').waitFor();assert.deepEqual(await page.locator('.ally-card h3').allTextContents(),Array(5).fill('Anônimo'));
 await page.locator('#auto-button').click();await page.locator('#allies-section').waitFor({state:'hidden'});assert.deepEqual(errors,[]);console.log('Aliados: seleção anônima, nomes em partida, encerramento, nova seleção e layout móvel OK.');
}finally{agent?.close();await browser.close();await app.close();}
