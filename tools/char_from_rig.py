#!/usr/bin/env python3
"""アニメの道具（renjill-auto の rig/portraits.js）で書き出した PNG から、サイトのキャラクターの絵（img/char/*.webp、600×600）を作る。
使い方（3D の案内役の絵 img/g3d/atlas.webp もこの大きい絵から作るので、続けて make_g3d.py を実行する）：
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
BOX = {}
FOOT = 0.058  # 絵の下から足の裏までの割合（guide3d.js の FOOT と同じ）
def flat_cut(who, src):
    """寝る姿勢（*_flat.png）を、同じ場所で撮った「ふだんの絵」（*_flatref.png）と同じ縮尺・同じ足の線・同じまん中で切り出す。
    体が横に長いので正方形は大きくなる。その比（大きさの倍率）を返す（guide3d.js の POSE_R。img/g3d/poses.json に書き、検査 57 が見張る）"""
    ref = Image.open(os.path.join(src, f'{who}_flatref.png')).convert('RGBA'); flat = Image.open(os.path.join(src, f'{who}_flat.png')).convert('RGBA')
    x0, y0, x1, y1 = ref.getchannel('A').point(lambda v: 255 if v > 6 else 0).getbbox(); w, h = x1 - x0, y1 - y0; s = max(w, h)
    cx = x0 - (s - w) // 2 + s / 2; yf = y1 - FOOT * s  # ふだんの絵の正方形のまん中と、足の線
    fx0, fy0, fx1, fy1 = flat.getchannel('A').point(lambda v: 255 if v > 6 else 0).getbbox(); pad = 12
    # 寝る絵は横に長く、頭（ふだんの絵のまん中）から片側へだけのびる。頭を中心にすると正方形の半分が空になり、絵があらくなった（2026-11-17）
    # → 体にぴったり合わせて切り、まん中のずれ（ふだんの絵の大きさを 1 とした数）を返す。足の線はふだんの絵と同じ
    S = max(fx1 - fx0 + 2 * pad, (yf - fy0 + pad) / (1 - FOOT), s); bc = (fx0 + fx1) / 2; b = yf + FOOT * S
    sq = Image.new('RGBA', (int(S), int(S)), (0, 0, 0, 0)); sq.alpha_composite(flat.crop((int(bc - S / 2), int(b - S), int(bc - S / 2) + int(S), int(b - S) + int(S))))
    os.makedirs('/tmp/char_hi', exist_ok=True); sq.save(f'/tmp/char_hi/{NAME[who]}_flat.png'); return [round(S / s, 4), round((bc - cx) / s, 4)]
POSES = {}
for fn in sorted(os.listdir(src), key=lambda f: f.endswith('_ears.png') or f.endswith('_headmask.png')):
    if fn.endswith('_flat.png'): POSES[NAME[fn.split('_')[0]]] = flat_cut(fn.split('_')[0], src); continue
    if fn.endswith('_flatref.png'): continue  # 耳だけの絵は、同じ子の「ふだん」の絵と同じ切り方にするので最後に
    if not fn.endswith('.png'): continue
    who, mood = fn[:-4].split('_', 1)
    im = Image.open(os.path.join(src, fn)).convert('RGBA')
    if mood in ('ears', 'headmask'):  # 3D の案内役で耳だけを動かすための形（サイトには置かない。tools/make_g3d.py が使う）
        box = BOX[who]; im = im.crop(box); s = max(im.size); sq = Image.new('RGBA', (s, s), (0, 0, 0, 0)); sq.alpha_composite(im, ((s - im.size[0]) // 2, s - im.size[1]))
        os.makedirs('/tmp/char_hi', exist_ok=True); sq.save(f'/tmp/char_hi/{NAME[who]}_{mood}.png'); continue
    a = im.getchannel('A').point(lambda v: 255 if v > 6 else 0)
    box = a.getbbox(); im = im.crop(box)
    if mood == 'open': BOX[who] = box
    s = max(im.size); sq = Image.new('RGBA', (s, s), (0, 0, 0, 0)); sq.alpha_composite(im, ((s - im.size[0]) // 2, s - im.size[1]))
    out = os.path.join(ROOT, 'img', 'char', f'{NAME[who]}_{mood}.webp')
    sq.resize((600, 600), Image.LANCZOS).save(out, 'WEBP', quality=90, method=6)
    os.makedirs('/tmp/char_hi', exist_ok=True); sq.save(f'/tmp/char_hi/{NAME[who]}_{mood}.png')  # 3D の案内役用の大きい絵（tools/make_g3d.py が使う。サイトには置かない）
    print(out)
if POSES:
    import json; json.dump({'flat': {k: v[0] for k, v in POSES.items()}, 'flatX': {k: v[1] for k, v in POSES.items()}}, open(os.path.join(ROOT, 'img', 'g3d', 'poses.json'), 'w')); print('poses', POSES)
