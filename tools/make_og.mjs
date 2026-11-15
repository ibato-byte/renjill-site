// 共有用の画像 og.jpg（1200×630）を作る。使い方：node tools/make_og.mjs <フォントのフォルダ>
//   フォントのフォルダ＝ npm i @fontsource/fredoka @fontsource/zen-maru-gothic した node_modules（どちらも無料の SIL OFL。サイトと同じ字）
//   キャラクターの絵は img/char/（ゲーム・アニメと同じ絵）。書いてある事実（毎日 18:00）が変わったら作り直す。
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright'); // NODE_PATH でも見つかる読み込み方（qa/check.mjs と同じ）
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))), fdir = process.argv[2];
const b64 = (f, mime) => `data:${mime};base64,${fs.readFileSync(f).toString('base64')}`;
const F = (fam, file, w) => `@font-face{font-family:"${fam}";src:url("${b64(path.join(fdir, file), 'font/woff2')}") format("woff2");font-weight:${w}}`;
const img = (k) => b64(path.join(ROOT, 'img/char', k + '.webp'), 'image/webp');
const html = `<style>${F('Fredoka', '@fontsource/fredoka/files/fredoka-latin-700-normal.woff2', 700)}${F('Fredoka', '@fontsource/fredoka/files/fredoka-latin-600-normal.woff2', 600)}${F('Zen', '@fontsource/zen-maru-gothic/files/zen-maru-gothic-japanese-900-normal.woff2', 900)}${F('Zen', '@fontsource/zen-maru-gothic/files/zen-maru-gothic-japanese-700-normal.woff2', 700)}
html,body{margin:0}body{width:1200px;height:630px;overflow:hidden;position:relative;background:radial-gradient(90% 120% at 30% 40%,#FBF4E6 0%,#F1E3CB 70%,#EAD8BA 100%);font-family:Zen,sans-serif;color:#2B1D12}
.hay{position:absolute;width:7px;height:38px;border-radius:4px;background:#D9A520;opacity:.42}
.badge{position:absolute;left:64px;top:62px;padding:11px 20px;border-radius:12px;background:#1E3A5F;color:#fff;font:700 21px/1 Fredoka;letter-spacing:.12em;box-shadow:0 5px 0 #132844}
h1{position:absolute;left:60px;top:118px;margin:0;font:700 150px/.88 Fredoka;letter-spacing:-.045em;color:#FBF6EC;-webkit-text-stroke:11px #5A3A22;paint-order:stroke fill;text-shadow:9px 9px 0 #5A3A22}
h1 i{font-style:normal;color:#D9A520;font-size:.78em}
.ja{position:absolute;left:66px;top:404px;font:900 46px/1 Zen;letter-spacing:.04em}
.sub{position:absolute;left:66px;top:466px;font:700 24px/1.5 Zen;color:#4B3626}.sub b{display:block;font:600 22px/1.3 Fredoka;letter-spacing:.01em;color:#6B4E36}
.card{position:absolute;right:58px;top:52px;width:486px;height:486px;border-radius:44px;background:linear-gradient(#CFE6F3 0%,#E8F1EE 46%,#F3E3C6 46.2%,#EBD4AC 100%);border:8px solid #FBF6EC;box-shadow:0 0 0 4px #5A3A22,14px 16px 0 #D9A520;transform:rotate(2.2deg);overflow:hidden}
.card:before{content:"";position:absolute;left:0;right:0;top:46%;height:10px;background:rgba(90,58,34,.16)}
.card img{position:absolute;filter:drop-shadow(0 8px 0 rgba(90,58,34,.16))}
.bar{position:absolute;left:0;right:0;bottom:0;height:74px;border-top:3px dotted #C9A87E;background:#FBF6EC}
.pill{position:absolute;left:64px;bottom:18px;padding:11px 20px;border-radius:999px;background:#D9A520;font:700 20px/1 Fredoka;letter-spacing:.08em;box-shadow:0 4px 0 #A87A12}
.at{position:absolute;left:412px;bottom:27px;font:700 23px/1 Fredoka;letter-spacing:.02em}
.stamp{position:absolute;right:34px;bottom:22px;width:132px;height:132px;border-radius:50%;background:#D43D2F;color:#fff;display:grid;place-items:center;text-align:center;transform:rotate(-12deg);box-shadow:0 0 0 5px #FBF6EC,0 0 0 9px #D43D2F;font:700 26px/1.02 Fredoka;letter-spacing:.02em}.stamp small{display:block;font-size:19px;letter-spacing:.06em;margin-top:5px}
</style>${Array.from({ length: 16 }, (_, i) => { const r = (n) => { const x = Math.sin((i + 3) * 12.9898 * n) * 43758.5453; return x - Math.floor(x); }; return `<i class="hay" style="left:${Math.round(r(1) * 620)}px;top:${Math.round(r(2) * 560)}px;transform:rotate(${Math.round(r(3) * 180)}deg)"></i>`; }).join('')}
<div class="badge">NO DIALOGUE</div><h1>REN<i>&amp;</i><br>JILL</h1><div class="ja">レンとジル</div><div class="sub">セリフのない、うさぎのオフィスコメディ<b>A wordless rabbit office comedy</b></div>
<div class="card"><img src="${img('ren_happy')}" style="left:46px;top:96px;width:330px"><img src="${img('jill_happy')}" style="left:268px;top:196px;width:226px"><img src="${img('pom_happy')}" style="left:-12px;top:236px;width:196px"></div>
<div class="bar"></div><div class="pill">NEW EPISODE · EVERY DAY</div><div class="at">@renjill_office</div><div class="stamp"><span>EVERY<br>DAY<small>18:00</small></span></div>`;
const b = await chromium.launch({ executablePath: process.env.PW_EXEC || undefined }); const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.setContent(html); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500); await p.screenshot({ path: path.join(ROOT, 'og.jpg'), type: 'jpeg', quality: 90 }); await b.close(); console.log('og.jpg', fs.statSync(path.join(ROOT, 'og.jpg')).size);
