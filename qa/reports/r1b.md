# 検査 r1b（2026-11-10T06:19:41.099Z）
画面 7 × 言語 4 ＋ 動きを減らす・保存・取得失敗・動画 = 32 通り／検査項目 50
合格 49・不合格 1

OK  1 title の長さ（15〜70文字）
OK  2 meta description（50〜160文字）
OK  3 canonical が正しい
OK  4 hreflang 4言語＋x-default
OK  5 OGP（title/description/image/url/type）
OK  6 Twitter カード
OK  7 JSON-LD が正しい JSON で、主要な型がある
OK  8 sitemap.xml が正しく、canonical と hreflang を含む
OK  9 robots.txt に sitemap
OK 10 site.webmanifest が正しい JSON（name・icons）
OK 11 llms.txt があり、サイトと同じ事実（毎日・秒数）
OK 12 404.html がある・noindex
OK 13 SNS の URL が全部の場所で同じ
OK 14 文言 T：全部のキーに4言語
NG 15 data-t のキーが T にあり、HTML の初めの文と食い違わない
     - HTML と T がちがう rel.1: 「手伝う（書類が崩れる）」≠「頼りにしてる」
     - HTML と T がちがう rel.2: 「「マグカップは頭の上です」」≠「世話を焼く」
     - HTML と T がちがう rel.3: 「やる気3倍」≠「あこがれ」
     - HTML と T がちがう rel.4: 「教えてもらう」≠「教わる」
     - HTML と T がちがう game.f.winter: 「冬のイルミネーション イベント開催中（1」≠「クリスマス イベント開催中（12/25ま」
OK 16 エピソード EPS：4言語の題・一言
OK 17 事実の矛盾がない（秒数・投稿の頻度・イベント期間・TikTok が早い等の言い過ぎ）
OK 18 http: の読み込みがない
OK 19 img に alt / width・height
OK 20 外部リンク target=_blank に rel=noopener
OK 21 JS エラーがない
OK 22 横スクロールが出ない
OK 23 画面に undefined / NaN / null / {t} が出ない
OK 24 h1 が1つ
OK 25 見出しの順序が飛ばない（h2→h4 など）
OK 26 同じ id が2つない
OK 27 ボタン・リンクに名前がある
OK 28 html の lang が言語と一致
OK 29 title が言語に合わせて変わる
OK 30 言語の切り替えで未翻訳の日本語が残らない（英語ページ）
OK 31 ボタン・タグの文字がはみ出さない
OK 32 スマホでタップ領域が小さすぎない（主要ボタン 40px 以上）
OK 33 ヘッダーと本文が重ならない
OK 34 本文へスキップ リンク
OK 35 画像が読めないときも枠が崩れない
OK 36 エピソードの番号が重複しない・新しい順
OK 37 日付の書式がそろっている
OK 38 次の新作の日付が正しい（毎日）
OK 39 曜日の帯が「毎日」と矛盾しない
OK 40 PICKUP が最新回 or 告知期間に合う
OK 41 動きを減らす設定でアニメーションが止まる
OK 42 ページ内リンク #id の行き先がある
OK 43 キーボードのフォーカスが見える
OK 44 文字のコントラスト（主要な文 4.5:1 以上）
OK 45 エピソード一覧の題がその言語で出る
OK 46 言語の保存と ?lang= が効く
OK 47 ライトボックス（動画）が Esc で閉じる
OK 48 本文の文字が小さすぎない（12px 以上）
OK 49 canonical/hreflang が言語の切り替え後も正しい
OK 50 ページの重さ（HTML 400KB 以下）
