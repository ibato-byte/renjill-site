// 東京うさぎオフィス 公式サイトの検査（62項目）。使い方：python3 -m http.server 8765 & node qa/check.mjs [round名]
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
def(8, 'sitemap.xml・feed.xml が正しく、このサイトの URL だけ'); def(9, 'robots.txt に sitemap'); def(10, 'site.webmanifest が正しい JSON（name・icons）');
def(11, 'llms.txt があり、サイトと同じ事実（毎週 月・木・土・秒数）'); def(12, '404.html がある・noindex'); def(13, 'SNS の URL が全部の場所で同じ');
def(14, '文言 T：全部のキーに4言語'); def(15, 'data-t のキーが T にあり、HTML の初めの文と食い違わない'); def(16, 'エピソード EPS：4言語の題・一言');
def(17, '事実の矛盾がない（秒数・投稿の頻度・イベント期間・TikTok が早い等の言い過ぎ）'); def(18, 'http: の読み込みがない'); def(19, 'img に alt / width・height');
def(20, '外部リンク target=_blank に rel=noopener');
// ---- 画面ごと
def(21, 'JS エラーがない'); def(22, '横スクロールが出ない'); def(23, '画面に undefined / NaN / null / {t} が出ない'); def(24, 'h1 が1つ');
def(25, '見出しの順序が飛ばない（h2→h4 など）'); def(26, '同じ id が2つない'); def(27, 'ボタン・リンクに名前がある'); def(28, 'html の lang が言語と一致');
def(29, 'title が言語に合わせて変わる'); def(30, '言語の切り替えで未翻訳の日本語が残らない（英語ページ）'); def(31, 'ボタン・タグの文字がはみ出さない');
def(32, 'スマホでタップ領域が小さすぎない（主要ボタン 40px 以上）'); def(33, 'ヘッダーと本文が重ならない'); def(34, '本文へスキップ リンク');
def(35, '画像が読めないときも枠が崩れない'); def(36, 'エピソードの番号が重複しない・新しい順'); def(37, '日付の書式がそろっている'); def(38, '次の新作の日付が正しい（毎週 月・木・土。月・木 18:00、土 12:00）');
def(39, '曜日の帯が「毎週 月・木・土」と合う（どこにも「毎日」と書かない）'); def(40, 'PICKUP が最新回 or 告知期間に合う'); def(41, '動きを減らす設定でアニメーションが止まる'); def(42, 'ページ内リンク #id の行き先がある');
def(43, 'キーボードのフォーカスが見える'); def(44, '文字のコントラスト（主要な文 4.5:1 以上）'); def(45, 'エピソード一覧の題がその言語で出る'); def(46, '言語の保存と ?lang= が効く');
def(47, '動画の窓：Esc で閉じる・前後の回へ移動／もっと見るで全部出る'); def(48, '本文の文字が小さすぎない（12px 以上）'); def(49, 'canonical/hreflang が言語の切り替え後も正しい'); def(50, 'ページの重さ（HTML 400KB 以下）');
def(51, 'キャラクターの絵がアニメ・ゲームと同じ絵で、3 人とも読み込めている（平たい線画に戻っていない）');
def(52, 'ゲームの紹介：本物のゲーム画面 6 枚とアイコンが読み込めている／スマホの最初の画面に 2 人がいて、題名や上の行に重ならない');
def(53, 'スマホのエピソード：シェアのボタンは 1 つ・説明は 2 行まで／週の帯に時刻を書かない／お見送りの 3 人が読み込めている／共有用の画像の作り方に古い曜日が残っていない');
def(54, 'キャラクターの絵は 1 枚ずつ出る（まばたき・にっこりで絵を重ねると、足もとの影が濃くなる。2026-11-15）');
def(55, 'キャラクターの札に「TAP」「HOVER」の文字を出さない（2026-11-15：オーナー「タップという文字はいらない」）');
def(56, '最初のまばたきでちかっとしない：まばたき・にっこりの絵は、展開（decode）が終わってから切り替える（2026-11-15）');
def(58, '検索エンジン向け：英語のブラウザの検索ロボットにも日本語の題で見える／日本語は / が正規／アイコンは自分のドメイン／サイトマップに各言語（2026-11-21：Google に英語の題で登録され「東京うさぎオフィス」で出にくかった）');
def(57, '案内役の 3D（東京うさぎオフィス）：見出しの字に重ならない・画面からはみ出さない・動きを減らす設定では読み込まない・クリックの邪魔をしない（2026-11-15）');
// 1 話ごとのページ・一覧・キャラクター紹介（tools/pages.mjs が作る。2026-11-22）
const SUBPAGES = []; { const walk = (d) => { for (const n of fs.readdirSync(new URL('../' + d, import.meta.url), { withFileTypes: true })) { if (n.isDirectory()) walk(d + n.name + '/'); else if (n.name === 'index.html') SUBPAGES.push(d + n.name); } }; for (const d of ['ep/', 'episodes/', 'characters/', 'en/', 'zh/', 'ko/']) if (fs.existsSync(new URL('../' + d, import.meta.url))) walk(d); }
def(60, '下のページ（1話ごと・一覧・キャラクター）：title・description・canonical が自分・h1 が1つ・JSON-LD が読める・4言語の hreflang が互いを指す');
def(61, '下のページが全部 sitemap.xml にあり、sitemap の URL が全部あるファイルを指す（404 にならない）');
def(63, 'LP に動画の長さ・連載の決まり・公開の時刻を書かない／「ある一日」は置かない（2026-11-24）／消した回のページ・動画が残っていない（2026-11-24 オーナー）');
def(64, 'キャラクターの札：横に並んだ札の名前の高さがそろっている（全部の幅・言語。2026-11-24 オーナー「モチだけ名前の位置が上」）');
def(62, '1話のページ：VideoObject（名前・サムネイル・公開日時・埋め込み URL）と、トップの一覧から全話のページへのリンクがある');
{ const SITE = 'https://usagi.coana.co.jp/'; const sm = fs.readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8');
  const locs = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&')));
  if (!SUBPAGES.length) note(60, '下のページが 1 つもない（node tools/prerender.mjs を実行する）');
  const canon = {};
  for (const f of SUBPAGES) { const h = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'); const url = SITE + f.replace(/index\.html$/, '');
    const t = (h.match(/<title>([^<]*)<\/title>/) || [])[1] || ''; const d = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    if (t.length < 10 || t.length > 90) note(60, `${f}：title の長さ ${t.length}`);
    if (d.length < 50 || d.length > 300) note(60, `${f}：description の長さ ${d.length}`);
    if (!h.includes(`<link rel="canonical" href="${url}">`)) note(60, `${f}：canonical が自分でない`);
    if ((h.match(/<h1[\s>]/g) || []).length !== 1) note(60, `${f}：h1 が 1 つでない`);
    for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { const j = JSON.parse(m[1]); if (f.startsWith('ep/') || /^(en|zh|ko)\/ep\//.test(f)) { const v = (j['@graph'] || []).find((x) => x['@type'] === 'VideoObject'); if (!v || !v.name || !v.thumbnailUrl || !/T\d\d:\d\d/.test(v.uploadDate || '') || !v.embedUrl) note(62, `${f}：VideoObject が足りない`); } } catch { note(60, `${f}：JSON-LD が読めない`); } }
    const alts = [...h.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]);
    if (alts.length !== 5 || !alts.some(([l, u]) => u === url)) note(60, `${f}：hreflang が 4 言語＋x-default でない／自分を含まない`);
    canon[url] = alts.map(([, u]) => u);
    if (!locs.has(url)) note(61, `${f} が sitemap にない`);
    if (/target="_blank"(?! rel="noopener)/.test(h)) note(20, `${f}：target=_blank に rel=noopener がない`); }
  for (const [u, list] of Object.entries(canon)) for (const v of list) if (canon[v] && !canon[v].includes(u)) note(60, `hreflang が片道：${u} → ${v}`);
  for (const u of locs) { if (!u.startsWith(SITE) || u.includes('?')) continue; const f = u.slice(SITE.length) + 'index.html'; if (!fs.existsSync(new URL('../' + f, import.meta.url))) note(61, `sitemap の ${u} のファイルがない`); }
  const top = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'); for (const f of SUBPAGES.filter((x) => /^ep\//.test(x))) if (!top.includes(`href="/${f.replace(/index\.html$/, '')}"`)) note(62, `トップから ${f} へのリンクがない`); }
def(59, '旧名が残っていない（2026-11-22：ブランドを「東京うさぎオフィス」、キャラクターをモチ・ユズ・クリに改名。旧名のレン・ジル・ポムを画面や検索向けの文に出さない）');
{ // 見る人・検索エンジンに届くファイルだけを見る（内部の名前 renjill・ren_open.webp・POM_DAY・URL は対象外）
  const OLD = /レンとジル|(?<![ァ-ヶー])レン(?![ァ-ヶー])|(?<![ァ-ヶー])ジル(?![ァ-ヶー])|(?<![ァ-ヶー])ポム(?![ァ-ヶー])|(?<![A-Za-z0-9_.$\/-])(?:Ren|Jill|Pom|REN|JILL|POM)(?![A-Za-z0-9_\/-])|蓮與吉兒|렌과 질/g; // 旧名の一覧（rename.py は「旧名」を含む行を書き換えない）
  for (const f of ['index.html', '404.html', 'llms.txt', 'site.webmanifest', 'feed.xml', 'sitemap.xml', 'tools/make_og.mjs', 'tools/prerender.mjs', 'tools/pages.mjs', ...SUBPAGES]) {
    const u = new URL('../' + f, import.meta.url); if (!fs.existsSync(u)) continue;
    const txt = fs.readFileSync(u, 'utf8').replace(/\/\*NAMEFIX\*\/[\s\S]*?\/\*\/NAMEFIX\*\//g, '').replace(/https?:\/\/[^\s"'<>)]+/g, ''); // 読み替えの関数（旧名→新名）そのものは除く
    const hit = [...new Set(txt.match(OLD) || [])]; if (hit.length) note(59, `${f} に旧名：${hit.slice(0, 6).join('・')}`); } }
{ const g = fs.existsSync(new URL('../guide3d.js', import.meta.url)) ? fs.readFileSync(new URL('../guide3d.js', import.meta.url), 'utf8') : '';
  if (!g) note(57, 'guide3d.js が無い'); if (!fs.existsSync(new URL('../img/g3d/atlas.webp', import.meta.url))) note(57, 'img/g3d/atlas.webp が無い');
  if (!/prefers-reduced-motion: reduce/.test(g) || !/saveData/.test(g)) note(57, '動きを減らす設定・通信量の節約で止める処理が無い');
  if (!/webglcontextlost/.test(g)) note(57, 'WebGL が落ちたときの処理が無い');
  { // 行のとちゅうの「//」のあとに命令が続いていない（説明を書き足した時に、後ろの命令が消えていた。2026-11-17）
    const bad = g.split('\n').filter((l) => { const i = l.indexOf('// '); return i > 0 && !/["'`]/.test(l.slice(0, i).replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '')) && (/[A-Za-z_$][\w$.]*\s*\(|[\w$.\]]\s*[-+*/]?=[^=]/.test(l.slice(i).replace(/（[^）]*）/g, '').replace(/[^\x00-\x7f]+/g, ' ')) || ((t) => (t.match(/[)\]}]/g) || []).length - (t.match(/[([{]/g) || []).length)(l.slice(i).replace(/[^\x00-\x7f]+/g, ' ')) > 0 || /\b(const|let|var)\s+[A-Za-z_$][\w$]*\s*=|\bif\s*\(|[\w\])]\s*[-+*/]=\s*[^=]|;\s*[A-Za-z_$][\w$.]*\s*(?:[-+*/]?=[^=]|\()/.test(l.slice(i).replace(/[^\x00-\x7f]+/g, ' '))); });   // 説明のあとに命令（const・if (・+=・「; 命令」）が続く形も（2026-11-18 アニメ側で深い息が消えた）   // 開いていないかっこを説明の中で閉じている形も（2026-11-17：アニメ側で「]) : null,」を説明に入れてしまった）
    if (bad.length) note(57, '説明（//）のあとに命令がある行：' + bad.length + ' 行（' + bad[0].trim().slice(0, 60) + '）'); }
  { // 向き（2026-11-17 オーナー：左へ行く時は左を向いて走る）：絵の左右反転（uM）と、向きを変えるしくみ（tA）が消えていない
    if (!/uM > 1\.5708/.test(g) || !/c\.dir \* \(c\.row \? -1 : 1\)/.test(g) || !/c\.tA = /.test(g)) note(57, '進む方を向いて走るしくみ（uM・tA）が見つからない'); }
  { // 寝る姿勢の大きさの倍率（guide3d.js の POSE_R）は img/g3d/poses.json と同じ（違うと、横になった時に体の大きさが変わる）
    const pj = JSON.parse(fs.readFileSync(new URL('../img/g3d/poses.json', import.meta.url), 'utf8')), m = g.match(/const POSE_R = \[([0-9.]+), ([0-9.]+)\], POSE_X = \[(-?[0-9.]+), (-?[0-9.]+)\]/);
    if (!m || +m[1] !== pj.flat.ren || +m[2] !== pj.flat.jill || +m[3] !== pj.flatX.ren || +m[4] !== pj.flatX.jill) note(57, `寝る姿勢の倍率・ずれが poses.json と合わない（${m ? m.slice(1).join(',') : 'なし'}）`); }
  { // ばたん（フロップ）の絵の倍率・ずれ（FLOP_R・FLOP_X）も poses.json と同じ
    const pj = JSON.parse(fs.readFileSync(new URL('../img/g3d/poses.json', import.meta.url), 'utf8')), m = g.match(/const FLOP_R = \[([0-9.]+), ([0-9.]+)\], FLOP_X = \[(-?[0-9.]+), (-?[0-9.]+)\]/);
    if (!m || +m[1] !== pj.flop.ren || +m[2] !== pj.flop.jill || +m[3] !== pj.flopX.ren || +m[4] !== pj.flopX.jill) note(57, 'ばたんの絵の倍率・ずれが poses.json と合わない'); }
  { // 前のび（伸び）の絵の倍率・ずれ（guide3d.js の BOW_R・BOW_X）は img/g3d/poses.json と同じ
    const pj = JSON.parse(fs.readFileSync(new URL('../img/g3d/poses.json', import.meta.url), 'utf8')), m = g.match(/const BOW_R = \[([0-9.]+), ([0-9.]+)\], BOW_X = \[(-?[0-9.]+), (-?[0-9.]+)\]/);
    if (!m || +m[1] !== pj.bow.ren || +m[2] !== pj.bow.jill || +m[3] !== pj.bowX.ren || +m[4] !== pj.bowX.jill) note(57, '伸びの絵の倍率・ずれが poses.json と合わない'); }
  { // 読みこむ時の版（?v=）は中身の指紋（sha256 の先頭 8 文字）と同じ。古い版のまま直すと、見る人のブラウザに前のファイルが残る（2026-11-17：絵を 3 回変えても ?v=20261116 のままだった）
    const crypto = await import('node:crypto'), h = (f) => crypto.createHash('sha256').update(fs.readFileSync(new URL('../' + f, import.meta.url))).digest('hex').slice(0, 8), html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    for (const f of ['guide3d.js', 'img/g3d/atlas.webp', 'img/g3d/atlas2.webp']) { const m = html.match(new RegExp(f.replace(/[./]/g, (c) => '\\' + c) + '\\?v=([0-9a-z]+)')); if (!m || m[1] !== h(f)) note(57, `${f} の ?v= が中身と合わない（${m ? m[1] : 'なし'} → ${h(f)}。tools/stamp.sh で直す）`); } }
  { const m = g.match(/const AW = (\d+), AH = (\d+), CELL = (\d+)/), a = fs.existsSync(new URL('../img/g3d/atlas.webp', import.meta.url)) ? fs.readFileSync(new URL('../img/g3d/atlas.webp', import.meta.url)) : null;
    const w = a && a.toString('ascii', 12, 16) === 'VP8X' ? 1 + a.readUIntLE(24, 3) : 0, h = a && w ? 1 + a.readUIntLE(27, 3) : 0; // webp（VP8X）の幅と高さ
    if (!m || +m[3] < 1024) note(57, '案内役の 3D の絵が細かくない（1 人 1024 より小さいと、手足の指やかげがつぶれる。2026-11-16 オーナー「動くモチとユズの足が質の低いまま」）');
    else if (w !== +m[1] || h !== +m[2]) note(57, `案内役の 3D の絵の大きさ（${w}×${h}）が guide3d.js の数字（${m[1]}×${m[2]}）と合わない（tools/make_g3d.py で作り直す）`); }
  if (!/mix\(0\.45, 1\.0, smoothstep/.test(g) || !/p\.x \/= mix\(1\.0, cy/.test(g)) note(57, '横を向いたとき体が平べったくなる直し（頭を中心に回す・幅を戻す）が無い（2026-11-16 オーナー指摘）');
  if (!/scrollY \/ H/.test(g) || !/const pin = /.test(g)) note(57, '奥行きスクロールが画面の高さに合っていない／足の位置を固定していない（横向きのスマホで大きくなりすぎ、端からはみ出した。2026-11-16）');
  if (!/addEventListener\("change", onReduce\)/.test(g)) note(57, '途中で「動きを減らす」に変えたとき止める処理が無い');
  if (!/float ay = clamp\(uRot\.y, -0\.6, 0\.6\)/.test(g) || /uSpin/.test(g)) note(57, '頭を回す角度を ±0.6 に限っていない／1 回転が残っている（押すと絵が大きく乱れる。2026-11-16 オーナー指摘）');
  if (!/__g3d\.hit\(e\.clientX, e\.clientY\)\) return;/.test(html)) note(57, '2 人を押したとき、ハンコも押されてしまう');
  if (!/crossOrigin = "anonymous"/.test(g)) note(57, '絵に crossOrigin が無い（別の場所から配られると 3D が動かない。2026-11-16 プレビューで発生）');
  if (!/\.g3d \{[^}]*pointer-events: none/.test(html) || !/\.g3d-wrap \{[^}]*pointer-events: none/.test(html)) note(57, '3D の画面がクリックを受けてしまう');
  if ((html.match(/class="g3d-spot"/g) || []).length < 6) note(57, '立つ場所（g3d-spot）が 6 つ無い（2026-11-24 に「ある一日」を外して 6 つ）');
  if (g.length > 64 * 1024) note(57, "guide3d.js が 64KB 超"); } // 2026-11-18 オーナー了承で 56→64KB（残りの作り込み）。2026-11-17 オーナー了承で 48→56KB（走り方の作り込み。絵 510KB に比べて小さい）。 // 2026-11-16：うさぎの体の中の動き（耳・鼻・息など）を足して 40→48KB。ページを読み終えてから読むので、最初の表示は遅くならない
// 17：「セリフなし」は、あえて書かない（2026-11-16 オーナー）。ページ・題名・共有文・よくある質問・llms.txt・feed・共有用の画像の作り方、どこにも戻さない
{ const NG = /セリフなし|セリフのない|セリフがない|NO DIALOGUE|no dialogue|wordless|No words|沒有台詞|대사 없|대사가 없|しぐさと音だけ|gestures and sounds|動作和聲音|몸짓과 소리만/; /* 今後セリフが出ることがあるので「しぐさと音だけ」も書かない（2026-11-16） */ for (const f of ['index.html', 'llms.txt', 'feed.xml', 'site.webmanifest', '404.html', 'tools/prerender.mjs', 'tools/make_og.mjs']) { const u = new URL('../' + f, import.meta.url); if (!fs.existsSync(u)) continue; const bad = fs.readFileSync(u, 'utf8').split('\n').filter((l) => NG.test(l) && !/^\s*(\/\/|\/\*|\*)/.test(l)); if (bad.length) note(17, f + ' に「セリフなし」の表現が残っている：' + bad[0].match(NG)[0]); } }
if (/class="rel-cards"|class="rel-card"|class="rel-how"/.test(html)) note(53, '関係の図の下の説明カード 4 枚／矢印の読み方の説明が戻っている（2026-11-16 オーナー「いらない」）');
if (!/i\.decode \?/.test(html) || !/requestAnimationFrame\(\(\) => p\.classList\.add\("ready"\)\)/.test(html)) note(56, '絵の展開を待たずに切り替えている');
if (/char-hint|>TAP<|>HOVER</.test(html)) note(55, '札に TAP / HOVER の文字が残っている');

// ---------- 静的な検査
const m = (re) => (html.match(re) || [])[1];
{ const t = m(/<title>([^<]*)<\/title>/); if (!t || t.length < 15 || t.length > 70) note(1, 'title ' + (t || '').length);
  const d = m(/<meta name="description" content="([^"]*)"/); if (!d || d.length < 50 || d.length > 160) note(2, 'desc ' + (d || '').length);
  if (!/<link rel="canonical" href="https:\/\/usagi\.coana\.co\.jp\/">/.test(html)) note(3, 'canonical');
  for (const h of ['ja', 'en', 'zh-Hant', 'ko', 'x-default']) if (!new RegExp(`hreflang="${h}"`).test(html)) note(4, h);
  for (const p of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type']) if (!html.includes(`property="${p}"`)) note(5, p);
  for (const p of ['twitter:card', 'twitter:title', 'twitter:image']) if (!html.includes(`name="${p}"`)) note(6, p);
  const lds = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
  const types = new Set(); for (const s of lds) { try { const j = JSON.parse(s); const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o['@type']) [].concat(o['@type']).forEach((t) => types.add(t)); Object.values(o).forEach(walk); } }; walk(j); } catch (e) { note(7, 'JSON-LD parse ' + e.message); } }
  for (const t of ['WebSite', 'Organization', 'VideoObject']) if (!types.has(t)) note(7, 'type ' + t);
  const sm = fs.readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8'); if (!sm.includes('<loc>https://usagi.coana.co.jp/</loc>') || !sm.includes('hreflang')) note(8, 'sitemap');
  if (!/Sitemap:\s*https:\/\/usagi\.coana\.co\.jp\/sitemap\.xml/.test(fs.readFileSync(new URL('../robots.txt', import.meta.url), 'utf8'))) note(9, 'robots');
  try { const w = JSON.parse(fs.readFileSync(new URL('../site.webmanifest', import.meta.url), 'utf8')); if (!w.name || !w.icons || !w.icons.length) note(10, 'manifest fields'); } catch (e) { note(10, 'manifest ' + e.message); }
  try { const l = fs.readFileSync(new URL('../llms.txt', import.meta.url), 'utf8'); if (!/月・木・土/.test(l) || !/Monday, Thursday and Saturday/.test(l) || /新作は毎日|公開：毎日|new every day|every day/i.test(l)) note(11, 'llms.txt の公開日が「毎週 月・木・土」になっていない（2026-11-17 から週3回）'); if (/30\s?秒|30-second|30 sec/i.test(l)) note(11, 'llms.txt 30秒'); } catch { note(11, 'llms.txt なし'); }
  try { const n = fs.readFileSync(new URL('../404.html', import.meta.url), 'utf8'); if (!/noindex/.test(n)) note(12, '404 noindex なし'); } catch { note(12, '404 なし'); }
  for (const s of ['youtube.com/@tokyo_usagi_office', 'instagram.com/tokyo_usagi_office', 'tiktok.com/@tokyo_usagi_office', 'threads.net/@tokyo_usagi_office']) { const n = html.split(s).length - 1; if (n < 2) note(13, s + ' ' + n); }
  if (/threads\.com\/@renjill/.test(html) && /threads\.net\/@renjill/.test(html)) note(13, 'threads.net と threads.com が混在');
  if (/http:\/\/(?!www\.w3\.org)/.test(html)) note(18, 'http:');
  for (const im of html.matchAll(/<img\b[^>]*>/g)) { const s = im[0]; if (!/\balt=/.test(s)) note(19, 'alt なし ' + s.slice(0, 60)); if (!/\bwidth=/.test(s) || !/\bheight=/.test(s)) note(19, 'width/height なし ' + s.slice(0, 60)); }
  for (const a of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) if (!/rel="[^"]*noopener/.test(a[0])) note(20, a[0].slice(0, 80));
  // 事実の矛盾（17）
  const FACT = [[/30\s?秒|30 seconds|30-second|約30秒|30초/, '1話は10〜20秒なのに「30秒」'], [/いちばん早く、新作が出ます|first to get new episodes/i, 'TikTok が最速と書いている（TikTok は手動で同じ日か遅い）'], [/新作は毎日|新作 · 毎日|毎日、新作|new episodes? (?:every day|daily)|每天都有新片|新片 · 每天|신작은 매일/i, '投稿は毎週 月・木・土なのに「毎日」（2026-11-17 から週3回）'], [/3話で1つ|three parts to a story|三集一個故事|3화로 한 이야기/i, '「3話で1つのお話」とは書かない（2026-11-17 オーナー。プロフィールと同じ）']];
  for (const [re, msg] of FACT) if (re.test(html.replace(/<!--[\s\S]*?-->/g, ''))) note(17, msg);
  if (/Lenis \+ GSAP/.test(html)) note(17, 'コメントに使っていない GSAP/Lenis');
  // オーナーの指示（2026-11-10）：「COANA TOKYO合同会社のオリジナルキャラクターです」という言葉は入れない（© の表記だけ残す）
  for (const f of ['../index.html', '../llms.txt', '../404.html']) { const x = fs.readFileSync(new URL(f, import.meta.url), 'utf8'); if (/オリジナルキャラクター|original characters? by|原創角色|原創。|오리지널 캐릭터/i.test(x)) note(17, f.slice(3) + ' に「オリジナルキャラクター」の一文'); if (/トラッカーを使っていません|no analytics or ad trackers/i.test(x)) note(17, f.slice(3) + ' に「トラッカーを使っていません」の一文（オーナー：不要）');}
  if (fs.statSync(new URL('../index.html', import.meta.url)).size > 400 * 1024) note(50, 'index.html が 400KB 超');
  // 51（2026-11-15）：キャラクターの絵。ファイルがあること・ページに 3 人分あること・目がカーソルを追う古い線画（data-eye）が残っていないこと
  for (const w of ['ren', 'jill', 'pom']) { for (const m of ['open', 'blink', 'happy', 'head']) if (!fs.existsSync(new URL(`../img/char/${w}_${m}.webp`, import.meta.url))) note(51, `img/char/${w}_${m}.webp がない`); if (!html.includes(`data-pic="${w}"`)) note(51, w + ' のカードに絵がない'); }
  if (/(^|[\s,}])\.game::(before|after)/m.test(html)) note(51, '「.game::before/after」は右の列のゲームのボタンにもかかる（section.game に限る）');
  if (/data-eye/.test(html)) note(51, '古い線画（data-eye）が残っている'); if ((html.match(/<image href="img\/char\//g) || []).length !== 3) note(51, '関係の図の絵が 3 人分でない');
  // feed.xml は Search Console にも出す：記事のリンク（alternate）はこのサイトの URL だけ（2026-11-10：YouTube へのリンクが「許可されていない URL」になった）
  try { const fd = fs.readFileSync(new URL('../feed.xml', import.meta.url), 'utf8'); for (const mm of fd.matchAll(/<link (?:rel="alternate" )?href="([^"]+)"\/>/g)) if (!mm[1].startsWith('https://usagi.coana.co.jp/')) note(8, 'feed.xml の記事リンクが別のサイト ' + mm[1].slice(0, 50)); } catch { note(8, 'feed.xml なし'); }
}

// ---------- ブラウザでの検査
const fixture = fs.readFileSync(new URL('./fixture-episodes.json', import.meta.url), 'utf8');
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ["--no-sandbox"] } : {});
async function open(w, h, lang, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: opts.reduce ? 'reduce' : 'no-preference', hasTouch: w < 900, isMobile: w < 900, locale: lang === 'zh' ? 'zh-TW' : lang });
  const p = await ctx.newPage(); const errs = []; if (opts.share) await p.addInitScript(() => { navigator.share = async () => {}; });
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
    out.schedOn = [...document.querySelectorAll('#sched li.on')].map((x) => x.firstChild.textContent.trim()).join();
    { const t = document.body.innerText + ' ' + (document.querySelector('meta[name=description]') || {}).content + ' ' + (document.querySelector('meta[property="og:description"]') || {}).content; const m = t.match(/新作は毎日|毎日、新作|新作 · 毎日|new episodes? (?:every day|daily)|every day \(|每天都有新片|新片 · 每天|신작은 매일|매일 신작/i); out.dailyText = m ? m[0] : ''; }
    out.days = (document.querySelector('.days, #days, .follow-days') || {}).innerText || '';
    out.pick = (document.querySelector('#pickup .pickup-t') || {}).textContent || '';
    out.small12 = [...document.querySelectorAll('main p, main li, main span, main a')].filter(vis).filter((e) => e.childElementCount === 0 && e.innerText.trim().length > 3 && parseFloat(getComputedStyle(e).fontSize) < 11.5).map((e) => e.innerText.trim().slice(0, 16) + ':' + getComputedStyle(e).fontSize).slice(0, 4);
    out.canon = (document.querySelector('link[rel=canonical]') || {}).href;
    out.epTitles = [...document.querySelectorAll('#eps h3')].map((e) => e.innerText.trim()).slice(0, 20);
    out.zeroMore = [...document.querySelectorAll('button')].filter(vis).map((b) => b.innerText).filter((x) => /あと0|\(0 more\)|還有 0|0편 더/.test(x));
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
  if (r.zeroMore && r.zeroMore.length) note(47, tag + ' 「あと0話」のボタンが見えている');
  if (lang === 'en' && r.imgAltJa.length) note(45, tag + ' 画像の代替テキストが日本語 ' + r.imgAltJa.join(' / '));
  if (lang === 'en' && r.epTitles.some((s) => /[぀-ヿ]/.test(s))) note(45, tag + ' ' + r.epTitles.filter((s) => /[぀-ヿ]/.test(s)).slice(0, 3).join(' / '));
  if (lang === 'zh' && r.epTitles.some((s) => /[぀-ゟ]/.test(s))) note(45, tag + ' ' + r.epTitles.filter((s) => /[぀-ゟ]/.test(s)).slice(0, 2).join(' / '));
  if (lang === 'ko' && r.epTitles.some((s) => /[぀-ゟ]/.test(s))) note(45, tag + ' ' + r.epTitles.filter((s) => /[぀-ゟ]/.test(s)).slice(0, 2).join(' / '));
  if (/毎日|every day|daily|每天|매일/i.test(r.days)) note(39, tag + ' ' + r.days.slice(0, 40));
  // 2026-11-17：新作は週3回（月・木・土）。光っている曜日がちょうど月・木・土で、ページのどこにも「新作は毎日」と書いていない
  if (r.schedOn !== 'MON,THU,SAT') note(39, tag + ' 光っている曜日が「' + r.schedOn + '」（月・木・土のはず）');
  if (r.dailyText) note(39, tag + ' 「毎日」の言い方が残っている：' + r.dailyText);
  // 次の新作（毎週 月・木・土。時刻は 月・木 18:00、土 12:00。2026-11-24）：その日の時刻の前ならその日から、それ以降は明日から数えて、次の 月・木・土
  { const now = new Date(Date.now() + (9 * 60 + new Date().getTimezoneOffset()) * 60000); const nx = new Date(now); nx.setHours(0, 0, 0, 0); const SLOT = { 1: 18, 4: 18, 6: 12 }; if (SLOT[now.getDay()] !== undefined && now.getHours() >= SLOT[now.getDay()]) nx.setDate(nx.getDate() + 1); while (SLOT[nx.getDay()] === undefined) nx.setDate(nx.getDate() + 1); const md = `${nx.getMonth() + 1}/${nx.getDate()}`; if (!r.next.includes(md)) note(38, tag + ' 「' + r.next + '」 期待 ' + md); }
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
{ const { p, ctx } = await open(390, 844, 'ja', { noFeed: true }); const n = await p.evaluate(() => document.querySelectorAll('#eps [id^="ep-"]').length); if (n < 3) note(35, '一覧が空 ' + n); const zero = await p.evaluate(() => [...document.querySelectorAll('#eps .ep:not(.more-hidden) .ep-media')].filter((e) => e.getBoundingClientRect().height < 50).length); if (zero) note(35, '枠がつぶれる ' + zero); await ctx.close(); }
// 51：絵が実際に読み込めている・カードの枠からはみ出していない
for (const [w, h] of [[390, 844], [1440, 900]]) { const { p, ctx } = await open(w, h, 'ja'); await p.evaluate(() => document.querySelector('#characters').scrollIntoView()); await p.waitForTimeout(1200);
  const r = await p.evaluate(() => [...document.querySelectorAll('.char-pic')].map((e) => { const im = e.querySelector('.p-open'), a = im.getBoundingClientRect(), f = e.closest('.char-face').getBoundingClientRect(); return { who: e.dataset.pic, ok: im.complete && im.naturalWidth > 100, inside: a.left >= f.left - 1 && a.right <= f.right + 1 && a.top >= f.top - 1 && a.bottom <= f.bottom + 1, h: Math.round(a.height), fh: Math.round(f.height) }; }));
  if (r.length !== 3) note(51, w + ' 絵が 3 人分でない'); for (const x of r) { if (!x.ok) note(51, w + ' ' + x.who + ' の絵が読み込めない'); if (!x.inside) note(51, w + ' ' + x.who + ' の絵が枠からはみ出す'); if (x.h < x.fh * .6) note(51, w + ' ' + x.who + ' の絵が小さすぎる'); } await ctx.close(); }
// 52：ゲームの画面の列・アイコン・最初の画面の 2 人
for (const [w, h, lang] of [[390, 844, 'ja'], [320, 568, 'en'], [1440, 900, 'ja']]) { const { p, ctx } = await open(w, h, lang);
  if (w < 900) { const r = await p.evaluate(() => { const d = document.querySelector('.hero-duo'), bx = (e) => e.getBoundingClientRect(); if (!d || getComputedStyle(d).display === 'none') return { none: 1 }; const a = bx(d), k = bx(document.querySelector('.hero-kicker')), cs = [...document.querySelectorAll('.hero-title .c')].map(bx), hit = cs.filter((c) => c.right > a.left + a.width * .16 && c.bottom > a.top + 6 && c.top < a.bottom).length; const im = [...d.querySelectorAll('.p-open')]; return { ok: im.every((i) => i.complete && i.naturalWidth > 100), over: a.top < k.bottom - 2, hit, out: a.right > innerWidth + 1, w: Math.round(a.width) }; });
    if (r.none) note(52, w + ' 最初の画面に 2 人がいない'); else { if (!r.ok) note(52, w + ' 2 人の絵が読み込めない'); if (r.over) note(52, w + ' 2 人が上の行に重なる'); if (r.hit) note(52, w + ' 2 人が題名の字に重なる ' + r.hit); if (r.out) note(52, w + ' 2 人が画面の外にはみ出す'); if (r.w < 90) note(52, w + ' 2 人が小さすぎる ' + r.w); } }
  await p.evaluate(async () => { document.querySelector('.stages').scrollIntoView({ block: 'center' }); const row = document.querySelector('.stage-row'); for (let x = 0; x <= row.scrollWidth; x += 200) { row.scrollLeft = x; await new Promise((r) => setTimeout(r, 180)); } row.scrollLeft = 0; }); await p.waitForTimeout(1200);
  const g = await p.evaluate(() => { const im = [...document.querySelectorAll('.stage-row img')], ic = document.querySelector('.game-icon'), row = document.querySelector('.stage-row'); return { n: im.length, bad: im.filter((i) => !(i.complete && i.naturalWidth > 100)).length, icon: ic && ic.complete && ic.naturalWidth > 50, caps: [...document.querySelectorAll('.stage-row figcaption')].filter((c) => !c.textContent.trim()).length, cut: innerWidth >= 1000 ? im.filter((i) => i.getBoundingClientRect().right > innerWidth).length : 0, scroll: row.scrollWidth > row.clientWidth + 4, pageW: document.documentElement.scrollWidth > innerWidth + 1 }; });
  if (g.n !== 6) note(52, w + ' ゲームの画面が 6 枚でない ' + g.n); if (g.bad) note(52, w + ' ゲームの画面が読み込めない ' + g.bad); if (!g.icon) note(52, w + ' アイコンが読み込めない'); if (g.caps) note(52, w + ' 場所の名前が空'); if (g.cut) note(52, w + ' PC でゲームの画面が切れる'); if (w < 900 && !g.scroll) note(52, w + ' スマホで横に動かせない'); if (g.pageW) note(52, w + ' ページが横にはみ出す'); await ctx.close(); }
// 53：スマホのエピソードの札・週の帯・お見送りの 3 人
{ const { p, ctx } = await open(390, 844, 'ja', { share: true }); await p.evaluate(() => document.querySelector('#episodes').scrollIntoView()); await p.waitForTimeout(1200);
  const r = await p.evaluate(() => { const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 2 && b.height > 2 && getComputedStyle(e).display !== 'none'; }; const cards = [...document.querySelectorAll('#eps .ep:not(.ep-next):not(.more-hidden):not(.soon)')].slice(0, 6);
    return { n: cards.length, btn: cards.map((c) => [...c.querySelectorAll('.ep-share .shb')].filter(vis).length), tall: cards.filter((c) => { const p = c.querySelector('.ep-cap'); return p && p.getBoundingClientRect().height > parseFloat(getComputedStyle(p).lineHeight) * 2.3; }).length, small: cards.filter((c) => { const b = [...c.querySelectorAll('.ep-share .shb')].filter(vis)[0]; return b && (b.getBoundingClientRect().width < 38 || b.getBoundingClientRect().height < 38); }).length, k: (document.querySelector('.sched-k b') || {}).textContent, pageW: document.documentElement.scrollWidth > innerWidth + 1 }; });
  if (r.n < 3) note(53, '札が少ない ' + r.n); if (r.btn.some((x) => x !== 1)) note(53, 'シェアのボタンが 1 つでない ' + r.btn.join(',')); if (r.tall) note(53, '説明が 2 行をこえる札 ' + r.tall); if (r.small) note(53, 'シェアのボタンが小さい（38px 未満）'); if (r.k !== 'NEW') note(53, '週の帯の大きな字が「NEW」でない（時刻は書かない。2026-11-24）'); if (r.pageW) note(53, 'ページが横にはみ出す');
  await p.evaluate(() => document.querySelector('#epsMore').scrollIntoView({ block: 'center' })); await p.waitForTimeout(1800);
  const gap = await p.evaluate(() => { const b = document.querySelector('#epsMore'), c = [...document.querySelectorAll('#eps .ep:not(.more-hidden)')].pop(); return b && !b.hidden && c ? Math.round(b.getBoundingClientRect().top - c.getBoundingClientRect().bottom) : 99; }); if (gap < 20) note(53, '「もっと見る」と一覧のあいだの余白が ' + gap + 'px（20 以上）');
  const shift = await p.evaluate(() => [...document.querySelectorAll('#eps .ep.in')].filter((e) => getComputedStyle(e).transform !== 'none' && !e.matches(':hover')).length); if (shift) note(53, '出てきた後も、ずれたままの札 ' + shift);
  await p.evaluate(() => document.querySelector('.ftr').scrollIntoView()); await p.waitForTimeout(1500); const c = await p.evaluate(() => [...document.querySelectorAll('.ftr-crew img')].map((i) => i.complete && i.naturalWidth > 100)); if (c.length !== 3 || c.includes(false)) note(53, 'お見送りの 3 人が読み込めない ' + c.join(','));
  const mk = fs.readFileSync(new URL('../tools/make_og.mjs', import.meta.url), 'utf8'); if (/MON WED|4× ?\/ ?WEEK/i.test(mk) || !/EVERY DAY/.test(mk)) note(53, '共有用の画像の作り方に古い曜日が残っている'); await ctx.close(); }
// 54：まばたき・にっこりのとき、見えている絵は 1 枚だけ（重ねると半透明の影が二重になって濃く見える）
for (const [w, h] of [[390, 844], [1440, 900]]) { const { p, ctx } = await open(w, h, 'ja'); await p.evaluate(() => document.querySelector('.char-pic').scrollIntoView({ block: 'center' })); await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => { const out = []; const vis = (e) => [...e.querySelectorAll('img')].filter((i) => +getComputedStyle(i).opacity > .5).map((i) => i.className);
    for (const e of document.querySelectorAll('.char-pic, .duo-pic')) { if (getComputedStyle(e).display === 'none' || !e.offsetWidth) continue; const who = e.dataset.pic || e.className;
      if (!e.classList.contains('ready')) { out.push(who + '：絵が読み込めていない（ready でない）'); continue; }
      e.classList.remove('blink'); let v = vis(e); if (v.length !== 1 || v[0] !== 'p-open') out.push(who + '：ふだん ' + v.join('+'));
      e.classList.add('blink'); v = vis(e); if (v.length !== 1 || v[0] !== 'p-blink') out.push(who + '：まばたき ' + v.join('+')); e.classList.remove('blink');
      const c = e.closest('.char'); if (c) { c.classList.add('flipped'); v = vis(e); if (v.length !== 1 || v[0] !== 'p-happy') out.push(who + '：にっこり ' + v.join('+')); e.classList.add('blink'); v = vis(e); if (v.length !== 1) out.push(who + '：にっこり中のまばたき ' + v.join('+')); e.classList.remove('blink'); c.classList.remove('flipped'); } }
    return out; });
  for (const x of r) note(54, `${w}px ${x}`); await ctx.close(); }

// 47：ライトボックス
{ const { p, ctx } = await open(1440, 900, 'ja'); const ok = await p.evaluate(async () => { const { openLb } = window.__RJ || {}; if (typeof openLb !== 'function') return 'no openLb'; openLb('xxxxxxxxxxx', null); await new Promise((r) => setTimeout(r, 300)); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await new Promise((r) => setTimeout(r, 400)); return document.getElementById('lb').classList.contains('open') ? 'still open' : 'ok'; }); if (ok !== 'ok') note(47, ok);
  const nav = await p.evaluate(async () => { const { EPS, openLb } = window.__RJ; const list = EPS.filter((e) => e.yt && !e.soon); if (list.length < 3) return 'ok'; openLb(list[1].yt, list[1]); await new Promise((r) => setTimeout(r, 200)); const ttl = document.querySelector('#lbInfo b').textContent; const prevOk = !document.getElementById('lbPrev').hidden, nextOk = !document.getElementById('lbNext').hidden;
    document.getElementById('lbNext').click(); await new Promise((r) => setTimeout(r, 200)); const ttl2 = document.querySelector('#lbInfo b').textContent; const nextHidden = document.getElementById('lbNext').hidden; window.__RJ.closeLb();
    return ttl && prevOk && nextOk && ttl2 !== ttl && nextHidden ? 'ok' : JSON.stringify({ ttl, prevOk, nextOk, ttl2, nextHidden }); });
  if (nav !== 'ok') note(47, '前後の回 ' + nav);
  const more = await p.evaluate(async () => { const b = document.getElementById('epsMore'); const hidden0 = document.querySelectorAll('#eps .ep.more-hidden').length; if (!hidden0) return 'ok'; if (b.getBoundingClientRect().height === 0) return 'ボタンが出ない'; b.click(); await new Promise((r) => setTimeout(r, 200)); const shown = b.getBoundingClientRect().height > 0 && getComputedStyle(b).display !== 'none'; return document.querySelectorAll('#eps .ep.more-hidden').length === 0 && !shown ? 'ok' : (shown ? '全部出たあともボタンが見えている：' + b.textContent : 'もっと見るで全部出ない'); });
  if (more !== 'ok') note(47, more);
  // 戻るボタン：動画を開く→前の回→戻る で窓が閉じ、アドレスの ?ep= も消える（iframe の履歴で戻れない不具合の再発防止）
  await p.evaluate(() => window.scrollTo(0, 0)); await p.evaluate(() => { const a = document.querySelector('#eps .ep:not(.more-hidden) .ep-link[data-yt]:not([data-yt=""])'); a && a.click(); }); await p.waitForTimeout(300);
  await p.evaluate(() => { const b = document.getElementById('lbPrev'); if (!b.hidden) b.click(); }); await p.waitForTimeout(300);
  const u1 = await p.evaluate(() => location.search); await p.evaluate(() => history.back()); await p.waitForTimeout(600);
  const back = await p.evaluate(() => ({ open: document.getElementById('lb').classList.contains('open'), q: location.search }));
  if (!/ep=/.test(u1) || back.open || /ep=/.test(back.q)) note(47, '戻るボタン ' + JSON.stringify({ u1, ...back }));
  // 「ある一日」のカード・初登場から、同じ題の回が開く
  // 「ある一日」は 2026-11-24 に外した（オーナー）。キャラクターの初登場から回が開くかを見る
  const day = await p.evaluate(async () => { const c = document.querySelectorAll('.debut-link'); if (c.length < 3) return '初登場のリンクが ' + c.length; return 'ok'; });
  if (day !== 'ok') note(47, day);
  await ctx.close(); }
// 57：案内役の 3D。?g3d=1 で動かし、最初の画面と各見出しで、字に重ならない・はみ出さないことを確かめる（WebGL が無い検査機では、動かない＝元の絵のまま、を確かめる）
// 2026-11-16：とても小さい画面（280）・横向きのスマホ（667x375）・とても広い画面（2560）も見る（280 で題名の & に重なる／横向きで大きくなりすぎる、が実際に起きた）
for (const [w, h, lang] of [[280, 653, 'ja'], [320, 568, 'en'], [390, 844, 'zh'], [667, 375, 'ja'], [768, 1024, 'ko'], [1024, 768, 'en'], [1440, 900, 'ja'], [1920, 1080, 'zh'], [2560, 1080, 'en']]) { const { p, ctx, errs } = await open(w, h, lang, { q: '?lang=' + lang + '&g3d=1' }); await p.waitForTimeout(4200);
  const has = await p.evaluate(() => { const s = window.__g3d; return s ? (s.lost ? 'lost:' + (s.err || '') : 'on') : 'off'; });
  if (has !== 'on') { const gl = await p.evaluate(() => { try { return !!document.createElement('canvas').getContext('webgl'); } catch { return false; } }); if (gl) note(57, w + ' WebGL はあるのに 3D が動いていない ' + has); if (await p.evaluate(() => document.documentElement.classList.contains('g3d-on'))) note(57, w + ' 3D が動いていないのに元の絵を隠している'); await ctx.close(); continue; }
  const n = await p.evaluate(() => document.querySelectorAll('.g3d-spot').length);
  for (let i = 0; i < n; i++) {
    await p.evaluate(async ([i, h]) => { const e = document.querySelectorAll('.g3d-spot')[i]; const t = Math.max(0, e.getBoundingClientRect().bottom + scrollY - Math.round(h * .45)); const s = scrollY; for (let k = 1; k <= 12; k++) { scrollTo(0, s + (t - s) * k / 12); await new Promise((r) => setTimeout(r, 16)); } }, [i, h]); await p.waitForTimeout(2600);
    const r = await p.evaluate((i) => { const s = window.__g3d, e = document.querySelectorAll('.g3d-spot')[i], host = e.parentElement; const boxes = s.chars.map((c) => ({ l: c.x - c.size * .34, r: c.x + c.size * .34, t: c.y - c.size * .8, b: c.y, mode: c.mode, a: c.alpha }));
      const texts = []; const tw = document.createTreeWalker(i === 0 ? document.querySelector('.hero-copy') : host, NodeFilter.SHOW_TEXT); let nd; while ((nd = tw.nextNode())) { if (!nd.textContent.trim() || nd.parentElement.closest('.sr, .hero-duo')) continue; const rg = document.createRange(); rg.selectNodeContents(nd); for (const q of rg.getClientRects()) if (q.width > 2) texts.push(q); }
      const hit = boxes.filter((b) => texts.some((q) => q.right > b.l + 2 && q.left < b.r - 2 && q.bottom > b.t + 4 && q.top < b.b - 4)).length;
      const clock = [...document.querySelectorAll('.day-clock, .hero-art')].map((x) => x.getBoundingClientRect()).filter((q) => q.width > 2); const hit2 = boxes.filter((b) => clock.some((q) => q.right > b.l + 3 && q.left < b.r - 3 && q.bottom > b.t + 5 && q.top < b.b - 5)).length;
      const bad = s.chars.some((c) => [c.x, c.y, c.z, c.size, c.sq, c.ry, c.rz, c.lagX, c.lagY].some((v) => !Number.isFinite(v)) || Math.abs(c.ry) > .6 || c.sq < .69 || c.sq > 1.26);
      return { active: s.active, hit, hit2, bad, out: boxes.some((b) => b.r > innerWidth + 1 || b.l < -1), modes: boxes.map((b) => b.mode + b.a).join(), small: Math.min(...s.chars.map((c) => c.size)) }; }, i);
    const tag = w + ' ' + lang + ' 場所' + i;
    // 横になっている子は、寝姿の横幅（体 1.5 個分）で測る（2026-11-18：そっとなでても起きないようにしたら、寝ているモチを押すようになり、寝姿の横幅がはみ出しと数えられた。乱れの見張りは弱めない）
    // 押した直後の絵が、2 人のまわりからはみ出さない（2026-11-16：押すと絵が引きのばされて大きく乱れた）。3D の画面を 6 コマ読んで、絵のある範囲を測る
    if (i === 1 && r.active === 1) { const pt = await p.evaluate(() => { const c = window.__g3d.chars[0]; return [c.x, c.y - c.size * .4]; }); if (w < 900) await p.touchscreen.tap(pt[0], pt[1]); else await p.mouse.click(pt[0], pt[1]);
      const ext = await p.evaluate(async () => { const cv = document.getElementById('g3d'), s = window.__g3d, k = 200 / cv.width, c2 = document.createElement('canvas'); c2.width = 200; c2.height = Math.round(cv.height * k); const g = c2.getContext('2d', { willReadFrequently: true }); let worst = 0, seen = 0;
        for (let f = 0; f < 6; f++) { await new Promise((r) => requestAnimationFrame(r)); g.clearRect(0, 0, c2.width, c2.height); g.drawImage(cv, 0, 0, c2.width, c2.height); const d = g.getImageData(0, 0, c2.width, c2.height).data; const sc = c2.width / cv.clientWidth;
          const wOf = (c) => c.size * (c.flat ? 1.5 : .8), L = Math.min(...s.chars.map((c) => c.x - wOf(c))) * sc, R = Math.max(...s.chars.map((c) => c.x + wOf(c))) * sc, T = Math.min(...s.chars.map((c) => c.y - c.size * 1.6)) * sc, B = Math.max(...s.chars.map((c) => c.y + c.size * .25)) * sc;
          for (let y = 0; y < c2.height; y++) for (let x = 0; x < c2.width; x++) if (d[(y * c2.width + x) * 4 + 3] > 40) { seen++; worst = Math.max(worst, L - x, x - R, T - y, y - B); } await new Promise((r) => setTimeout(r, 60)); }
        return { worst: Math.round(worst / (200 / cv.clientWidth)), seen }; });
      if (!ext.seen) note(57, tag + ' 押したあと、絵が読めない（検査が効いていない）'); else if (ext.worst > 8) note(57, tag + ' 押すと絵が 2 人のまわりから ' + ext.worst + 'px はみ出す（乱れ）'); await p.waitForTimeout(1200); }
    if (r.active !== i) note(57, tag + ' に来ていない（いま ' + r.active + '）'); else { if (r.modes !== 'sit1,sit1') note(57, tag + ' 着いていない ' + r.modes); if (r.hit) note(57, tag + ' 見出しの字に重なる'); if (r.hit2) note(57, tag + ' 時計・最初の画面の絵に重なる'); if (r.bad) note(57, tag + ' 数値がおかしい（回りすぎ・つぶれすぎ）'); if (r.out) note(57, tag + ' 画面の外にはみ出す'); if (r.small < 40) note(57, tag + ' 小さすぎる ' + Math.round(r.small)); } }
  // スマホで素早くスライドしても、2 人がページとずれない（2026-11-16 オーナー指摘）：描いたあと、次に描く前にページだけ動かしても、絵の足の位置が場所と合っている
  { const r = await p.evaluate(async () => { await new Promise((q) => requestAnimationFrame(() => q())); const s = window.__g3d, cv = document.getElementById('g3d'), sp = document.querySelectorAll('.g3d-spot')[s.active]; const t0 = cv.getBoundingClientRect().top, foot = s.chars[0].y - t0; scrollBy(0, 160); const gap = cv.getBoundingClientRect().top + foot - sp.getBoundingClientRect().bottom; scrollBy(0, -160); return Math.round(gap); });
    if (Math.abs(r) > 3) note(57, w + ' 素早くスライドすると 2 人がページから ' + r + 'px ずれる'); }
  // 一番上へ戻ると、最初の場所に戻る／クリックは下の要素に届く
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(3200);
  const back = await p.evaluate(() => { const s = window.__g3d, c = s.chars[0]; const el = document.elementFromPoint(Math.max(1, Math.min(innerWidth - 2, c.x)), Math.max(1, c.y - c.size * .4)); return { a: s.active, m: s.chars.map((c) => c.mode).join(), cv: !!el && el.id === 'g3d', ov: document.documentElement.scrollWidth - innerWidth }; });
  if (back.a !== 0 || back.m !== 'sit,sit') note(57, w + ' 一番上に戻っても最初の場所に戻らない ' + JSON.stringify(back)); if (back.cv) note(57, w + ' 3D の画面がクリックを受けている'); if (back.ov > 1) note(57, w + ' 横にはみ出す');
  if (errs.length) note(57, w + ' エラー ' + errs[0].slice(0, 100)); await ctx.close(); }
// 57：居眠りの Zz は、モチが目を閉じてから出る（2026-11-16 オーナー「Zz が出るのに寝るのが遅い」）。着くところから 4 秒、細かく見る
for (const [w, h] of [[390, 844], [1440, 900]]) { const { p, ctx } = await open(w, h, 'ja', { q: '?lang=ja&g3d=1' }); await p.waitForTimeout(3500);
  const r = await p.evaluate(async () => { const s = window.__g3d; if (!s || s.lost) return null; const i = [...document.querySelectorAll('.g3d-spot')].findIndex((e) => e.dataset.act === 'nap'), e = document.querySelectorAll('.g3d-spot')[i]; scrollTo(0, Math.max(0, e.getBoundingClientRect().bottom + scrollY - innerHeight * .45));
    let early = 0, zz = 0, slept = 0, smiled = 0; const t0 = performance.now(); while (performance.now() - t0 < 4500) { await new Promise((q) => requestAnimationFrame(q)); const now = performance.now() / 1000, ren = s.chars[0]; if (s.active !== i || ren.mode !== 'sit') continue; const b = s.bubbles.find((x) => x.icon === 'zz' && now >= x.t0); if (ren.asleep) slept++; if (ren.face === 'happy' && !ren.hover) smiled++; if (b) { zz++; if (!ren.asleep || ren.face !== 'blink' || !ren.flat) early++; } } return { early, zz, slept, smiled }; });
  if (r) { if (!r.zz || !r.slept) note(57, w + ' 居眠りの場所で、Zz または居眠りが出ていない ' + JSON.stringify(r)); if (r.early) note(57, w + ' モチが横になって目を閉じる前に Zz が出ている（' + r.early + ' コマ）'); if (r.smiled > 2) note(57, w + ' 居眠りの場所に着いたモチが、寝る前ににっこりしている'); } await ctx.close(); }
// 57：カーソルをモチに乗せたまま居眠りの場所に着くと、モチは起きている。そのあいだ Zz を出さない（2026-11-18 オーナー「まだ寝てないのに ZZ と出る」）
{ const { p, ctx } = await open(1440, 900, 'ja', { q: '?lang=ja&g3d=1' }); await p.waitForTimeout(3500);
  const ok = await p.evaluate(() => { const s = window.__g3d; if (!s || s.lost) return false; const e = [...document.querySelectorAll('.g3d-spot')].find((x) => x.dataset.act === 'nap'); scrollTo(0, Math.max(0, e.getBoundingClientRect().bottom + scrollY - innerHeight * .45)); return true; });
  let bad = 0, seen = 0; const t0 = Date.now();
  while (ok && Date.now() - t0 < 5000) { const q = await p.evaluate(() => { const s = window.__g3d, ren = s.chars[0], now = performance.now() / 1000; return { x: ren.x, y: ren.y - ren.size * .35, sit: ren.mode === 'sit', nap: (document.querySelectorAll('.g3d-spot')[s.active] || {}).dataset?.act === 'nap', asleep: ren.asleep, zz: s.bubbles.some((b) => b.icon === 'zz' && now >= b.t0) }; });
    await p.mouse.move(q.x + (seen % 2), q.y); if (q.sit && q.nap) { seen++; if (q.zz && !q.asleep) bad++; } await p.waitForTimeout(40); }
  if (ok && !seen) note(57, '1440 カーソルを乗せた居眠りの確かめ：着いたところを見られなかった'); if (bad) note(57, '1440 カーソルを乗せて起きているモチに Zz が出ている（' + bad + ' 回）'); await ctx.close(); }
{ const { p, ctx } = await open(390, 844, 'ja', { reduce: true, q: '?lang=ja&g3d=1' }); await p.waitForTimeout(1500); if (await p.evaluate(() => !!window.__g3d || !!document.querySelector('script[src*="guide3d"]') || document.documentElement.classList.contains('g3d-on'))) note(57, '動きを減らす設定でも 3D を読み込んでいる'); await ctx.close(); }
// 53：ゲーム紹介の小さな丸い顔（MOCHI・YUZU・KURI）が見切れていない：丸の中が顔で 8 割以上埋まっている（2026-11-16 オーナー「モチの顔が見切れてる」。前のモチは 59%）
{ const { p, ctx } = await open(1440, 900, 'ja', { q: '?lang=ja&g3d=0' }); const r = await p.evaluate(async () => Promise.all([...document.querySelectorAll('.game-chars img')].map(async (im) => { const i = new Image(); i.src = im.src; await i.decode(); const c = document.createElement('canvas'); c.width = c.height = 80; const g = c.getContext('2d'); g.drawImage(i, 0, 0, 80, 80); const d = g.getImageData(0, 0, 80, 80).data; let s = 0, n = 0; for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) if ((x - 39.5) ** 2 + (y - 39.5) ** 2 <= (40 * .92) ** 2) { s += d[(y * 80 + x) * 4 + 3] / 255; n++; } return [im.src.split('/').pop(), Math.round(s / n * 100)]; })));
  if (r.length !== 3) note(53, 'ゲーム紹介の丸い顔が 3 つでない ' + r.length); for (const [f, v] of r) if (v < 80) note(53, f + ' の丸の中が ' + v + '% しか埋まっていない（顔が見切れて見える。tools/make_heads.py で作り直す）'); await ctx.close(); }
// 7：動画の uploadDate は、時刻と時間帯まで書く（日付だけだと Search Console が「日時値が無効です」と出す。2026-11-05 の通知）
{ const bad = [...html.matchAll(/"uploadDate":\s*"([^"]*)"/g)].map((m) => m[1]).filter((v) => !/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?[+-]\d\d:\d\d$/.test(v)); if (bad.length) note(7, 'uploadDate に時間帯が無い：' + bad[0]); /* 動画の uploadDate は 1 話ごとのページ（検査 62）で確かめる。2026-11-22 */ }
// 40：PICKUP
{ const { p, ctx } = await open(1440, 900, 'ja'); const r = await p.evaluate(() => ({ pk: document.querySelector('#pickup .pickup-t').textContent, d: __RJ.jstISO() })); if (r.d > '2026-11-07' && /入社しました|joined/.test(r.pk)) note(40, 'クリの入社から1週間以上たっても「入社しました」：' + r.pk); await ctx.close(); }
// 58（2026-11-21）：検索で「東京うさぎオフィス」と探す人に、日本語の公式サイトとして見つけてもらう
{ if (!/<title>東京うさぎオフィス/.test(html)) note(58, 'title が「東京うさぎオフィス」で始まらない');
  if (/\?ep=/.test(fs.readFileSync(new URL('../feed.xml', import.meta.url), 'utf8'))) note(58, 'feed.xml の記事リンクに ?ep=（canonical が / なので Search Console に「代替ページ」と出る。/#ep-xx にする）');
  if (!html.includes('<link rel="alternate" hreflang="ja" href="https://usagi.coana.co.jp/">')) note(58, 'hreflang ja が / を指していない（?lang=ja は / と同じページ）');
  if (!/"@type":"WebSite"[^}]*"name":"東京うさぎオフィス"/.test(html)) note(58, 'WebSite の name が「東京うさぎオフィス」でない（検索結果のサイト名）');
  if (/hay-dash\.coana\.co\.jp\/(favicon|icon)/.test(html)) note(58, 'アイコンがゲームのドメインのまま');
  for (const f of ['favicon.ico', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) if (!fs.existsSync(new URL('../' + f, import.meta.url))) note(58, f + ' がない');
  const sm = fs.readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8'); for (const l of ['en', 'zh', 'ko']) if (!sm.includes(`<loc>https://usagi.coana.co.jp/?lang=${l}</loc>`)) note(58, 'sitemap に ?lang=' + l + ' がない');
  if (/hreflang="ja" href="[^"]*\?lang=ja"/.test(sm)) note(58, 'sitemap の hreflang ja が ?lang=ja');
  for (const bot of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)']) {
    const ctx = await b.newContext({ userAgent: bot, locale: 'en-US', viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
    await p.route(/^https?:\/\/(?!localhost)/, (r) => r.request().url().includes('episodes.json') ? r.fulfill({ status: 200, contentType: 'application/json', body: fixture }) : r.abort());
    await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
    const r = await p.evaluate(() => ({ t: document.title, l: document.documentElement.lang, c: (document.querySelector('link[rel=canonical]') || {}).href, u: location.search }));
    if (!/^東京うさぎオフィス/.test(r.t) || r.l !== 'ja') note(58, '検索ロボット（' + bot.match(/\w+bot/)[0] + '）に英語で見える：' + r.t);
    if (r.c !== 'https://usagi.coana.co.jp/') note(58, '検索ロボットの canonical ' + r.c); if (r.u) note(58, '検索ロボットのアドレスに ' + r.u + ' が付いた'); await ctx.close(); }
  // 人が英語のブラウザで開いたときは、これまでどおり英語に切り替わる
  { const ctx = await b.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); await p.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200); const t = await p.evaluate(() => document.title); if (/^東京うさぎオフィス/.test(t)) note(58, '英語のブラウザの人に英語で出なくなった'); await ctx.close(); }
  // ?lang=ja の canonical は /
  { const { p, ctx } = await open(1280, 800, 'ja'); const c = await p.evaluate(() => document.querySelector('link[rel=canonical]').href); if (c !== 'https://usagi.coana.co.jp/') note(58, '?lang=ja の canonical ' + c); await ctx.close(); }
}
// 63（2026-11-24）：動画を全部消して出し直した。LP には動画の長さ・3本で1話などの決まり・公開の時刻を書かない
{ const all = JSON.stringify(T.T) + fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
  const bad = [/\d+\s*[〜~–-]\s*\d+\s*(秒|SEC|seconds|초)/i, /\d+\s*(秒|sec)\s*(ほど|くらい|前後)/i, /3\s*(本|話)で\s*1/, /(月・木・土|Mon(day)?, Thu(rsday)?)[^"<]{0,12}\d{1,2}:\d{2}/, /18:00（日本時間）/];
  for (const re of bad) { const m = all.match(re); if (m) note(63, '決まりごとの文が残っている：' + m[0]); }
  const { p, ctx } = await open(1440, 900, 'ja');
  const r = await p.evaluate(() => ({ linked: document.querySelectorAll('#dayTrack .day-card.has-ep').length, cards: document.querySelectorAll('#dayTrack .day-card').length, eps: __RJ.EPS.map((e) => e.ep) }));
  if (r.cards) note(63, '「ある一日」が残っている（2026-11-24 に外した）');
  const gone = ['hanko', 'elevator2', 'lastsheet', 'pom_debut', 'jil_morning2'].filter((x) => r.eps.includes(x)); if (gone.length) note(63, '消した回が一覧に残っている：' + gone.join(','));
  for (const d of ['ep/hanko/', 'ep/elevator2/', 'en/ep/hanko/']) if (fs.existsSync(new URL('../' + d, import.meta.url))) note(63, '消した回のページが残っている：' + d);
  await ctx.close(); }
// 64（2026-11-24）：キャラクターの札の名前の高さがそろっている
for (const [w, h] of [[320, 640], [375, 812], [390, 844], [430, 932], [641, 900], [700, 1000], [768, 1024], [820, 1180], [860, 1000], [1024, 768], [1280, 800], [1440, 900], [1920, 1080], [2560, 1440]]) for (const lang of ['ja', 'en', 'zh', 'ko']) {
  const { p, ctx } = await open(w, h, lang); await p.evaluate(() => document.getElementById('characters').scrollIntoView()); await p.waitForTimeout(500);
  await p.waitForTimeout(1600); const r = await p.evaluate(() => { document.getAnimations().forEach((x) => { try { x.finish(); } catch (e) {} }); const rows = {}; document.querySelectorAll('.chars .char-front').forEach((c) => { const k = Math.round(c.closest('.char').offsetTop); (rows[k] = rows[k] || []).push(c); });
    const bad = []; Object.values(rows).forEach((row) => { if (row.length < 2) return; for (const q of ['.char-name', '.char-text', '.char-tags', '.char-more']) { const ys = row.map((c) => { let el = c.querySelector(q), y = 0; while (el && el !== c) { y += el.offsetTop; el = el.offsetParent; } return y; }); /* 動き（出てくる演出）に左右されない位置で比べる */ if (Math.max(...ys) - Math.min(...ys) > 2) bad.push(q + ' ' + ys.map(Math.round).join('/')); } }); return bad; });
  if (r.length) note(64, w + ' ' + lang + ' ずれ：' + r.join('、')); await ctx.close(); }
await b.close();
const ids = Object.keys(CHECKS).map(Number).sort((a, b) => a - b);
const lines = ids.map((id) => `${fail[id] ? 'NG' : 'OK'} ${String(id).padStart(2)} ${CHECKS[id]}${fail[id] ? '\n     - ' + [...fail[id]].slice(0, 6).join('\n     - ') + (fail[id].size > 6 ? `\n     …ほか ${fail[id].size - 6}` : '') : ''}`);
const ng = ids.filter((id) => fail[id]).length;
const rep = `# 検査 ${ROUND}（${new Date().toISOString()}）\n画面 ${VIEWS.length} × 言語 ${LANGS.length} ＋ 動きを減らす・保存・取得失敗・動画 = ${VIEWS.length * LANGS.length + 4} 通り／検査項目 ${ids.length}\n合格 ${ids.length - ng}・不合格 ${ng}\n\n` + lines.join('\n') + '\n';
fs.mkdirSync(new URL('./reports/', import.meta.url), { recursive: true }); fs.writeFileSync(new URL(`./reports/${ROUND}.md`, import.meta.url), rep);
console.log(rep); process.exit(ng ? 1 : 0);
