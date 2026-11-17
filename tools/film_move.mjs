// 動く 3D の 1 回の移動を、33ms ごとに撮る（ため〜着地〜向き直り）。使い方：python3 -m http.server 8801 をこのフォルダで動かし、node tools/film_move.mjs -1（左）または 1（右） [幅] [高さ] [名前] → /tmp/名前_番号.png
// ページの時計を自分で進めるので、撮るのに時間がかかっても動きがとばない（2026-11-17）
// 1 回の移動（左へ・右へ）を、ため〜着地〜向き直りまで 33ms ごとに撮る
import { createRequire } from 'module'; const { chromium } = createRequire('/opt/npm-tools/node_modules/')('playwright');
const want = +(process.argv[2] || -1), W = +(process.argv[3] || 1280), H = +(process.argv[4] || 800), tag = process.argv[5] || 'mv';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }); await p.route('**/fonts.googleapis.com/**', r => r.abort());
await p.addInitScript(() => { window.__q = []; window.__T = 1000; window.requestAnimationFrame = (f) => { window.__q.push(f); return window.__q.length; }; window.cancelAnimationFrame = () => {}; const pn = performance.now.bind(performance); performance.now = () => window.__T; });
await p.goto('http://127.0.0.1:8801/?g3d=1'); await p.waitForTimeout(1500);
const step = (n, ms) => p.evaluate(([n, ms]) => { for (let i = 0; i < n; i++) { window.__T += ms; const q = window.__q; window.__q = []; q.forEach(f => f(window.__T)); } }, [n, ms]);
p.clock = { runFor: (ms) => step(Math.max(1, Math.round(ms / 16.7)), ms / Math.max(1, Math.round(ms / 16.7))) };
for (let i = 0; i < 60; i++) await p.clock.runFor(50);
const ys = await p.evaluate(() => [...document.querySelectorAll('.g3d-spot')].map(e => e.getBoundingClientRect().top + scrollY));
const st = () => p.evaluate(() => window.__g3d.chars.map(c => ({ m: c.mode, d: c.dir, x: c.x, y: c.y, h: c.h, s: c.size, t: c.t, tA: c.tA || 0, gy: c.gy })));
let got = 0; const log = [];
for (let i = 1; i < ys.length && !got; i++) {
  await p.evaluate(y => scrollTo(0, y - innerHeight * 0.5), ys[i - 1]); for (let k = 0; k < 90; k++) await p.clock.runFor(40);
  await p.evaluate(y => scrollTo(0, y - innerHeight * 0.5), ys[i]);
  let n = 0, seen = false, after = 0;
  for (let k = 0; k < 140; k++) { await p.clock.runFor(33); const v = await st(); const c = v[0];
    if (c.m === 'fly' && c.d === want) seen = true;
    if (!seen) { if (k > 40) break; continue; }
    if (c.m !== 'fly') after++; if (after > (+process.env.AFTER || 30)) break;
    const gy = Math.max(...v.map(q => q.gy || q.y)), top = Math.min(...v.map(q => q.y - q.s * 1.15));
    const y0 = Math.max(0, Math.min(top, gy - v[0].s * 1.5)), y1 = Math.min(H, gy + v[0].s * 0.15);
    if (n < 40) await p.screenshot({ path: `/tmp/${tag}_${n}.png`, clip: { x: 0, y: y0, width: W, height: Math.max(40, y1 - y0) } });
    log.push(`${n}:${c.m[0]}t${(+c.t).toFixed(2)}a${(+c.tA).toFixed(2)}h${(+c.h).toFixed(0)}`); n++; }
  if (seen) got = n; }
console.log('frames', got, log.slice(0, 40).join(' '), ' ... LAST ', log.slice(-3).join(' ')); await b.close();
