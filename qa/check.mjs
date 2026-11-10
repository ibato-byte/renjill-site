// レンとジル 公式サイトの検査（50項目）。使い方：python3 -m http.server 8765 & node qa/check.mjs [round名]
// 画面の大きさ7種類 × 言語4つ × 動きを減らす設定 で、表示・文言・SEO・アクセシビリティ・矛盾を確かめる。
// 外部の通信は止め、エピソード一覧は qa/fixture-episodes.json を使う（ネットが無くても同じ結果になる）
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
let chromium; try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = createRequire(execSync('npm root -g').toString().trim() + '/')('playwright')); }
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:8765/';
const ROUND = process.argv[2] || 'r1';
const VIEWS = [[320, 568], [375, 667], [390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const LANGS = ['ja', 'en', 'zh', 'ko'];
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const fail = {}; const note = (id, msg) => { (fail[id] ||= new Set()).add(msg); };
const CHECKS = {};
const def = (id, name) => (CHECKS[id] = name);
// ---- 静的（ファイル）
def(1, 'title の長さ（15〜70文字）'); def(2, 'meta description（50〜160文字）'); def(3, 'canonical が正しい'); def(4, 'hreflang 4言語＋x-default');
def(5, 'OGP（title/description/image/url/type）'); def(6, 'Twitter カード'); def(7, 'JSON-LD が正しい JSON で、主要な型がある');
def(8, 'sitemap.xml が正しく、canonical と hreflang を含む'); def(9, 'robots.txt に sitemap'); def(10, 'site.webmanifest が正しい JSON（name・icons）');
def(11, 'llms.txt があり、サイトと同じ事実（毎日・秒数）'); def(12, '404.html がある・noindex'); def(13, 'SNS の URL が全部の場所で同じ');
def(14, '文言 T：全部のキーに4言語'); def(15, 'data-t のキーが T にあり、HTML の初めの文と食い違わない'); def(16, 'エピソード EPS：4言語の題・一言');
def(17, '事実の矛盾がない（秒数・投稿の頻度・イベント期間・TikTok が早い等の言い過ぎ）'); def(18, 'http: の読み込みがない'); def(19, 'img に alt / width・height');
def(20, '外部リンク target=_blank に rel=noopener');
// ---- 画面ごと
def(21, 'JS エラーがない'); def(22, '横スクロールが出ない'); def(23, '画面に undefined / NaN / null / {t} が出ない'); def(24, 'h1 が1つ');
def(25, '見出しの順序が飛ばない（h2→h4 など）'); def(26, '同じ id が2つない'); def(27, 'ボタン・リンクに名前がある'); def(28, 'html の lang が言語と一致');
def(29, 'title が言語に合わせて変わる'); def(30, '言語の切り替えで未翻訳の日本語が残らない（英語ページ）'); def(31, 'ボタン・タグの文字がはみ出さない');
def(32, 'スマホでタップ領域が小さすぎない（主要ボタン 40px 以上）'); def(33, 'ヘッダーと本文が重ならない'); def(34, '本文へスキップ リンク');
def(35, '画像が読めないときも枠が崩れない'); def(36, 'エピソードの番号が重複しない・新しい順'); def(37, '日付の書式がそろっている'); def(38, '次の新作の日付が正しい（毎日）');
def(39, '曜日の帯が「毎日」と矛盾しない'); def(40, 'PICKUP が最新回 or 告知期間に合う'); def(41, '動きを減らす設定でアニメーションが止まる'); def(42, 'ページ内リンク #id の行き先がある');
def(43, 'キーボードのフォーカスが見える'); def(44, '文字のコントラスト（主要な文 4.5:1 以上）'); def(45, 'エピソード一覧の題がその言語で出る'); def(46, '言語の保存と ?lang= が効く');
def(47, 'ライトボックス（動画）が Esc で閉じる'); def(48, '本文の文字が小さすぎない（12px 以上）'); def(49, 'canonical/hreflang が言語の切り替え後も正しい'); def(50, 'ページの重さ（HTML 400KB 以下）');

// ---------- 静的な検査
const m = (re) => (html.match(re) || [])[1];
{ const t = m(/<title>([^<]*)<\/title>/); if (!t || t.length < 15 || t.length > 70) note(1, 'title ' + (t || '').length);
  const d = m(/<meta name="description" content="([^"]*)"/); if (!d || d.length < 50 || d.length > 160) note(2, 'desc ' + (d || '').length);
  if (!/<link rel="canonical" href="https:\/\/renjill\.coana\.co\.jp\/">/.test(html)) note(3, 'canonical');
  for (const h of ['ja', 'en', 'zh-Hant', 'ko', 'x-default']) if (!new RegExp(`hreflang="${h}"`).test(html)) note(4, h);
  for (const p of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type']) if (!html.includes(`property="${p}"`)) note(5, p);
  for (const p of ['twitter:card', 'twitter:title', 'twitter:image']) if (!html.includes(`name="${p}"`)) note(6, p);
  const lds = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
  const types = new Set(); for (const s of lds) { try { const j = JSON.parse(s); const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o['@type']) [].concat(o['@type']).forEach((t) => types.add(t)); Object.values(o).forEach(walk); } }; walk(j); } catch (e) { note(7, 'JSON-LD parse ' + e.message); } }
  for (const t of ['WebSite', 'Organization', 'VideoObject']) if (!types.has(t)) note(7, 'type ' + t);
  const sm = fs.readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8'); if (!sm.includes('<loc>https://renjill.coana.co.jp/</loc>') || !sm.includes('hreflang')) note(8, 'sitemap');
  if (!/Sitemap:\s*https:\/\/renjill\.coana\.co\.jp\/sitemap\.xml/.test(fs.readFileSync(new URL('../robots.txt', import.meta.url), 'utf8'))) note(9, 'robots');
  try { const w = JSON.parse(fs.readFileSync(new URL('../site.webmanifest', import.meta.url), 'utf8')); if (!w.name || !w.icons || !w.icons.length) note(10, 'manifest fields'); } catch (e) { note(10, 'manifest ' + e.message); }
  try { const l = fs.readFileSync(new URL('../llms.txt', import.meta.url), 'utf8'); if (!/毎日|daily/i.test(l)) note(11, 'llms.txt に毎日がない'); if (/30\s?秒|30-second|30 sec/i.test(l)) note(11, 'llms.txt 30秒'); } catch { note(11, 'llms.txt なし'); }
  try { const n = fs.readFileSync(new URL('../404.html', import.meta.url), 'utf8'); if (!/noindex/.test(n)) note(12, '404 noindex なし'); } catch { note(12, '404 なし'); }
  for (const s of ['youtube.com/@renjill_office', 'instagram.com/renjill_office', 'tiktok.com/@renjill_office', 'threads.net/@renjill_office']) { const n = html.split(s).length - 1; if (n < 2) note(13, s + ' ' + n); }
  if (/threads\.com\/@renjill/.test(html) && /threads\.net\/@renjill/.test(html)) note(13, 'threads.net と threads.com が混在');
  if (/http:\/\/(?!www\.w3\.org)/.test(html)) note(18, 'http:');
  for (const im of html.matchAll(/<img\b[^>]*>/g)) { const s = im[0]; if (!/\balt=/.test(s)) note(19, 'alt なし ' + s.slice(0, 60)); if (!/\bwidth=/.test(s) || !/\bheight=/.test(s)) note(19, 'width/height なし ' + s.slice(0, 60)); }
  for (const a of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) if (!/rel="[^"]*noopener/.test(a[0])) note(20, a[0].slice(0, 80));
  // 事実の矛盾（17）
  const FACT = [[/30\s?秒|30 seconds|30-second|約30秒|30초/, '1話は約10秒なのに「30秒」'], [/いちばん早く、新作が出ます|first to get new episodes/i, 'TikTok が最速と書いている（TikTok は手動で同じ日か遅い）'], [/毎週|every week|weekly/i, '投稿は毎日なのに「毎週」']];
  for (const [re, msg] of FACT) if (re.test(html.replace(/<!--[\s\S]*?-->/g, ''))) note(17, msg);
  if (/Lenis \+ GSAP/.test(html)) note(17, 'コメントに使っていない GSAP/Lenis');
  if (fs.statSync(new URL('../index.html', import.meta.url)).size > 400 * 1024) note(50, 'index.html が 400KB 超');
}

// ---------- ブラウザでの検査
const fixture = fs.readFileSync(new URL('./fixture-episodes.json', import.meta.url), 'utf8');
const b = await chromium.launch();
async function open(w, h, lang, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: opts.reduce ? 'reduce' : 'no-preference', hasTouch: w < 900, isMobile: w < 900, locale: lang === 'zh' ? 'zh-TW' : lang });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (mm) => { if (mm.type() === 'error' && !/Failed to load resource|ERR_/.test(mm.text())) errs.push(mm.text()); });
  await p.route(/^https?:\/\/(?!localhost)/, (r) => { const u = r.request().url(); if (u.includes('episodes.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: opts.noFeed ? '[]' : fixture }); return r.abort(); });
  await p.goto(BASE + (opts.q ?? ('?lang=' + lang)), { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1800);
  return { p, ctx, errs };
}
const T = await (async () => { const { p, ctx } = await open(1440, 900, 'ja'); const r = await p.evaluate(() => ({ T: __RJ.T, EPS: __RJ.EPS.map((e) => ({ ep: e.ep, title: e.title, cap: e.cap, date: e.date })), keys: [...document.querySelectorAll('[data-t]')].map((e) => e.dataset.t) })); await ctx.close(); return r; })();
for (const [k, v] of Object.entries(T.T)) if (!Array.isArray(v) || v.length < 4 || v.slice(0, 4).some((x) => !x)) note(14, k);
const base = (k) => k;
for (const k of new Set(T.keys)) if (!T.T[k] && !T.T[k + '.touch']) note(15, k);
// HTML に書いた初めの文（日本語）と T の日本語が食い違っていない（JS が動く前・検索エンジンが見る文）
for (const mm of html.matchAll(/data-t="([^"]+)"[^>]*>([^<]{2,})</g)) { const k = mm[1], v = mm[2].trim(); const tj = T.T[k] && T.T[k][0]; if (tj && !/[<&]/.test(tj) && tj.trim() !== v && !(T.T[k + '.touch'])) note(15, `HTML と T がちがう ${k}: 「${v.slice(0, 20)}」≠「${tj.slice(0, 20)}」`); }
for (const e of T.EPS) { if (!e.title || e.title.length < 4 || e.title.some((x) => !x)) note(16, e.ep + ' title'); if (!e.cap || e.cap.length < 4 || e.cap.some((x) => !x)) note(16, e.ep + ' cap'); }

for (const [w, h] of VIEWS) for (const lang of LANGS) {
  const tag = `${w}x${h}/${lang}`;
  const { p, ctx, errs } = await open(w, h, lang);
  // ページ全体をゆっくりスクロール（遅延表示を全部出す）
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += Math.round(h * 0.9)) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(60); }
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
  const r = await p.evaluate(({ lang, w }) => {
    const out = {}; const vis = (e) => { const s = getComputedStyle(e); const rc = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && rc.width > 0 && rc.height > 0 && !e.closest('[hidden],[aria-hidden="true"],.loader'); };
    out.overflow = document.documentElement.scrollWidth - innerWidth;
    const txt = document.body.innerText; out.bad = (txt.match(/\bundefined\b|\bNaN\b|\bnull\b|\{t\}|\{s\}|\{0\}/g) || []).slice(0, 3);
    out.h1 = document.querySelectorAll('h1').length;
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(vis).map((e) => +e.tagName[1]); out.skip = []; for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) out.skip.push(hs[i - 1] + '→' + hs[i]);
    const ids = {}; document.querySelectorAll('[id]').forEach((e) => (ids[e.id] = (ids[e.id] || 0) + 1)); out.dup = Object.keys(ids).filter((k) => ids[k] > 1);
    out.noname = [...document.querySelectorAll('a[href],button')].filter(vis).filter((e) => !(e.getAttribute('aria-label') || e.innerText.trim() || e.title || e.querySelector('img[alt]:not([alt=""])') || e.getAttribute('aria-labelledby'))).map((e) => e.outerHTML.slice(0, 80)).slice(0, 3);
    out.lang = document.documentElement.lang; out.title = document.title;
    if (lang === 'en') { const jp = []; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = walker.nextNode())) { const s = n.nodeValue.trim(); if (s && /[぀-ヿ一-龯]/.test(s) && n.parentElement && vis(n.parentElement) && !n.parentElement.closest('[lang="ja"],.ep-cv,.lang-menu,#langMenu,[translate="no"]')) jp.push(s.slice(0, 30)); } out.jp = [...new Set(jp)].slice(0, 6); }
    out.clip = [...document.querySelectorAll('button, .btn, .char-tags li, .shb, .sns-row, .tag, .chip')].filter(vis).filter((e) => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX !== 'auto' && getComputedStyle(e).overflowX !== 'scroll').map((e) => (e.innerText || e.className).slice(0, 24)).slice(0, 4);
    if (w < 900) out.small = [...document.querySelectorAll('main a.btn, main button, .shb, .sns-row, #lang, #snd')].filter(vis).filter((e) => { const r = e.getBoundingClientRect(); return r.height < 40 && r.width < 40 || r.height < 32; }).map((e) => (e.getAttribute('aria-label') || e.innerText || e.className).slice(0, 20)).slice(0, 5);
    const hdr = document.querySelector('header, #hdr'); out.hdrH = hdr ? hdr.getBoundingClientRect().height : 0;
    out.skipLink = !!document.querySelector('a[href^="#"].skip, a.skip-link, a[href="#main"], a[href="#content"]');
    out.anchors = [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href').slice(1)).filter((id) => id && !document.getElementById(id)).slice(0, 4);
    const eps = [...document.querySelectorAll('#eps [id^="ep-"]')]; out.epN = eps.length;
    const nums = [...document.querySelectorAll('#eps .ep-no, #eps [class*="no"]')].map((e) => e.innerText.trim()).filter((s) => /^EP\.\d+$/.test(s)); out.epDup = nums.filter((x, i) => nums.indexOf(x) !== i);
    const dates = [...document.querySelectorAll('#eps time, #eps .ep-date')].map((e) => e.innerText.trim()); out.dateBad = dates.filter((d) => !/^\d{4}\.\d{2}\.\d{2}$/.test(d) && !/soon|予定|預定|예정/i.test(d)).slice(0, 3);
    out.dateOrder = dates.filter((d) => /^\d{4}\.\d{2}\.\d{2}$/.test(d)).every((d, i, a) => i === 0 || a[i - 1] >= d);
    out.next = (document.getElementById('nextEp') || {}).textContent || '';
    out.days = (document.querySelector('.days, #days, .follow-days') || {}).innerText || '';
    out.pick = (document.querySelector('#pickup .pickup-t') || {}).textContent || '';
    out.small12 = [...document.querySelectorAll('main p, main li, main span, main a')].filter(vis).filter((e) => e.childElementCount === 0 && e.innerText.trim().length > 3 && parseFloat(getComputedStyle(e).fontSize) < 11.5).map((e) => e.innerText.trim().slice(0, 16) + ':' + getComputedStyle(e).fontSize).slice(0, 4);
    out.canon = (document.querySelector('link[rel=canonical]') || {}).href;
    out.epTitles = [...document.querySelectorAll('#eps h3')].map((e) => e.innerText.trim()).slice(0, 20);
    out.heroAlt = (document.querySelector('#heroPhone img') || {}).alt || '';
    out.imgAltJa = [...document.querySelectorAll('img[alt]')].map((i) => i.alt).filter((x) => /[\u3040-\u30ff]/.test(x)).slice(0, 3);
    return out;
  }, { lang, w });
  if (errs.length) note(21, tag + ' ' + errs[0].slice(0, 100));
  if (r.overflow > 1) note(22, tag + ' +' + r.overflow + 'px');
  if (r.bad.length) note(23, tag + ' ' + r.bad.join(','));
  if (r.h1 !== 1) note(24, tag + ' h1=' + r.h1);
  if (r.skip.length) note(25, tag + ' ' + [...new Set(r.skip)].join(' '));
  if (r.dup.length) note(26, tag + ' ' + r.dup.join(','));
  if (r.noname.length) note(27, tag + ' ' + r.noname[0]);
  const want = { ja: 'ja', en: 'en', zh: 'zh-Hant', ko: 'ko' }[lang]; if (!r.lang.startsWith(want.slice(0, 2))) note(28, tag + ' ' + r.lang);
  if (lang === 'en' && /[぀-ヿ]/.test(r.title)) note(29, tag + ' ' + r.title);
  if (lang === 'en' && r.jp && r.jp.length) note(30, tag + ' ' + r.jp.join(' / '));
  if (r.clip.length) note(31, tag + ' ' + r.clip.join(' / '));
  if (r.small && r.small.length) note(32, tag + ' ' + r.small.join(' / '));
  if (!r.skipLink) note(34, tag);
  if (r.anchors.length) note(42, tag + ' ' + r.anchors.join(','));
  if (r.epDup.length) note(36, tag + ' ' + r.epDup.join(','));
  if (r.dateBad.length) note(37, tag + ' ' + r.dateBad.join(','));
  if (!r.dateOrder) note(36, tag + ' 日付が新しい順でない');
  if (r.small12.length) note(48, tag + ' ' + r.small12.join(' / '));
  if (lang === 'en' && r.imgAltJa.length) note(45, tag + ' 画像の代替テキストが日本語 ' + r.imgAltJa.join(' / '));
  if (lang === 'en' && r.epTitles.some((s) => /[぀-ヿ]/.test(s))) note(45, tag + ' ' + r.epTitles.filter((s) => /[぀-ヿ]/.test(s)).slice(0, 3).join(' / '));
  if (lang === 'zh' && r.epTitles.some((s) => /[぀-ゟ]/.test(s))) note(45, tag + ' ' + r.epTitles.filter((s) => /[぀-ゟ]/.test(s)).slice(0, 2).join(' / '));
  if (lang === 'ko' && r.epTitles.some((s) => /[぀-ゟ]/.test(s))) note(45, tag + ' ' + r.epTitles.filter((s) => /[぀-ゟ]/.test(s)).slice(0, 2).join(' / '));
  if (/毎週|weekly/i.test(r.days)) note(39, tag + ' ' + r.days.slice(0, 40));
  // 次の新作（毎日）：今日の 12時前なら今日、それ以降は明日。最初の日 11/10 より前は 11/10
  { const now = new Date(Date.now() + (9 * 60 + new Date().getTimezoneOffset()) * 60000); const nx = new Date(now); nx.setHours(0, 0, 0, 0); if (now.getHours() >= 12) nx.setDate(nx.getDate() + 1); const md = `${nx.getMonth() + 1}/${nx.getDate()}`; if (!r.next.includes(md)) note(38, tag + ' 「' + r.next + '」 期待 ' + md); }
  // ヘッダーと本文：ページ途中までスクロールして、見出しがヘッダーの下に隠れないか（#episodes へ移動）
  { await p.evaluate(() => { const a = document.querySelector('a[href="#episodes"]'); const t = document.getElementById('episodes'); if (t) t.scrollIntoView(); }); await p.waitForTimeout(400);
    const ov = await p.evaluate(() => { const hdr = document.querySelector('#hdr, header'); const t = document.querySelector('#episodes h2, #episodes .sec-ttl'); if (!hdr || !t) return 0; const a = hdr.getBoundingClientRect(), b2 = t.getBoundingClientRect(); return getComputedStyle(hdr).position === 'fixed' && b2.top < a.bottom - 2 && b2.bottom > a.top ? Math.round(a.bottom - b2.top) : 0; });
    if (ov > 0) note(33, tag + ' 見出しがヘッダーの下に ' + ov + 'px'); }
  // フォーカスが見える（最初の数個のリンク）
  if (w >= 1024 && lang === 'ja') { await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); const fv = await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return 'none'; const s = getComputedStyle(e); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== 'none' ? 'ok' : e.outerHTML.slice(0, 60); }); if (fv !== 'ok') note(43, tag + ' ' + fv); }
  // コントラスト（主要な段落）
  if (w === 1440) { const lc = await p.evaluate(() => { const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const [r, g, b] = m.slice(0, 3).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
      const bgOf = (e) => { while (e) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c) && !(c.startsWith('rgba') && +c.match(/[\d.]+/g)[3] < .5)) return c; e = e.parentElement; } return 'rgb(244,234,216)'; };
      const bad = []; for (const e of document.querySelectorAll('main p, .sec-lead, .char-desc, .ep-cap, .day-text')) { const s = getComputedStyle(e); if (!e.innerText.trim() || s.display === 'none') continue; const a = lum(s.color), c = lum(bgOf(e)); const cr = (Math.max(a, c) + .05) / (Math.min(a, c) + .05); if (cr < 4.5) bad.push(e.innerText.trim().slice(0, 14) + ' ' + cr.toFixed(2)); } return bad.slice(0, 4); });
    if (lc.length) note(44, tag + ' ' + lc.join(' / ')); }
  // canonical/hreflang after switching (49)
  if (w === 1440 && lang === 'en') { const c = r.canon; if (!/[?&]lang=en/.test(c)) note(49, tag + ' canonical ' + c); }
  await ctx.close();
}
// 41：動きを減らす設定
{ const { p, ctx } = await open(390, 844, 'ja', { reduce: true }); await p.waitForTimeout(800); const n = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && (a.effect && a.effect.getTiming().iterations === Infinity)).map((a) => (a.effect.target && (a.effect.target.className || a.effect.target.id) || '').toString().slice(0, 30))); if (n.length) note(41, n.slice(0, 4).join(' / ')); await ctx.close(); }
// 46：言語の保存
{ const { p, ctx } = await open(1440, 900, 'ko', { q: '' }); await p.evaluate(() => { const b = document.querySelector('#langMenu button[data-lang="ko"], [data-lang="ko"]'); if (b) b.click(); }); await p.waitForTimeout(300); await p.reload(); await p.waitForTimeout(1500); const l = await p.evaluate(() => document.documentElement.lang); if (!l.startsWith('ko')) note(46, '保存されない ' + l); await ctx.close(); }
// 35：エピソード一覧が空（取得失敗）でも埋め込みの一覧が出る・画像が無くても枠がある
{ const { p, ctx } = await open(390, 844, 'ja', { noFeed: true }); const n = await p.evaluate(() => document.querySelectorAll('#eps [id^="ep-"]').length); if (n < 3) note(35, '一覧が空 ' + n); const zero = await p.evaluate(() => [...document.querySelectorAll('#eps .ep-media')].filter((e) => e.getBoundingClientRect().height < 50).length); if (zero) note(35, '枠がつぶれる ' + zero); await ctx.close(); }
// 47：ライトボックス
{ const { p, ctx } = await open(1440, 900, 'ja'); const ok = await p.evaluate(async () => { const { openLb } = window.__RJ || {}; if (typeof openLb !== 'function') return 'no openLb'; openLb('xxxxxxxxxxx', null); await new Promise((r) => setTimeout(r, 300)); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await new Promise((r) => setTimeout(r, 400)); return document.getElementById('lb').classList.contains('open') ? 'still open' : 'ok'; }); if (ok !== 'ok') note(47, ok); await ctx.close(); }
// 40：PICKUP
{ const { p, ctx } = await open(1440, 900, 'ja'); const r = await p.evaluate(() => ({ pk: document.querySelector('#pickup .pickup-t').textContent, d: __RJ.jstISO() })); if (r.d > '2026-11-07' && /入社しました|joined/.test(r.pk)) note(40, 'ポムの入社から1週間以上たっても「入社しました」：' + r.pk); await ctx.close(); }
await b.close();
const ids = Object.keys(CHECKS).map(Number).sort((a, b) => a - b);
const lines = ids.map((id) => `${fail[id] ? 'NG' : 'OK'} ${String(id).padStart(2)} ${CHECKS[id]}${fail[id] ? '\n     - ' + [...fail[id]].slice(0, 6).join('\n     - ') + (fail[id].size > 6 ? `\n     …ほか ${fail[id].size - 6}` : '') : ''}`);
const ng = ids.filter((id) => fail[id]).length;
const rep = `# 検査 ${ROUND}（${new Date().toISOString()}）\n画面 ${VIEWS.length} × 言語 ${LANGS.length} ＋ 動きを減らす・保存・取得失敗・動画 = ${VIEWS.length * LANGS.length + 4} 通り／検査項目 ${ids.length}\n合格 ${ids.length - ng}・不合格 ${ng}\n\n` + lines.join('\n') + '\n';
fs.mkdirSync(new URL('./reports/', import.meta.url), { recursive: true }); fs.writeFileSync(new URL(`./reports/${ROUND}.md`, import.meta.url), rep);
console.log(rep); process.exit(ng ? 1 : 0);
