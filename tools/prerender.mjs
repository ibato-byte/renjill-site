// 検索エンジン・JS が動かない環境のために、エピソード一覧と動画の構造化データを HTML に書き出す（index.html の EPS が元）。
// 使い方：node tools/prerender.mjs  … index.html の <!--PRE:eps--> と #ldVideos を書き換える（JS が動けば上書きされる）
import fs from 'node:fs';
import { buildPages, epUrl } from './pages.mjs';
const f = new URL('../index.html', import.meta.url); let s = fs.readFileSync(f, 'utf8'); const orig = s;
const src = s.match(/const EPS = (\[[\s\S]*?\n\]);/)[1];
const EPS = Function('return ' + src)();
// 投稿の自動化が書く episodes.json（EPISODES_JSON=ファイルのパス）があれば、埋め込みに無い回を足す（題・一言は日本語＋あれば英語）
if (process.env.EPISODES_JSON && fs.existsSync(process.env.EPISODES_JSON)) {
  const fixNames = Function(s.match(/\/\*NAMEFIX\*\/([\s\S]*?)\/\*\/NAMEFIX\*\//)[1] + '; return fixNames;')(); // 旧名の読み替え（index.html と同じ）
  const feed = JSON.parse(fixNames(fs.readFileSync(process.env.EPISODES_JSON, 'utf8'))); const known = new Set(EPS.map((e) => e.ep));
  const L = (v, k) => (v && typeof v === 'object' ? v[k] : k === 'ja' ? v : '') || '';
  for (const x of feed) if (x.ep && !known.has(x.ep)) EPS.push({ ep: x.ep, title: ['ja', 'en', 'zh', 'ko'].map((k) => L(x.title, k) || L(x.title, 'en') || L(x.title, 'ja')), cap: ['ja', 'en', 'zh', 'ko'].map((k) => L(x.caption, k) || x['caption_' + k] || L(x.caption, 'ja') || x.caption_ja || ''), cover: x.cover, video: x.video, time: x.time || '', yt: x.youtube_id || '', date: (x.date || '').slice(0, 10).replace(/-/g, '.') });
  EPS.sort((a, b) => ((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || '')));
}
const MEDIA = 'https://ibato-byte.github.io/usagi-office-media/', SITE = 'https://usagi.coana.co.jp/';
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const shown = EPS.filter((e) => e.yt && e.date && e.date.replace(/\./g, '-') <= today);
const list = shown.map((e, i) => `<article class="ep pre" id="ep-${esc(e.ep)}"><a class="ep-link" href="${epUrl(e.ep).replace(SITE, '/')}" data-yt="${esc(e.yt)}"><div class="ep-media"><span class="ep-no">EP.${String(EPS.length - EPS.indexOf(e)).padStart(2, '0')}</span>${e.cover ? `<img src="${MEDIA + esc(e.cover)}" alt="${esc(e.title[0])}" loading="lazy" decoding="async" width="1080" height="1920">` : ''}</div><div class="ep-body"><time class="ep-date" datetime="${e.date.replace(/\./g, '-')}">${esc(e.date)}</time><h3 class="ep-ttl">${esc(e.title[0])}</h3><p class="ep-cap">${esc(e.cap[0])}</p></div></a></article>`).join('');
s = s.replace(/<div class="eps" id="eps">[\s\S]*?<\/div><!--\/eps-->|<div class="eps" id="eps"><\/div>/, `<div class="eps" id="eps">${list}</div><!--/eps-->`);
// トップの構造化データは 1 話ごとのページへの一覧だけ（動画の詳しい情報は各ページ。index.html の ldVideos() と同じ形）
const ld = { '@context': 'https://schema.org', '@type': 'ItemList', '@id': SITE + '#episodes', name: '東京うさぎオフィス エピソード', itemListOrder: 'https://schema.org/ItemListOrderDescending', numberOfItems: shown.length, itemListElement: shown.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: e.title[0], url: epUrl(e.ep) })) };
s = s.replace(/(<script type="application\/ld\+json" id="ldVideos">\n)[\s\S]*?(\n<\/script>)/, (_, a, b) => a + JSON.stringify(ld) + b);
// ヒーローの縦の画面（JS が動く前・検索エンジン）も、カバーのある一番新しい回にそろえる
{ const hs = shown.filter((e) => e.cover && e.video), h = hs.filter((e) => e.date === (hs[0] || {}).date).sort((a, b) => (a.time || '').localeCompare(b.time || ''))[0]; /* その日の最初の回（2026-11-24） */ if (h) s = s.replace(/(<div class="hero-phone[^>]*>[\s\S]*?<img src=")[^"]*(" alt=")[^"]*(")/, (_, a, b, c) => a + MEDIA + h.cover + b + esc(h.title[0]) + c).replace(/(<div class="hero-phone[^>]*>[\s\S]*?<video [^>]*src=")[^"]*(")/, (_, a, b) => a + MEDIA + h.video + b).replace(/(<link rel="preload" as="image" id="heroPreload" href=")[^"]*(")/, (_, a, b) => a + MEDIA + h.cover + b); }
// 最終更新日は「中身が変わった日」だけ進める（毎日ただ今日の日付にすると、検索エンジンが日付を信用しなくなる。2026-11-22）。手で直した日は TOUCH=1 を付けて実行
const stamp = s !== orig || process.env.TOUCH ? today : (orig.match(/"dateModified":"(\d{4}-\d{2}-\d{2})"/) || [])[1] || today;
s = s.replace(/<meta property="og:updated_time" content="[^"]*">/, `<meta property="og:updated_time" content="${stamp}T00:00:00+09:00">`).replace(/"dateModified":"\d{4}-\d{2}-\d{2}"/, `"dateModified":"${stamp}"`);
fs.writeFileSync(f, s); console.log('prerender', shown.length, 'episodes');
// 1 話ごとのページ・一覧・キャラクター紹介（tools/pages.mjs）
const T = Function('return ' + s.match(/const T = (\{[\s\S]*?\n\});/)[1])();
const root = new URL('../', import.meta.url);
const pages = buildPages({ EPS, shown, T, root }); console.log('pages', pages.length);
const x = (v) => esc(v);
// sitemap.xml：最終更新日（本当に変わった日）・hreflang・画像・動画（動画は「その動画が主役のページ」＝1 話ごとのページに付ける）
{ const U = (l) => SITE + (l === 'ja' ? '' : '?lang=' + l);
  const altHome = [['ja', 'ja'], ['en', 'en'], ['zh-Hant', 'zh'], ['zh-TW', 'zh'], ['zh-HK', 'zh'], ['ko', 'ko']].map(([h, l]) => `    <xhtml:link rel="alternate" hreflang="${h}" href="${x(U(l))}"/>`).join('\n') + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}"/>`;
  const img = (u) => `    <image:image>\n      <image:loc>${x(u)}</image:loc>\n    </image:image>`;
  const local = (dir) => fs.readdirSync(new URL(dir, root)).filter((n) => /\.webp$/.test(n)).sort().map((n) => SITE + dir + n);
  const homeImgs = [SITE + 'og.jpg', ...['ren', 'jill', 'pom'].map((k) => `${SITE}img/char/${k}_happy.webp`), ...local('img/game/'), ...local('img/day/'), ...shown.filter((e) => e.cover).map((e) => MEDIA + e.cover)].map(img).join('\n');
  const vid = (v) => `    <video:video>\n      <video:thumbnail_loc>${x(v.thumb)}</video:thumbnail_loc>\n      <video:title>${x(v.title)}</video:title>\n      <video:description>${x(v.desc)}</video:description>\n${v.content ? `      <video:content_loc>${x(v.content)}</video:content_loc>\n` : ''}      <video:player_loc>${x(v.player)}</video:player_loc>\n      <video:publication_date>${v.date}</video:publication_date>\n      <video:family_friendly>yes</video:family_friendly>\n    </video:video>`;
  const urls = [
    `  <url>\n    <loc>${SITE}</loc>\n    <lastmod>${stamp}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n${altHome}\n${homeImgs}\n  </url>`,
    ...['en', 'zh', 'ko'].map((l) => `  <url>\n    <loc>${x(U(l))}</loc>\n    <lastmod>${stamp}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n${altHome}\n  </url>`),
    ...pages.map((p) => `  <url>\n    <loc>${x(p.loc)}</loc>\n    <lastmod>${p.lastmod}</lastmod>\n${p.alts.map(([h, u]) => `    <xhtml:link rel="alternate" hreflang="${h}" href="${x(u)}"/>`).join('\n')}${p.images.length ? '\n' + p.images.map(img).join('\n') : ''}${p.video ? '\n' + vid(p.video) : ''}\n  </url>`),
  ];
  const sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${urls.join('\n')}\n</urlset>\n`;
  fs.writeFileSync(new URL('sitemap.xml', root), sm); console.log('sitemap', urls.length, 'URL'); }
// feed.xml（Atom）：新作のお知らせ（RSS リーダー・検索エンジン）。記事のリンクは 1 話ごとのページ（id は読者の既読を保つため前のまま）
{ const at = (e) => e.date.replace(/\./g, '-') + 'T' + (e.time || '18:00') + ':00+09:00'; const upd = shown.length ? at(shown[0]) : today + 'T00:00:00+09:00';
  const thumb = (e) => (e.cover ? MEDIA + e.cover : `https://i.ytimg.com/vi/${e.yt}/hqdefault.jpg`);
  const entries = shown.slice(0, 30).map((e) => `  <entry>\n    <title>${x(e.title[0])}｜東京うさぎオフィス</title>\n    <link rel="alternate" href="${epUrl(e.ep)}"/>\n    <link rel="related" href="https://www.youtube.com/shorts/${x(e.yt)}"/>\n    <id>https://usagi.coana.co.jp/#ep-${x(e.ep)}</id>\n    <published>${at(e)}</published>\n    <updated>${at(e)}</updated>\n    <summary>${x(e.cap[0] || e.title[0])}</summary>\n    <content type="html">${x(`<p><a href="${epUrl(e.ep)}"><img src="${thumb(e)}" alt="${esc(e.title[0])}" width="270" height="480"></a></p><p>${esc(e.cap[0] || e.title[0])}</p><p><a href="${epUrl(e.ep)}">この回を見る</a></p>`)}</content>\n  </entry>`).join('\n');
  const feed = `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ja">\n  <title>東京うさぎオフィス（Tokyo Usagi Office）新作エピソード</title>\n  <subtitle>うさぎのオフィスコメディ。新作は毎週 月・木・土。</subtitle>\n  <link href="https://usagi.coana.co.jp/"/>\n  <link rel="self" href="https://usagi.coana.co.jp/feed.xml"/>\n  <id>https://usagi.coana.co.jp/</id>\n  <icon>https://usagi.coana.co.jp/icon-192.png</icon>\n  <logo>https://usagi.coana.co.jp/og.jpg</logo>\n  <updated>${upd}</updated>\n  <author><name>COANA TOKYO LLC.</name><uri>https://usagi.coana.co.jp/</uri></author>\n${entries}\n</feed>\n`;
  fs.writeFileSync(new URL('feed.xml', root), feed); console.log('feed', Math.min(30, shown.length), 'entries'); }
// llms.txt：AI 向けの説明にも、ページとエピソードの一覧を入れる（「## ページ」から「## 事実」の前までを書き直す）
{ const lf = new URL('llms.txt', root); let l = fs.readFileSync(lf, 'utf8');
  const no = (e) => String(EPS.length - EPS.indexOf(e)).padStart(2, '0');
  const block = `## ページ / Pages\n- [エピソード一覧 / All episodes](${SITE}episodes/)（English: ${SITE}en/episodes/）\n- [キャラクター紹介 / Characters](${SITE}characters/)（English: ${SITE}en/characters/）\n\n## エピソード / Episodes（新しい順 / newest first）\n${shown.map((e) => `- [EP.${no(e)} ${e.title[0]} / ${e.title[1]}](${epUrl(e.ep)})（${e.date.replace(/\./g, '-')}）：${e.cap[0] || ''}`).join('\n')}\n\n`;
  l = /## ページ \/ Pages[\s\S]*?(?=## 事実)/.test(l) ? l.replace(/## ページ \/ Pages[\s\S]*?(?=## 事実)/, block) : l.replace(/## 事実/, block + '## 事実');
  fs.writeFileSync(lf, l); console.log('llms.txt', shown.length, 'episodes'); }
