#!/usr/bin/env python3
"""小さな丸いアイコン用の顔（img/char/{ren,jill,pom}_head.webp・160×160）を作る。使い方：python3 tools/make_heads.py
600 の絵（img/char/*_open.webp）から、丸く切っても耳・顔が全部入る範囲を切り出す。
2026-11-16 オーナー「ゲーム紹介の小さなアイコンのレンの顔が見切れてる」：前の顔は下を水平に切っていて、丸の下半分が空いていた。
キャラクターの絵を差し替えたら、これを実行し直す（qa/check.mjs の 53 番が、丸の中が顔で埋まっているかを見る）。
"""
from PIL import Image
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = {'ren': (360, 238, 222), 'jill': (238, 195, 185), 'pom': (300, 205, 225)}   # 真ん中 x, y と半径（600 の絵の中）
for n, (cx, cy, r) in C.items():
    im = Image.open(f'{ROOT}/img/char/{n}_open.webp').convert('RGBA')
    im.crop((cx - r, cy - r, cx + r, cy + r)).resize((160, 160), Image.LANCZOS).save(f'{ROOT}/img/char/{n}_head.webp', quality=90, method=6)
    print(f'img/char/{n}_head.webp')
