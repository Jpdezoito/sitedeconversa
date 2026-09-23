import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
// Render the vector at each native Windows icon size. ICO contains PNG image entries.
const svg=(await readFile(new URL('../public/favicon.svg',import.meta.url),'utf8')).replace(/^\uFEFF/,'');
const browser=await chromium.launch({channel:'chrome',headless:true});
const sizes=[16,20,24,32,48,64,128,256];const images=[];
try {
 const page=await browser.newPage({deviceScaleFactor:1});
 for(const size of sizes){await page.setViewportSize({width:size,height:size});await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);images.push(await page.screenshot({omitBackground:true}));}
} finally {await browser.close();}
const header=Buffer.alloc(6+16*images.length);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);let offset=header.length;
for(let i=0;i<images.length;i++){const at=6+16*i;header[at]=header[at+1]=sizes[i]===256?0:sizes[i];header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(images[i].length,at+8);header.writeUInt32LE(offset,at+12);offset+=images[i].length;}
await writeFile(new URL('../desktop/icon.ico',import.meta.url),Buffer.concat([header,...images]));
await writeFile(new URL('../desktop/icon.png',import.meta.url),images.at(-1));
console.log('Icones Windows gerados em oito tamanhos, de 16 a 256 pixels.');
