// 公式サイトのゲーム画面 6 枚（img/game/*.webp、520×1125）を撮る。使い方：GAME_DIST=<renjill-game の dist の絶対パス> PW_EXEC=<chrome> NODE_PATH=<playwright> node tools/make_gameshots.mjs '[["asakusa","asakusa",705,17905],["ginza","ginza",1116,23322],["gyoen","gyoen",728,18501],["kaihin","kaihin",1072,20548],["shibuya","shibuya",784,18660],["yamanote","yamanote",527,16900]]'
// （名前・場所・時刻（分。705＝11:45 から走って 11:57 ごろ）・点数）→ /tmp/lp_*.png を webp（quality 82）にして img/game へ。ゲームのキャラクターの絵を変えたら撮り直す（2026-11-16：手足の作り込み）
import { createRequire } from 'module'; const { chromium } = createRequire('/opt/npm-tools/node_modules/')('playwright');
const b = await chromium.launch({ executablePath: process.env.PW_EXEC });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 520 / 390 }); const p = await ctx.newPage(); await p.route('**/fonts.googleapis.com/**', r => r.abort());
await p.addInitScript(() => localStorage.setItem('renjill-hay-dash-v1', JSON.stringify({ tutDone: 1, nickAsked: 1, runs: 9, lang: 'ja', best: 21000 })));
await p.goto('file://' + (process.env.GAME_DIST || '../renjill-game/dist') + '/test.html'); await p.waitForTimeout(1500);
const keys = await p.evaluate(() => Object.keys(window.__hayDash.THEMES)); console.log(keys.filter(k => /asak|ginz|gyoen|kaihin|shibu|yamano|sinjuku|shinjuku|odaiba|train/i.test(k)).join(' '));
await p.click('#btnStart'); await p.waitForTimeout(1000);
await p.evaluate(() => { const { G, act } = window.__hayDash; setInterval(() => { if (G.mode !== 'play') return; const seg = G.segs[G.ci]; G.invT = 99; if (G.s > seg.len - Math.max(13, G.speed) + 1 && !G.turnQueued) act(seg.fork ? 'left' : seg.turn > 0 ? 'right' : 'left'); }, 16); });
for (const [name, key, clock, score] of JSON.parse(process.argv[2])) { await p.evaluate(([key, clock, score]) => { const G = window.__hayDash.G; G.jumpTo(key, clock, 1); G.score = score; G.combo = 12; }, [key, clock, score]); await p.waitForTimeout(2600);
  const k = await p.evaluate(() => { const G = window.__hayDash.G; return G.segs[G.ci].th.kind + ' s=' + (G.s | 0); }); await p.screenshot({ path: `/tmp/lp_${name}.png` }); console.log(name, k); }
await b.close();
