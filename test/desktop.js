import { _electron as electron } from '@playwright/test';
import { createVoiceServer } from '../server.js';
import { mkdtemp, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const server = createVoiceServer();
await new Promise(resolve => server.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.server.address().port}`;
const apps = [], errors = [];
const env = { ...process.env, ELO_SERVER_URL: base };
delete env.ELECTRON_RUN_AS_NODE;
try {
  const pages = [];
  for (const name of ['Ana', 'Bruno']) {
    const userData = await mkdtemp(path.join(os.tmpdir(), 'elo-desktop-test-'));
    const app = await electron.launch({ args: ['.', '--user-data-dir=' + userData, '--use-fake-device-for-media-stream'], env, timeout: 45000 });
    apps.push(app);
    const page = await app.firstWindow(); pages.push(page);
    page.on('pageerror', e => errors.push(e.message));
    await page.getByText('Tudo pronto para conectar').waitFor();
    await page.evaluate(() => { window.testPeers = []; const PC = RTCPeerConnection; window.RTCPeerConnection = class extends PC { constructor(...args) { super(...args); window.testPeers.push(this); } }; });
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    await page.getByRole('button', { name: 'Ativar voz automática', exact: true }).click();
    await page.getByLabel('Seu nome', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Pode me chamar assim' }).click();
    await page.getByRole('button', { name: 'Desativar voz automática', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('#lol-title').textContent !== 'Conecte seu LoL para entrar automaticamente');
    await new Promise((resolve, reject) => { const deadline = Date.now() + 15000; const check = () => server.agents.clients.size === 1 ? resolve() : Date.now() > deadline ? reject(new Error('Conector integrado n?o pareou')) : setTimeout(check, 100); check(); });
    await page.waitForFunction(() => !document.querySelector('#pair-code').textContent);
    assert.equal(await page.locator('#pair-panel').isVisible(), false);
    assert.equal(await page.locator('a[download]').isVisible(), false);
    await page.getByRole('button', { name: 'Desativar voz automática', exact: true }).click();
  }
  await pages[0].getByRole('button', { name: 'Criar meu grupo' }).click();
  await pages[0].locator('#room-name').fill('Instalador funcionando');
  await pages[0].locator('#create-submit').click();
  await pages[0].locator('#call-section').waitFor();
  await pages[1].getByRole('button', { name: 'Entrar no grupo', exact: true }).click();
  for (const page of pages) await page.getByText('Áudio conectado', { exact: true }).waitFor({ timeout: 20000 });
  for (const page of pages) await page.waitForFunction(async () => { for (const pc of window.testPeers) { const stats = await pc.getStats(); if ([...stats.values()].some(s => s.type === 'inbound-rtp' && s.kind === 'audio' && s.bytesReceived > 0)) return true; } return false; });
  await mkdir('test-results', { recursive: true });
  await pages[0].screenshot({ path: 'test-results/desktop-app.png' });
  await pages[0].getByRole('button', { name: 'Comunidade', exact: true }).click();
  await pages[0].locator('#server-url').waitFor();
  assert.equal(await pages[0].locator('#server-url').inputValue(), base);
  assert.deepEqual(errors, []);
  console.log('Desktop: pareamento integrado, isolamento, dois aplicativos com áudio e configuração OK.');
} finally {
  for (const app of apps) await app.close();
  await server.close();
}
