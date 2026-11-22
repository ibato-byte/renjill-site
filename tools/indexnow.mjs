// IndexNow（Bing・Yandex・Naver など。無料・登録不要）に「更新しました」と知らせる。
// 鍵は サイト直下の <鍵>.txt（中身も同じ鍵）。Google は対応していないので Search Console のサイトマップで知らせる。
// 使い方：node tools/indexnow.mjs（失敗してもエラーにしない＝公開を止めない）
import fs from 'node:fs';
const HOST = 'usagi.coana.co.jp';
const root = new URL('../', import.meta.url);
const keyFile = fs.readdirSync(root).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) { console.log('IndexNow: 鍵のファイルが無いので何もしません'); process.exit(0); }
const key = keyFile.slice(0, -4);
const sm = fs.readFileSync(new URL('sitemap.xml', root), 'utf8');
const urlList = [...new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&')))];
try {
  const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList }) });
  console.log('IndexNow:', r.status, urlList.length, 'URL');
} catch (e) { console.log('IndexNow: 送れませんでした（公開は続けます）', e.message); }
