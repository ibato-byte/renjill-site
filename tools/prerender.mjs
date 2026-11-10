// 検索エンジン・JS が動かない環境のために、エピソード一覧と動画の構造化データを HTML に書き出す（index.html の EPS が元）。
// 使い方：node tools/prerender.mjs  … index.html の <!--PRE:eps--> と #ldVideos を書き換える（JS が動けば上書きされる）
import fs from 'node:fs';
const f = new URL('../index.html', import.meta.url); let s = fs.readFileSync(f, 'utf8');
const src = s.match(/const EPS = (\[[\s\S]*?\n\]);/)[1];
const EPS = Function('return ' + src)();
// 投稿の自動化が書く episodes.json（EPISODES_JSON=ファイルのパス）があれば、埋め込みに無い回を足す（題・一言は日本語＋あれば英語）
if (process.env.EPISODES_JSON && fs.existsSync(process.env.EPISODES_JSON)) {
  const feed = JSON.parse(fs.readFileSync(process.env.EPISODES_JSON, 'utf8')); const known = new Set(EPS.map((e) => e.ep));
  const L = (v, k) => (v && typeof v === 'object' ? v[k] : k === 'ja' ? v : '') || '';
  for (const x of feed) if (x.ep && !known.has(x.ep)) EPS.push({ ep: x.ep, title: ['ja', 'en', 'zh', 'ko'].map((k) => L(x.title, k) || L(x.title, 'en') || L(x.title, 'ja')), cap: ['ja', 'en', 'zh', 'ko'].map((k) => L(x.caption, k) || x['caption_' + k] || L(x.caption, 'ja') || x.caption_ja || ''), cover: x.cover, video: x.video, yt: x.youtube_id || '', date: (x.date || '').slice(0, 10).replace(/-/g, '.') });
  EPS.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
const MEDIA = 'https://cdn.jsdelivr.net/gh/ibato-byte/renjill-media@main/', SITE = 'https://renjill.coana.co.jp/';
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const shown = EPS.filter((e) => e.yt && e.date && e.date.replace(/\./g, '-') <= today);
const list = shown.map((e, i) => `<article class="ep pre" id="ep-${esc(e.ep)}"><a class="ep-link" href="https://www.youtube.com/shorts/${esc(e.yt)}" target="_blank" rel="noopener"><div class="ep-media"><span class="ep-no">EP.${String(EPS.length - EPS.indexOf(e)).padStart(2, '0')}</span>${e.cover ? `<img src="${MEDIA + esc(e.cover)}" alt="${esc(e.title[0])}" loading="lazy" decoding="async" width="1080" height="1920">` : ''}</div><div class="ep-body"><span class="ep-date">${esc(e.date)}</span><h3 class="ep-ttl">${esc(e.title[0])}</h3><p class="ep-cap">${esc(e.cap[0])}</p></div></a></article>`).join('');
s = s.replace(/<div class="eps" id="eps">[\s\S]*?<\/div><!--\/eps-->|<div class="eps" id="eps"><\/div>/, `<div class="eps" id="eps">${list}</div><!--/eps-->`);
const ld = { '@context': 'https://schema.org', '@type': 'ItemList', name: 'レンとジル エピソード', itemListElement: shown.map((e, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'VideoObject', '@id': SITE + '#ep-' + e.ep, name: `${e.title[0]}｜レンとジル`, alternateName: e.title[1], description: e.cap[0] || e.title[0], thumbnailUrl: [e.cover ? MEDIA + e.cover : '', `https://i.ytimg.com/vi/${e.yt}/hqdefault.jpg`].filter(Boolean), uploadDate: e.date.replace(/\./g, '-'), embedUrl: `https://www.youtube.com/embed/${e.yt}`, contentUrl: e.video ? MEDIA + e.video : undefined, url: `https://www.youtube.com/shorts/${e.yt}`, inLanguage: 'zxx', isFamilyFriendly: true, isPartOf: { '@id': SITE + '#series' }, publisher: { '@id': SITE + '#org' } } })) };
s = s.replace(/(<script type="application\/ld\+json" id="ldVideos">\n)[\s\S]*?(\n<\/script>)/, (_, a, b) => a + JSON.stringify(ld) + b);
// ヒーローの縦の画面（JS が動く前・検索エンジン）も、カバーのある一番新しい回にそろえる
{ const h = shown.find((e) => e.cover && e.video); if (h) s = s.replace(/(<div class="hero-phone[^>]*>[\s\S]*?<img src=")[^"]*(" alt=")[^"]*(")/, (_, a, b, c) => a + MEDIA + h.cover + b + esc(h.title[0]) + c).replace(/(<div class="hero-phone[^>]*>[\s\S]*?<video [^>]*src=")[^"]*(")/, (_, a, b) => a + MEDIA + h.video + b); }
s = s.replace(/<meta property="og:updated_time" content="[^"]*">/, `<meta property="og:updated_time" content="${today}T00:00:00+09:00">`).replace(/"dateModified":"\d{4}-\d{2}-\d{2}"/, `"dateModified":"${today}"`);
fs.writeFileSync(f, s); console.log('prerender', shown.length, 'episodes');
// sitemap.xml：最終更新日・毎日の更新・hreflang・画像（カバー）・動画（YouTube の埋め込み）
{ const x = (v) => esc(v);
  const vids = shown.map((e) => `    <video:video>\n      <video:thumbnail_loc>${x(e.cover ? MEDIA + e.cover : `https://i.ytimg.com/vi/${e.yt}/hqdefault.jpg`)}</video:thumbnail_loc>\n      <video:title>${x(e.title[0] + '｜レンとジル')}</video:title>\n      <video:description>${x(e.cap[0] || e.title[0])}</video:description>\n      <video:player_loc>https://www.youtube.com/embed/${x(e.yt)}</video:player_loc>\n      <video:publication_date>${e.date.replace(/\./g, '-')}</video:publication_date>\n      <video:family_friendly>yes</video:family_friendly>\n    </video:video>`).join('\n');
  const imgs = ['https://renjill.coana.co.jp/og.jpg', ...shown.filter((e) => e.cover).map((e) => MEDIA + e.cover)].map((u) => `    <image:image>\n      <image:loc>${x(u)}</image:loc>\n    </image:image>`).join('\n');
  const alt = [['ja', 'ja'], ['en', 'en'], ['zh-Hant', 'zh'], ['zh-TW', 'zh'], ['zh-HK', 'zh'], ['ko', 'ko']].map(([h, l]) => `    <xhtml:link rel="alternate" hreflang="${h}" href="https://renjill.coana.co.jp/?lang=${l}"/>`).join('\n') + '\n    <xhtml:link rel="alternate" hreflang="x-default" href="https://renjill.coana.co.jp/"/>';
  const sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n  <url>\n    <loc>https://renjill.coana.co.jp/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n${alt}\n${imgs}\n${vids}\n  </url>\n</urlset>\n`;
  fs.writeFileSync(new URL('../sitemap.xml', import.meta.url), sm); console.log('sitemap', shown.length, 'videos'); }
// feed.xml（Atom）：新作のお知らせ（RSS リーダー・検索エンジン）
{ const x = (v) => esc(v); const upd = shown.length ? shown[0].date.replace(/\./g, '-') + 'T00:00:00+09:00' : today + 'T00:00:00+09:00';
  const entries = shown.slice(0, 30).map((e) => `  <entry>\n    <title>${x(e.title[0])}｜レンとジル</title>\n    <link href="https://www.youtube.com/shorts/${x(e.yt)}"/>\n    <id>https://renjill.coana.co.jp/#ep-${x(e.ep)}</id>\n    <updated>${e.date.replace(/\./g, '-')}T00:00:00+09:00</updated>\n    <summary>${x(e.cap[0] || e.title[0])}</summary>\n  </entry>`).join('\n');
  const feed = `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ja">\n  <title>レンとジル（Ren &amp; Jill）新作エピソード</title>\n  <subtitle>セリフのない、うさぎのオフィスコメディ。新作は毎日。</subtitle>\n  <link href="https://renjill.coana.co.jp/"/>\n  <link rel="self" href="https://renjill.coana.co.jp/feed.xml"/>\n  <id>https://renjill.coana.co.jp/</id>\n  <updated>${upd}</updated>\n  <author><name>COANA TOKYO LLC.</name></author>\n${entries}\n</feed>\n`;
  fs.writeFileSync(new URL('../feed.xml', import.meta.url), feed); console.log('feed', Math.min(30, shown.length), 'entries'); }
