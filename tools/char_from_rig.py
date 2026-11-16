#!/usr/bin/env python3
"""アニメの道具（renjill-auto の rig/portraits.js）で書き出した PNG から、サイトのキャラクターの絵（img/char/*.webp、600×600）を作る。
使い方：
  cd renjill-auto && node rig/portraits.js /tmp/port
  cd renjill-site && python3 tools/char_from_rig.py /tmp/port && python3 tools/make_g3d.py
絵の置き方：見えている部分（影こみ）を切り出し、正方形のまん中・下ぞろえで 600×600 に（2026-11-15 に入れた絵と同じ置き方）。
顔だけの小さな絵（*_head.webp）は足と関係がないので、ここでは作らない。
"""
import sys, os
from PIL import Image
src = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAME = {'ren': 'ren', 'jil': 'jill', 'pom': 'pom'}
for fn in sorted(os.listdir(src)):
    if not fn.endswith('.png'): continue
    who, mood = fn[:-4].split('_', 1)
    im = Image.open(os.path.join(src, fn)).convert('RGBA')
    a = im.getchannel('A').point(lambda v: 255 if v > 6 else 0)
    box = a.getbbox(); im = im.crop(box)
    s = max(im.size); sq = Image.new('RGBA', (s, s), (0, 0, 0, 0)); sq.alpha_composite(im, ((s - im.size[0]) // 2, s - im.size[1]))
    out = os.path.join(ROOT, 'img', 'char', f'{NAME[who]}_{mood}.webp')
    sq.resize((600, 600), Image.LANCZOS).save(out, 'WEBP', quality=90, method=6)
    print(out)
