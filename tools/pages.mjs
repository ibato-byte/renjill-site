// 検索エンジン向けの「1 つずつのページ」を作る（2026-11-22）。tools/prerender.mjs から呼ばれる。
// - エピソード 1 話ごとのページ  /ep/<名前>/（Google は「動画が主役のページ」でないと動画として載せない）
// - エピソード一覧               /episodes/
// - キャラクター紹介             /characters/
// どれも 4 言語（日本語は / 直下、英語 /en/・繁體中文 /zh/・韓国語 /ko/）。見た目は pages.css。
// 手で書き換えない（毎日 0:30 に作り直される）。文を直すときはこのファイルの S と、index.html の T / EPS を直す。
import fs from 'node:fs';

export const SITE = 'https://usagi.coana.co.jp/';
const MEDIA = 'https://cdn.jsdelivr.net/gh/ibato-byte/renjill-media@main/';
const YT = 'https://www.youtube.com/@tokyo_usagi_office';
const SNS = [['YouTube', YT], ['Instagram', 'https://www.instagram.com/tokyo_usagi_office/'], ['TikTok', 'https://www.tiktok.com/@tokyo_usagi_office'], ['Threads', 'https://www.threads.net/@tokyo_usagi_office'], ['Facebook', 'https://www.facebook.com/1358515160686321']];
const GAME = 'https://hay-dash.coana.co.jp/';
// ひな形（このファイル・pages.css）を変えた日。ページの最終更新日は「公開日」と「この日」の新しいほう
const TEMPLATE_DATE = '2026-11-22';
const LANGS = ['ja', 'en', 'zh', 'ko'];
const HTML_LANG = ['ja', 'en', 'zh-Hant', 'ko'];
const OG_LOCALE = ['ja_JP', 'en_US', 'zh_TW', 'ko_KR'];
const PRE = ['', 'en/', 'zh/', 'ko/'];
const LANG_NAME = ['日本語', 'English', '繁體中文', '한국어'];
const home = (L) => SITE + (L ? '?lang=' + LANGS[L] : '');
// URL に使う名前。内部の名前（旧名を含むもの）は、新しい名前に読み替える
const SLUG = { pom_debut: 'kuri-debut', jil_morning2: 'yuzu-morning' };
export const slugOf = (ep) => (SLUG[ep] || ep).replace(/_/g, '-');
export const epUrl = (ep, L = 0) => `${SITE}${PRE[L]}ep/${slugOf(ep)}/`;
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ld = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

const S = {
  brand: ['東京うさぎオフィス', 'Tokyo Usagi Office', 'Tokyo Usagi Office', '도쿄 토끼 오피스'],
  home: ['ホーム', 'Home', '首頁', '홈'],
  eps: ['エピソード', 'Episodes', '影片', '에피소드'],
  chars: ['キャラクター', 'Characters', '角色', '캐릭터'],
  game: ['ゲーム', 'Game', '遊戲', '게임'],
  watchYT: ['YouTubeで見る', 'Watch on YouTube', '在 YouTube 觀看', 'YouTube에서 보기'],
  sub: ['チャンネル登録', 'Subscribe', '訂閱頻道', '채널 구독'],
  prev: ['前の回', 'Previous', '上一集', '이전 화'],
  next: ['次の回', 'Next', '下一集', '다음 화'],
  more: ['ほかのエピソード', 'More episodes', '其他影片', '다른 에피소드'],
  all: ['エピソード一覧を見る', 'See all episodes', '看全部影片', '전체 에피소드 보기'],
  play: ['「{t}」を再生', 'Play “{t}”', '播放「{t}」', '「{t}」 재생'],
  cover: ['「{t}」のサムネイル', 'Thumbnail of “{t}”', '「{t}」的縮圖', '「{t}」 썸네일'],
  follow: ['フォローする', 'Follow', '追蹤', '팔로우'],
  lang: ['言語', 'Language', '語言', '언어'],
  crumb: ['現在の場所', 'Breadcrumb', '目前位置', '현재 위치'],
  tagline: [
    'うさぎの課長モチと、しっかり者の部下ユズ、新人ハムスターのクリのオフィスコメディ・ショートアニメ。新作は毎週 月・木・土の 18:00（日本時間）。',
    'An office-comedy short animation starring Mochi the rabbit boss, Yuzu his capable assistant, and Kuri the rookie hamster. New episodes every Monday, Thursday and Saturday at 18:00 JST.',
    '兔子課長 Mochi、可靠的部下 Yuzu 和新人倉鼠 Kuri 的辦公室喜劇短篇動畫。新作每週一、四、六 18:00（日本時間）。',
    '토끼 과장 모찌, 든든한 부하 유자, 신입 햄스터 쿠리의 오피스 코미디 숏 애니메이션. 신작은 매주 월·목·토 18:00(일본 시간).'],
  gameCta: ['無料ゲーム「チモシーダッシュ」で遊ぶ', 'Play the free game “Hay Dash”', '玩免費遊戲「Hay Dash」', '무료 게임 「Hay Dash」 플레이'],
  epTitle: ['{t}｜東京うさぎオフィス EP.{n}（うさぎのショートアニメ）', '{t} — Tokyo Usagi Office EP.{n} (bunny office comedy short)', '{t}｜Tokyo Usagi Office EP.{n}（兔子辦公室短篇動畫）', '{t} | 도쿄 토끼 오피스 EP.{n} (토끼 오피스 숏 애니메이션)'],
  epDesc: [
    '{c} 東京うさぎオフィス EP.{n}「{t}」（{d}公開）。うさぎの課長モチと部下ユズのオフィスコメディ・ショートアニメ。',
    '{c} Tokyo Usagi Office EP.{n} “{t}” ({d}). A bunny office-comedy short animation with Mochi the boss and Yuzu.',
    '{c} Tokyo Usagi Office EP.{n}「{t}」（{d}公開）。兔子課長 Mochi 和部下 Yuzu 的辦公室喜劇短篇動畫。',
    '{c} 도쿄 토끼 오피스 EP.{n} 「{t}」 ({d} 공개). 토끼 과장 모찌와 부하 유자의 오피스 코미디 숏 애니메이션.'],
  listTitle: ['エピソード一覧（全{n}話）｜東京うさぎオフィス うさぎのショートアニメ', 'All {n} episodes — Tokyo Usagi Office, the bunny office comedy shorts', '全部影片（共{n}集）｜Tokyo Usagi Office 兔子辦公室短篇動畫', '전체 에피소드 ({n}화) | 도쿄 토끼 오피스 토끼 숏 애니메이션'],
  listH1: ['エピソード一覧', 'All episodes', '全部影片', '전체 에피소드'],
  listDesc: [
    '東京うさぎオフィスの全{n}話を、新しい順にまとめた一覧です。最新回は「{t}」。うさぎの課長モチと部下ユズ、新人ハムスターのクリのショートアニメを、1話ずつ見られます。',
    'Every Tokyo Usagi Office episode ({n} so far), newest first. Latest: “{t}”. Watch each bunny office-comedy short with Mochi, Yuzu and Kuri.',
    'Tokyo Usagi Office 全部{n}集，由新到舊。最新一集是「{t}」。兔子課長 Mochi、部下 Yuzu 和新人倉鼠 Kuri 的短篇動畫，可以一集一集看。',
    '도쿄 토끼 오피스의 모든 에피소드({n}화)를 최신순으로 모았습니다. 최신 화는 「{t}」. 모찌, 유자, 쿠리의 숏 애니메이션을 한 편씩 볼 수 있어요.'],
  charTitle: ['キャラクター紹介｜課長モチ・部下ユズ・新人クリ｜東京うさぎオフィス', 'Characters — Mochi, Yuzu and Kuri | Tokyo Usagi Office', '角色介紹｜課長 Mochi・部下 Yuzu・新人 Kuri｜Tokyo Usagi Office', '캐릭터 소개 | 과장 모찌·부하 유자·신입 쿠리 | 도쿄 토끼 오피스'],
  charH1: ['キャラクター紹介', 'Characters', '角色介紹', '캐릭터 소개'],
  charDesc: [
    '東京うさぎオフィスのキャラクター紹介。たれ耳のうさぎの課長モチ（ホーランドロップ）、しっかり者の部下ユズ（ネザーランドドワーフ）、新人ハムスターのクリ（ゴールデンハムスター）のプロフィールと関係。',
    'Meet the Tokyo Usagi Office cast: Mochi the floppy-eared boss (Holland Lop), Yuzu his capable assistant (Netherland Dwarf) and Kuri the rookie (golden hamster) — profiles and how they get along.',
    'Tokyo Usagi Office 的角色介紹：垂耳兔課長 Mochi（荷蘭垂耳兔）、可靠的部下 Yuzu（荷蘭侏儒兔）、新人倉鼠 Kuri（黃金倉鼠）的個人資料與關係。',
    '도쿄 토끼 오피스의 캐릭터 소개. 귀가 처진 과장 모찌(홀랜드 롭), 든든한 부하 유자(네덜란드 드워프), 신입 쿠리(골든 햄스터)의 프로필과 관계.'],
  charAlt: ['{n}のイラスト（{b}）', 'Illustration of {n} ({b})', '{n}的插圖（{b}）', '{n} 일러스트 ({b})'],
  debutWatch: ['初登場の回を見る', 'Watch the debut episode', '看初登場的那一集', '첫 등장 화 보기'],
  rel: ['みんなの関係', 'How they get along', '大家的關係', '모두의 관계'],
  appears: ['登場キャラクター', 'Characters', '登場角色', '등장 캐릭터'],
};
const s = (k, L, v = {}) => S[k][L].replace(/\{(\w)\}/g, (_, x) => v[x] ?? '');
const dateText = (d, L) => { const [y, m, dd] = d.split('.').map(Number); return [`${y}年${m}月${dd}日`, `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${dd}, ${y}`, `${y}年${m}月${dd}日`, `${y}년 ${m}월 ${dd}일`][L]; };
const iso = (d) => d.replace(/\./g, '-');
const later = (a, b) => (a > b ? a : b);

// 4 言語が互いを指す hreflang（x-default はトップと同じく日本語）
const altsOf = (path) => [...LANGS.map((_, L) => [HTML_LANG[L], SITE + PRE[L] + path]), ['x-default', SITE + path]];

function shell({ L, path, title, desc, image, imageW, imageH, imageAlt, ogType = 'website', crumbs, body, graph, extraHead = '' }) {
  const url = SITE + PRE[L] + path;
  const alts = altsOf(path);
  const nav = [[home(L), s('home', L)], [`${SITE}${PRE[L]}episodes/`, s('eps', L)], [`${SITE}${PRE[L]}characters/`, s('chars', L)], [GAME, s('game', L)]];
  const bc = [[home(L), S.brand[L]], ...crumbs];
  const graphAll = [
    { '@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: bc.map(([u, n], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: u })) },
    ...graph,
  ];
  return `<!doctype html>
<html lang="${HTML_LANG[L]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta name="theme-color" content="#F4EAD8">
<meta name="author" content="COANA TOKYO LLC.">
<meta name="format-detection" content="telephone=no">
<link rel="canonical" href="${url}">
${alts.map(([h, u]) => `<link rel="alternate" hreflang="${h}" href="${u}">`).join('\n')}
<link rel="alternate" type="application/atom+xml" title="${esc(S.brand[0])} 新作エピソード" href="${SITE}feed.xml">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:site_name" content="${esc(S.brand[0])}">
<meta property="og:type" content="${ogType}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="${OG_LOCALE[L]}">
${OG_LOCALE.filter((_, i) => i !== L).map((o) => `<meta property="og:locale:alternate" content="${o}">`).join('\n')}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="${imageW}">
<meta property="og:image:height" content="${imageH}">
<meta property="og:image:alt" content="${esc(imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta name="twitter:image:alt" content="${esc(imageAlt)}">
${extraHead}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;700&family=Zen+Maru+Gothic:wght@700;900&display=swap">
<link rel="stylesheet" href="/pages.css">
<script type="application/ld+json">${ld({ '@context': 'https://schema.org', '@graph': graphAll })}</script>
</head>
<body>
<a class="skip" href="#main">${['本文へ', 'Skip to content', '跳到內容', '본문으로'][L]}</a>
<header class="p-hdr">
  <a class="p-logo" href="${home(L)}" translate="no"><img src="/icon-192.png" width="40" height="40" alt="">TOKYO USAGI OFFICE</a>
  <nav class="p-nav" aria-label="${esc(S.brand[L])}">${nav.map(([u, n]) => `<a href="${u}"${u === url ? ' aria-current="page"' : ''}>${esc(n)}</a>`).join('')}</nav>
</header>
<main id="main">
<nav class="p-crumb" aria-label="${s('crumb', L)}"><ol>${bc.map(([u, n], i) => (i === bc.length - 1 ? `<li aria-current="page">${esc(n)}</li>` : `<li><a href="${u}">${esc(n)}</a></li>`)).join('')}</ol></nav>
${body}
</main>
<footer class="p-ftr">
  <p class="p-tag">${esc(S.tagline[L])}</p>
  <nav aria-label="${s('follow', L)}"><ul class="p-sns">${SNS.map(([n, u]) => `<li><a href="${u}" target="_blank" rel="noopener me">${n}</a></li>`).join('')}<li><a href="${GAME}" target="_blank" rel="noopener">${esc(S.gameCta[L])}</a></li></ul></nav>
  <nav aria-label="${s('lang', L)}"><ul class="p-lang">${LANGS.map((_, i) => `<li><a href="${SITE + PRE[i] + path}" hreflang="${HTML_LANG[i]}" lang="${HTML_LANG[i]}"${i === L ? ' aria-current="true"' : ''}>${LANG_NAME[i]}</a></li>`).join('')}</ul></nav>
  <small>© <a href="https://coana.co.jp/" target="_blank" rel="noopener">COANA TOKYO LLC.</a> · <a href="${home(L)}" translate="no">TOKYO USAGI OFFICE</a></small>
</footer>
</body>
</html>
`;
}

const thumbOf = (e) => (e.cover ? MEDIA + e.cover : `https://i.ytimg.com/vi/${e.yt}/oardefault.jpg`);
const card = (e, n, L) => `<li><a class="p-card" href="${epUrl(e.ep, L)}"><img src="${esc(thumbOf(e))}" alt="${esc(s('cover', L, { t: e.title[L] }))}" width="1080" height="1920" loading="lazy" decoding="async"><span class="p-no">EP.${n}</span><b>${esc(e.title[L])}</b><time datetime="${iso(e.date)}">${e.date}</time></a></li>`;

export function buildPages({ EPS, shown, T, root }) {
  const out = []; // sitemap に載せる情報
  const write = (rel, html) => { const f = new URL(rel + 'index.html', root); fs.mkdirSync(new URL('.', f), { recursive: true }); fs.writeFileSync(f, html); };
  const no = (e) => String(EPS.length - EPS.indexOf(e)).padStart(2, '0');
  const seriesRef = { '@id': SITE + '#series' }, orgRef = { '@id': SITE + '#org' };
  const tt = (k, L) => (T[k] ? T[k][L] || T[k][0] : '');

  // ---- 1 話ごとのページ
  shown.forEach((e, i) => {
    const n = no(e), path = `ep/${slugOf(e.ep)}/`, newer = shown[i - 1], older = shown[i + 1];
    const others = shown.filter((x) => x !== e).slice(Math.max(0, Math.min(i - 3, shown.length - 7)), Math.max(0, Math.min(i - 3, shown.length - 7)) + 6);
    const poster = thumbOf(e), ldThumb = e.cover ? [MEDIA + e.cover, `https://i.ytimg.com/vi/${e.yt}/hqdefault.jpg`] : [`https://i.ytimg.com/vi/${e.yt}/hqdefault.jpg`];
    LANGS.forEach((_, L) => {
      const t = e.title[L] || e.title[0], c = e.cap[L] || e.cap[0] || '', url = SITE + PRE[L] + path;
      const title = s('epTitle', L, { t, n }), desc = s('epDesc', L, { c, t, n, d: dateText(e.date, L) }).trim();
      const video = {
        '@type': 'VideoObject', '@id': url + '#video', name: `${t}｜${S.brand[L]} EP.${n}`, description: c || t, thumbnailUrl: ldThumb,
        uploadDate: iso(e.date) + 'T18:00:00+09:00', embedUrl: `https://www.youtube.com/embed/${e.yt}`, ...(e.video ? { contentUrl: MEDIA + e.video } : {}),
        url, isFamilyFriendly: true, isPartOf: seriesRef, publisher: orgRef, creator: orgRef, sameAs: `https://www.youtube.com/shorts/${e.yt}`,
        potentialAction: { '@type': 'WatchAction', target: url },
      };
      const page = { '@type': 'WebPage', '@id': url + '#page', url, name: title, description: desc, inLanguage: HTML_LANG[L], isPartOf: { '@id': SITE + '#site' }, about: seriesRef, mainEntity: { '@id': url + '#video' }, breadcrumb: { '@id': url + '#breadcrumb' }, primaryImageOfPage: { '@type': 'ImageObject', url: ldThumb[0] }, datePublished: iso(e.date), dateModified: later(iso(e.date), TEMPLATE_DATE) };
      const body = `<article class="p-ep">
  <div class="p-player" id="player" data-yt="${esc(e.yt)}">
    <a href="https://www.youtube.com/shorts/${esc(e.yt)}" target="_blank" rel="noopener" aria-label="${esc(s('play', L, { t }))}"><img src="${esc(poster)}" alt="${esc(s('cover', L, { t }))}" width="1080" height="1920" fetchpriority="high" decoding="async"><span class="p-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="34" height="34"><path d="M6 4l14 8-14 8Z" fill="currentColor"/></svg></span></a>
  </div>
  <div class="p-info">
    <p class="p-meta"><span class="p-no">EP.${n}</span> <time datetime="${iso(e.date)}">${esc(dateText(e.date, L))}</time></p>
    <h1>${esc(t)}</h1>
    <p class="p-cap">${esc(c)}</p>
    <p class="p-series">${esc(S.tagline[L])}</p>
    <p class="p-btns"><a class="p-btn main" href="https://www.youtube.com/shorts/${esc(e.yt)}" target="_blank" rel="noopener">${s('watchYT', L)}</a><a class="p-btn" href="${YT}?sub_confirmation=1" target="_blank" rel="noopener">${s('sub', L)}</a></p>
    <p class="p-who">${s('appears', L)}：<a href="${SITE}${PRE[L]}characters/">${['モチ・ユズ・クリ', 'Mochi, Yuzu and Kuri', 'Mochi・Yuzu・Kuri', '모찌·유자·쿠리'][L]}</a></p>
    <nav class="p-pn" aria-label="${s('eps', L)}">${older ? `<a rel="prev" href="${epUrl(older.ep, L)}"><span>← ${s('prev', L)}</span>${esc(older.title[L])}</a>` : '<span></span>'}${newer ? `<a rel="next" href="${epUrl(newer.ep, L)}"><span>${s('next', L)} →</span>${esc(newer.title[L])}</a>` : '<span></span>'}</nav>
  </div>
</article>
<section class="p-more"><h2>${s('more', L)}</h2><ul class="p-grid">${others.map((x) => card(x, no(x), L)).join('')}</ul><p class="p-btns"><a class="p-btn" href="${SITE}${PRE[L]}episodes/">${s('all', L)}</a><a class="p-btn" href="${GAME}" target="_blank" rel="noopener">${esc(S.gameCta[L])}</a></p></section>
<script>(function(){var p=document.getElementById("player"),a=p&&p.querySelector("a");if(!a)return;a.addEventListener("click",function(ev){if(ev.metaKey||ev.ctrlKey||ev.shiftKey)return;ev.preventDefault();p.innerHTML='<iframe src="https://www.youtube-nocookie.com/embed/'+p.dataset.yt+'?autoplay=1&playsinline=1&rel=0" title="'+a.getAttribute("aria-label").replace(/"/g,"&quot;")+'" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';});})();</script>`;
      write(PRE[L] + path, shell({ L, path, title, desc, image: e.cover ? MEDIA + e.cover : `https://i.ytimg.com/vi/${e.yt}/hqdefault.jpg`, imageW: e.cover ? 1080 : 480, imageH: e.cover ? 1920 : 360, imageAlt: s('cover', L, { t }), ogType: 'video.other', crumbs: [[`${SITE}${PRE[L]}episodes/`, s('eps', L)], [url, t]], body, graph: [page, video], extraHead: `<link rel="preload" as="image" href="${esc(poster)}" fetchpriority="high">\n<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>\n<meta property="og:video" content="https://www.youtube.com/embed/${esc(e.yt)}">\n<meta property="og:video:type" content="text/html">\n<meta property="og:video:width" content="1080">\n<meta property="og:video:height" content="1920">\n` }));
      out.push({ loc: url, lastmod: later(iso(e.date), TEMPLATE_DATE), alts: altsOf(path), images: [ldThumb[0]], video: { thumb: ldThumb[0], title: `${t}｜${S.brand[L]}`, desc: c || t, player: `https://www.youtube.com/embed/${e.yt}`, content: e.video ? MEDIA + e.video : '', date: iso(e.date) + 'T18:00:00+09:00' } });
    });
  });

  // ---- エピソード一覧
  { const path = 'episodes/', last = shown.length ? iso(shown[0].date) : TEMPLATE_DATE;
    LANGS.forEach((_, L) => {
      const url = SITE + PRE[L] + path, title = s('listTitle', L, { n: shown.length }), desc = s('listDesc', L, { n: shown.length, t: shown[0] ? shown[0].title[L] : '' });
      const graph = [{ '@type': 'CollectionPage', '@id': url + '#page', url, name: title, description: desc, inLanguage: HTML_LANG[L], isPartOf: { '@id': SITE + '#site' }, about: seriesRef, breadcrumb: { '@id': url + '#breadcrumb' }, dateModified: later(last, TEMPLATE_DATE), mainEntity: { '@id': url + '#list' } },
        { '@type': 'ItemList', '@id': url + '#list', name: s('listH1', L), numberOfItems: shown.length, itemListOrder: 'https://schema.org/ItemListOrderDescending', itemListElement: shown.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: e.title[L], url: epUrl(e.ep, L) })) }];
      const body = `<section class="p-list"><h1>${s('listH1', L)}</h1><p class="p-lead">${esc(desc)}</p><ul class="p-grid wide">${shown.map((e) => `<li><a class="p-card" href="${epUrl(e.ep, L)}"><img src="${esc(thumbOf(e))}" alt="${esc(s('cover', L, { t: e.title[L] }))}" width="1080" height="1920" loading="lazy" decoding="async"><span class="p-no">EP.${no(e)}</span><b>${esc(e.title[L])}</b><time datetime="${iso(e.date)}">${e.date}</time><span class="p-cc">${esc(e.cap[L] || '')}</span></a></li>`).join('')}</ul><p class="p-btns"><a class="p-btn main" href="${YT}?sub_confirmation=1" target="_blank" rel="noopener">${s('sub', L)}</a><a class="p-btn" href="${SITE}${PRE[L]}characters/">${s('charH1', L)}</a></p></section>`;
      write(PRE[L] + path, shell({ L, path, title, desc, image: SITE + 'og.jpg', imageW: 1200, imageH: 630, imageAlt: S.brand[L], crumbs: [[url, s('eps', L)]], body, graph }));
      out.push({ loc: url, lastmod: later(last, TEMPLATE_DATE), alts: altsOf(path), images: [] });
    });
  }

  // ---- キャラクター紹介（文は index.html の T と同じもの）
  { const path = 'characters/';
    const CH = [['ren', 'MOCHI', 'mochi', 'hanko'], ['jill', 'YUZU', 'yuzu', 'hanko'], ['pom', 'KURI', 'kuri', 'pom_debut']];
    LANGS.forEach((_, L) => {
      const url = SITE + PRE[L] + path, title = S.charTitle[L], desc = S.charDesc[L];
      const secs = CH.map(([k, en, id, debut]) => { const name = tt(`ch.${k}.name`, L), breed = tt(`ch.${k}.breed`, L), d = shown.find((e) => e.ep === debut);
        return `<section class="p-char" id="${id}"><img src="/img/char/${k}_happy.webp" alt="${esc(s('charAlt', L, { n: name, b: breed }))}" width="600" height="600" loading="${k === 'ren' ? 'eager' : 'lazy'}" decoding="async"><div><p class="p-en" translate="no">${en}</p><h2>${esc(name)}</h2><p class="p-cap">${esc(tt(`ch.${k}.text`, L))}</p><dl><dt>${esc(tt('ch.d.role', L))}</dt><dd>${esc(tt(`ch.${k}.role`, L))}</dd><dt>${esc(tt('ch.d.breed', L))}</dt><dd>${esc(breed)}</dd><dt>${esc(tt('ch.d.like', L))}</dt><dd>${esc(tt(`ch.${k}.like`, L))}</dd><dt>${esc(tt('ch.d.debut', L))}</dt><dd>${esc(tt(`ch.${k}.debut`, L))}</dd></dl><ul class="p-tags">${[1, 2, 3].map((x) => tt(`ch.${k}.t${x}`, L)).filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${d ? `<p class="p-btns"><a class="p-btn" href="${epUrl(d.ep, L)}">${s('debutWatch', L)}</a></p>` : ''}</div></section>`; }).join('\n');
      const rel = [1, 2, 3, 4].map((x) => tt(`rel.${x}.d`, L)).filter(Boolean);
      const body = `<section class="p-list"><h1>${s('charH1', L)}</h1><p class="p-lead">${esc(desc)}</p></section>\n${secs}\n${rel.length ? `<section class="p-more"><h2>${s('rel', L)}</h2><ul class="p-rel">${rel.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p class="p-btns"><a class="p-btn main" href="${SITE}${PRE[L]}episodes/">${s('all', L)}</a><a class="p-btn" href="${GAME}" target="_blank" rel="noopener">${esc(S.gameCta[L])}</a></p></section>` : ''}`;
      const graph = [{ '@type': 'WebPage', '@id': url + '#page', url, name: title, description: desc, inLanguage: HTML_LANG[L], isPartOf: { '@id': SITE + '#site' }, about: seriesRef, breadcrumb: { '@id': url + '#breadcrumb' }, dateModified: TEMPLATE_DATE, primaryImageOfPage: { '@type': 'ImageObject', url: SITE + 'og.jpg', width: 1200, height: 630 } }];
      write(PRE[L] + path, shell({ L, path, title, desc, image: SITE + 'og.jpg', imageW: 1200, imageH: 630, imageAlt: S.brand[L], crumbs: [[url, s('chars', L)]], body, graph, extraHead: '<link rel="preload" as="image" href="/img/char/ren_happy.webp" fetchpriority="high">\n' }));
      out.push({ loc: url, lastmod: TEMPLATE_DATE, alts: altsOf(path), images: CH.map(([k]) => `${SITE}img/char/${k}_happy.webp`) });
    });
  }
  return out;
}
