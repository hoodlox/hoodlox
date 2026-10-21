// Shows public/brand/logo.png on white, paper, dark and magenta to spot leftover background.
// usage: node tools/logo-check.mjs → shots/logo-check.png
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const src = `data:image/png;base64,${readFileSync('public/brand/logo.png').toString('base64')}`;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 900, height: 320 } });
const cell = (c) => `<div style="flex:1;height:320px;background:${c};display:grid;place-items:center"><img src="${src}" style="width:200px"></div>`;
await page.setContent(`<body style="margin:0;display:flex">${['#ffffff', '#f4eee0', '#111216', '#ff4fd8'].map(cell).join('')}</body>`);
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/logo-check.png' });
process.exit(0);
