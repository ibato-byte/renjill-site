# レンとジル｜Ren & Jill — 公式サイト

うさぎの課長レンと、しっかり者の部下ジル（と新人のポム）のキャラクターブランドサイト。
GitHub Pages で公開する、依存ライブラリなしの単一ファイル（`index.html`）です。

- 公開URL：https://ibato-byte.github.io/renjill-site/
- 画像・動画は公開リポジトリ `ibato-byte/renjill-media` のファイルを jsDelivr 経由で読み込みます（`https://cdn.jsdelivr.net/gh/ibato-byte/renjill-media@main/...`）。
- ゲーム「チモシーダッシュ（Hay Dash）」は https://renjill-hay-dash.pages.dev/ にリンク。

## 構成（上から）

1. ヒーロー：巨大な「REN & JILL」の文字が落ちてくる／牧草と書類が舞うキャンバス（カーソルで散る）／カバー画像→動画（PCのみ）／日本時間の時計／TODAY IS・勤務状況・次の新作／PICKUP
   - ヒーローの空いている所をクリックすると「承認」の鼻ハンコが押せる
2. 帯（マーキー）
3. 01 キャラクター：目がカーソルを追う／ホバーでクセ（レンの耳、ジルのメガネ、ポムのほっぺ）／「押してみる？」でカードが裏返りプロフィール／みんなの関係（相関図）
4. 02 オフィスのある一日：PC は固定して横スクロール、時計が 9:00→18:00 に進み、18:00 で牧草が舞う（音ONならチャイム）
5. 03 エピソード：ホバーで動画プレビュー、クリックで YouTube をその場で再生
6. 04 ゲーム：チモシーダッシュ（牧草カウンターは押して遊べる飾り）
7. 05 フォロー：YouTube / Instagram / TikTok / Facebook / ゲーム、新作の曜日
8. フッター

右端のレール（PC）と右下の「上へ」ボタン、ヘッダーの音（既定OFF）と言語切り替え（日本語 / English / 繁體中文 / 한국어。localStorage に保存。初回はブラウザの言語で判定し、それ以外は英語）。

言語は4つに絞っています（日本・英語圏・台湾／香港・韓国＝セリフのないかわいい系コメディのファンが実際に多く、SNS がすべて使える地域）。中国本土向けの簡体字は、YouTube / Instagram / TikTok が使えず SNS に誘導できないため入れていません。増やすときは `T` / `EPS` / `S`（勤務状況）/ `words`（帯）/ `META` / `LANG_META` の6か所に同じ順番で足します。

## 更新のしかた

### エピソードを足す
`index.html` の `const EPS = [...]` に1件足す（新しい順＝配列の先頭）。

```js
{ ep: "xxxx", title: ["日本語タイトル", "English title", "繁體中文標題", "한국어 제목"], cap: ["日本語の一言", "English caption", "繁體中文一句", "한국어 한 줄"],
  cover: "20261103_xxxx_cover.jpg",  // renjill-media にあるカバー（無ければ省略→YouTube のサムネイル）
  video: "20261103_xxxx.mp4",        // renjill-media にある動画（無ければ省略→プレビューなし）
  yt: "YouTubeの動画ID",              // 無ければ省略（soon:true で「公開予定」）
  date: "2026.11.03" },
```

### 文言（4言語）
`const T = {...}` に key ごとに `[日本語, 英語, 繁體中文, 한국어]`。HTML 側は `data-t="key"`。エピソードは `EPS` の `title` / `cap` も同じ順番の配列。

### 「オフィスのある一日」のカード
`#dayTrack` の `.day-card`。時刻・題・一言・アイコン。

### SNS のURL
ヘッダー／レール／05 フォロー／JSON-LD の4か所に同じURLがあります。

## 守ること
- 動かすのは transform / opacity（＋canvas）。レイアウトを動かさない。
- `prefers-reduced-motion` では、落下・マーキー・固定横スクロール・粒子・ハンコを止め、完成形を表示する。
- 音は既定OFF。ユーザーが押したときだけ鳴る。
- 数字を捏造しない（牧草カウンターは「押して遊ぶ」飾りで、実績ではない）。
- 外部ライブラリなし（GSAP/Lenis などを足さない）。フォントは Google Fonts（Fredoka / Zen Maru Gothic / IBM Plex Mono）。

## ローカルで見る
```
python3 -m http.server 8000
# http://localhost:8000/
```
