# レンとジル｜Ren & Jill — 公式サイト

うさぎの課長レンと、しっかり者の部下ジル（と新人のポム）のキャラクターブランドサイト。
GitHub Pages で公開する、依存ライブラリなしの単一ファイル（`index.html`）です。

- 公開URL：https://renjill.coana.co.jp/
- 画像・動画は公開リポジトリ `ibato-byte/renjill-media` のファイルを jsDelivr 経由で読み込みます（`https://cdn.jsdelivr.net/gh/ibato-byte/renjill-media@main/...`）。
- ゲーム「チモシーダッシュ（Hay Dash）」は https://hay-dash.coana.co.jp/ にリンク。

## 構成（上から）

1. ヒーロー：巨大な「REN & JILL」の文字が落ちてくる／牧草と書類が舞うキャンバス（カーソルで散る）／カバー画像→動画（PCのみ）／日本時間の時計／TODAY IS・勤務状況・次の新作／PICKUP
   - ヒーローの空いている所をクリックすると「承認」の鼻ハンコが押せる
2. 帯（マーキー）
3. 01 キャラクター：目がカーソルを追う／ホバーでクセ（レンの耳、ジルのメガネ、ポムのほっぺ）／「押してみる？」でカードが裏返りプロフィール／みんなの関係（相関図）／関係図の下に4つの関係の説明カード（ホバーで図の矢印が光る・関連エピソードへのリンク）
4. 02 オフィスのある一日：PC は固定して横スクロール（移動量の約0.6倍のスクロールで終わる短め設定）、時計が 9:00→18:00 に進み、18:00 で牧草が舞う（音ONならチャイム）。スマホは横スワイプ。
5. 03 エピソード：サムネイルは全カード同じ枠（カバー画像の焼き込み枠は切り落として共通の枠を重ねる。カバーが無い回は `cv` の文字をカバーと同じ書式で重ねる。`cv` に新しい文字を使ったら、`<head>` の Noto Sans JP の `text=` にもその文字を足す）／ホバーで動画プレビュー、クリックで YouTube をその場で再生
6. 04 ゲーム：チモシーダッシュ（画面写真・説明・キャラ・遊ぶボタン）
7. 05 フォロー：YouTube / Instagram / TikTok / Facebook / ゲーム、新作の曜日
8. フッター

右端のレール（PC）と右下の「上へ」ボタン、ヘッダーの音（既定OFF）と言語切り替え（日本語 / English / 繁體中文 / 한국어。localStorage に保存。初回はブラウザの言語で判定し、それ以外は英語）。

言語は4つに絞っています（日本・英語圏・台湾／香港・韓国＝セリフのないかわいい系コメディのファンが実際に多く、SNS がすべて使える地域）。中国本土向けの簡体字は、YouTube / Instagram / TikTok が使えず SNS に誘導できないため入れていません。増やすときは `T` / `EPS` / `S`（勤務状況）/ `words`（帯）/ `META` / `LANG_META` の6か所に同じ順番で足します。

## 自動で更新されるもの（サイトを触らなくてよい）

| 何が | どこから | 誰が書く |
|---|---|---|
| 03 エピソード一覧（新作・題・一言・カバー・動画・YouTube ID） | `renjill-media/episodes.json`（raw.githubusercontent、5分ほどで反映） | 投稿の自動化 renjill-auto（投稿のたび） |
| 03 の下の「作業用BGMも、あります。」（長い動画の一覧。新しい順に4本まで。0本なら枠ごと隠れる） | `renjill-media/bgm.json`（`[{date, youtube_id, minutes, thumb, title:{ja,en,zh,ko}}]`。表紙は `renjill-media/bgm_<日付>_thumb.jpg`） | 作業用BGMの自動化 renjill-auto の `auto/bgm.py`（公開するたび） |
| ヒーローのスマホ画面（カバー→動画） | 同上の「公開済みでカバーと動画がある一番新しい回」 | 同上 |
| PICKUP（11/15 以降は「最新回：◯◯」） | 同上 | 同上 |
| 関係カードの「この回を見る」 | 同上（ep 名で照合。YouTube ID が入ればその場で再生） | 同上 |
| 今日の日付・勤務状況・次の新作日 | 日本時間の時計 | 自動 |
| 04 ゲームの NEWS 行（任意） | `hay-dash.coana.co.jp/feed.json` の `news`（`{ja,en,zh,ko}` か文字列）。CORS（`Access-Control-Allow-Origin: *`）が必要 | renjill-game |

投稿の自動化が守ること：新作を投稿したら `episodes.json` に1件足す（`ep`, `date`, `title`/`caption` の4言語, `cover`, `video`, `youtube_id`）。カバーと動画は renjill-media に置く。YouTube ID は公開後に書き足す（無いとカードは YouTube チャンネルへのリンクになる）。

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

### 自動更新（任意）：`renjill-media/episodes.json`
サイトは読み込み時に `https://raw.githubusercontent.com/ibato-byte/renjill-media/main/episodes.json` を取りに行き、あれば埋め込みの一覧より優先します（無ければ埋め込みのまま。失敗しても何も起きません）。投稿パイプライン（renjill-auto）がこのファイルを書けば、サイトを触らずに新作が並びます。

```json
[
  { "ep": "pom_debut", "date": "2026-11-01",
    "title":   { "ja": "新人のポム", "en": "New hire: Pom", "zh": "新人 Pom", "ko": "신입 Pom" },
    "caption": { "ja": "11月1日、…", "en": "On November 1, …" },
    "cover": "20261101_pom_debut_cover.jpg", "video": "20261101_pom_debut.mp4",
    "youtube_id": "xxxxxxxxxxx" }
]
```
- 旧形式 `{ ep, date, title, caption_ja, caption_en, youtube_id }` もそのまま読めます。
- zh / ko が無ければ英語→日本語の順で代用。`youtube_id` が無く日付が未来なら「公開予定」。
- 新しい順に並べ替えて表示。埋め込みにしか無い回はそのまま残ります。

### 文言（4言語）
`const T = {...}` に key ごとに `[日本語, 英語, 繁體中文, 한국어]`。HTML 側は `data-t="key"`。エピソードは `EPS` の `title` / `cap` も同じ順番の配列。

同じ key に接尾辞を付けると、条件で差し替わります（無ければ元の文言）。
- `key.touch` … タッチ端末（カーソルが無い）向けの言い回し
- `key.pre` … ポム入社日（`POM_DAY` = 2026-11-01）より前
- `key.late` … `POM_FRESH_UNTIL`（2026-12-01）以降（「NEW」が古くなったとき）

日付はすべて日本時間の暦日（`jstISO()`）で判定します。PICKUP の文言、エピソードの「公開予定」、ポムの紹介文・「NEW 11/1」チップ、関係図の NEW バッジがこれで切り替わります。

### 「オフィスのある一日」のカード
`#dayTrack` の `.day-card`。時刻・題・一言・アイコン。

### SNS のURL
ヘッダー／レール／05 フォロー／JSON-LD の4か所に同じURLがあります。

## 守ること
- 動かすのは transform / opacity（＋canvas）。レイアウトを動かさない。
- `prefers-reduced-motion` では、落下・マーキー・固定横スクロール・粒子・ハンコを止め、完成形を表示する。
- 音は既定OFF。ユーザーが押したときだけ鳴る。
- 数字を捏造しない（再生数・フォロワー数などの実績はサイトに書かない）。
- 外部ライブラリなし（GSAP/Lenis などを足さない）。フォントは Google Fonts（Fredoka / Zen Maru Gothic / IBM Plex Mono）。

## ローカルで見る
```
python3 -m http.server 8000
# http://localhost:8000/
```
