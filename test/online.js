import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const { Url: base } = JSON.parse((await readFile(new URL('../.runtime/online.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
assert.match(base, /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/);
for (const path of ['/', '/style.css', '/app.js', '/health']) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, `${path} precisa estar acessivel`);
}
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
try {
  const pages = [];
  const errors = [];
  for (const name of ['Teste online A', 'Teste online B']) {
    const context = await browser.newContext({ permissions: ['microphone'] });
    await context.addInitScript(() => {
      window.testPeers = [];
      const NativePeer = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends NativePeer {
        constructor(...args) { super(...args); window.testPeers.push(this); }
      };
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.getByText('Tudo pronto para conectar', { exact: true }).waitFor({ timeout: 20000 });
    await page.locator('#profile-button').click();
    await page.getByLabel('Seu nome', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Pode me chamar assim' }).click();
    pages.push(page);
  }
  const [a, b] = pages;
  const roomName = `Verificacao ${Date.now()}`;
  await a.locator('.groups-section [data-create]').first().click();
  await a.getByLabel('Nome do grupo', { exact: true }).fill(roomName);
  await a.getByRole('button', { name: 'Criar e entrar' }).click();
  await a.locator('#call-name').getByText(roomName).waitFor();
  await b.locator('.room-card').filter({ hasText: roomName }).getByRole('button').click();
  for (const page of pages) {
    await page.getByText('Áudio conectado', { exact: true }).waitFor({ timeout: 25000 });
    await page.waitForFunction(async () => {
      for (const peer of window.testPeers) {
        const stats = await peer.getStats();
        if ([...stats.values()].some(s => s.type === 'inbound-rtp' && s.kind === 'audio' && s.bytesReceived > 0)) return true;
      }
      return false;
    }, null, { timeout: 15000 });
  }
  for (const page of pages) await page.getByRole('button', { name: 'Sair do grupo' }).click();
  await a.waitForFunction(name => ![...document.querySelectorAll('.room-card')].some(el => el.textContent.includes(name)), roomName);
  assert.deepEqual(errors, []);
  console.log(`OK: HTTPS, arquivos, WebSocket, sala e audio WebRTC com microfone simulado pelo link publico: ${base}`);
} finally { await browser.close(); }
