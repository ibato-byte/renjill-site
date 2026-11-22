// 「ある一日」の 9 枚（img/day/*.webp、720×450）を、アニメの道具（renjill-auto の rig）の 1 コマから切り出して作る。
// 使い方：NODE_PATH=<playwright のある所> node tools/make_day.mjs <renjill-auto のフォルダ>   （そのあと webp に：python3 で tools/day.json の通りに切る。下の SHOTS が場所と時間）
// アニメの絵が変わったら（2026-11-16：東京うさぎオフィスの手足の作り込み）、これを実行し直す。
// 8・9 は頭のアップで手足が写らないので、元の絵のまま（作った時の回・時間が分からない。手足や顔を変えたら、ここに足して作り直す）
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const AUTO = process.argv[2] || '../renjill-auto', OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'img', 'day');
// [番号, 回, 何コマ目（40 等分の i 番目のまん中）, 切り出す左上 x, y, 幅]（1080×1920 の座標。高さは幅 × 450/720）
const SHOTS = [[1, 'jil_morning2', 23, 664, 1332, 312], [2, 'meeting2', 5, 0, 420, 1080], [3, 'camera_off2', 7, 384, 612, 696], [4, 'hanko', 31, 156, 736, 864],
  [5, 'papers2', 16, 264, 644, 648], [6, 'mug2', 6, 0, 936, 864], [7, 'receipts2', 16, 172, 508, 648]];
const b = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC } : {}); const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 2 });
for (const [n, ep, i, x, y, w] of SHOTS) { await p.goto('file://' + path.resolve(AUTO, 'rig/ep.html') + '?ep=' + ep + '&nohook=1'); await p.waitForTimeout(800);
  const dur = await p.evaluate(() => outDur()); await p.evaluate(t => window.setOut(t), dur * (i + .5) / 40); await p.waitForTimeout(300);
  const png = `/tmp/day_${n}.png`; await p.screenshot({ path: png, clip: { x, y, width: w, height: Math.round(w * 450 / 720) } });
  execFileSync('python3', ['-c', `from PIL import Image\nImage.open('${png}').convert('RGB').resize((720,450), Image.LANCZOS).save('${OUT}/${n}.webp','WEBP',quality=86,method=6)`]); console.log(n, ep); }
await b.close();
