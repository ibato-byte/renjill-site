#!/usr/bin/env python3
"""案内役の 3D（guide3d.js）用の絵を作る。使い方：python3 tools/make_g3d.py
/tmp/char_hi/{ren,jill}_{open,blink,happy}.png（tools/char_from_rig.py が作る大きい絵。無ければ img/char/*.webp）→ img/g3d/atlas.webp（4096x2048、1024 のますが 4 列 × 2 段）
  列：ふだん / まばたき / にっこり / 奥行き（白いほど手前）。段：モチ / ユズ
- 絵に描きこまれた足もとの影は消す（3D では影を別に描くので、跳ねたとき影がついてこないように）
- 奥行きは、体の形をふくらませて作る（輪郭で 0、まん中ほど高い）。絵を差し替えたら、これを実行し直す
"""
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
from scipy.sparse import lil_matrix
from scipy.sparse.linalg import spsolve
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CELL, PAD = 1024, 32  # 2026-11-16：512 では手足の指やかげがつぶれた（オーナー「LP の動くモチとユズの足が質の低いまま」）→ 2 倍に
INNER = CELL - PAD * 2

def body_alpha(a):
    """足もとの影（うすい灰色）を消した不透明度。体でいちばん大きいかたまりの近くだけ残す"""
    al = a.astype(np.float32) / 255.0
    t = np.clip((al - 0.14) / (0.34 - 0.14), 0, 1)
    soft = al * (t * t * (3 - 2 * t))
    lab, n = ndimage.label(al > 0.5)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        keep = lab == (1 + int(np.argmax(sizes)))
    else:
        keep = lab > 0
    near = ndimage.binary_dilation(keep, iterations=10)
    return soft * near

def inflate(mask):
    """体の形をふくらませる：輪郭で 0 のなだらかな山（ポアソン方程式）→ 丸みをつける"""
    S = 128
    m = np.array(Image.fromarray((mask * 255).astype(np.uint8)).resize((S, S), Image.LANCZOS)) > 110
    idx = -np.ones((S, S), int); ys, xs = np.where(m); idx[ys, xs] = np.arange(len(ys))
    A = lil_matrix((len(ys), len(ys))); b = np.ones(len(ys))
    for k, (y, x) in enumerate(zip(ys, xs)):
        A[k, k] = 4
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < S and 0 <= xx < S and idx[yy, xx] >= 0: A[k, idx[yy, xx]] = -1
    h = np.zeros((S, S)); h[ys, xs] = spsolve(A.tocsr(), b)
    h = np.sqrt(h / h.max())
    im = Image.fromarray((h * 255).astype(np.uint8)).resize((INNER, INNER), Image.BICUBIC).filter(ImageFilter.GaussianBlur(6))
    return np.array(im).astype(np.float32) / 255.0

atlas = np.zeros((CELL * 4, CELL * 4, 4), np.float32)  # 0〜1 段：ふだん（ふつう・まばたき・にっこり・奥行き）／2〜3 段：寝る姿勢（絵・奥行き）。2026-11-17 に 2 段ふやした
for row, who in enumerate(("ren", "jill")):
    base_alpha = None
    for col, face in enumerate(("open", "blink", "happy")):
        im = Image.open(f"/tmp/char_hi/{who}_{face}.png" if os.path.exists(f"/tmp/char_hi/{who}_{face}.png") else f"{ROOT}/img/char/{who}_{face}.webp").convert("RGBA").resize((INNER, INNER), Image.LANCZOS)
        a = np.array(im).astype(np.float32)
        if base_alpha is None: base_alpha = body_alpha(a[..., 3])
        rgb = a[..., :3] / 255.0
        # 透明なところの色を体の色でうめる（縮小したとき、ふちが暗くならないように）
        solid = base_alpha > 0.6
        _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
        rgb = np.where(solid[..., None], rgb, rgb[iy, ix])
        cell = np.dstack([rgb, base_alpha])
        atlas[row * CELL + PAD: row * CELL + PAD + INNER, col * CELL + PAD: col * CELL + PAD + INNER] = cell
    d = inflate(base_alpha) * (base_alpha > 0.05)
    # 緑＝耳の形（耳だけを動かす。前は「耳のあたりの帯」を動かしていて、モチは背中まで一緒に動き、髪の毛のように見えた。2026-11-16）
    ep = f"/tmp/char_hi/{who}_ears.png"
    if os.path.exists(ep):
        ea = np.array(Image.open(ep).convert("RGBA").resize((INNER, INNER), Image.LANCZOS))[..., 3] > 60
        ea = ndimage.binary_dilation(ea, iterations=1)  # 耳の形を広げすぎない（広げると、耳のまわりの体の毛まで一緒に動き、ぎざぎざに見えた。2026-11-17）
        em = np.array(Image.fromarray((ea * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4))).astype(np.float32) / 255.0
    else:
        em = np.zeros_like(d); print("耳の形が無い:", ep, "（tools/char_from_rig.py を先に）")
    # 青＝頭（耳こみ）の形。頭を回す・かしげる時は、この形のところをひとかたまりで動かす
    hpth = f"/tmp/char_hi/{who}_headmask.png"
    if os.path.exists(hpth):
        ha = np.array(Image.open(hpth).convert("RGBA").resize((INNER, INNER), Image.LANCZOS))[..., 3] > 60
        hm = np.array(Image.fromarray((ndimage.binary_dilation(ha, iterations=6) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(16))).astype(np.float32) / 255.0
    else:
        hm = np.zeros_like(d); print("頭の形が無い:", hpth)
    cell = np.dstack([d, em, hm, np.ones_like(d)])
    atlas[row * CELL: (row + 1) * CELL, 3 * CELL: 4 * CELL, 3] = 1
    atlas[row * CELL + PAD: row * CELL + PAD + INNER, 3 * CELL + PAD: 3 * CELL + PAD + INNER] = cell
for row, who in enumerate(("ren", "jill")):  # 前のび（伸び＋あくび）：寝る姿勢の段の、空いている 3・4 列目（2026-11-17）
    fp = f"/tmp/char_hi/{who}_bow.png"
    if not os.path.exists(fp): print("伸びの絵が無い:", fp); continue
    a = np.array(Image.open(fp).convert("RGBA").resize((INNER, INNER), Image.LANCZOS)).astype(np.float32)
    al = body_alpha(a[..., 3]); rgb = a[..., :3] / 255.0; solid = al > 0.6
    _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True); rgb = np.where(solid[..., None], rgb, rgb[iy, ix])
    r0 = (2 + row) * CELL
    atlas[r0 + PAD: r0 + PAD + INNER, 2 * CELL + PAD: 2 * CELL + PAD + INNER] = np.dstack([rgb, al])
    d = inflate(al) * (al > 0.05)
    atlas[r0: r0 + CELL, 3 * CELL: 4 * CELL, 3] = 1
    atlas[r0 + PAD: r0 + PAD + INNER, 3 * CELL + PAD: 3 * CELL + PAD + INNER] = np.dstack([d, np.zeros_like(d), np.zeros_like(d), np.ones_like(d)])
for row, who in enumerate(("ren", "jill")):  # 寝る姿勢（のびて寝る）。tools/char_from_rig.py が /tmp/char_hi/*_flat.png を作る
    fp = f"/tmp/char_hi/{who}_flat.png"
    if not os.path.exists(fp): print("寝る姿勢の絵が無い:", fp); continue
    a = np.array(Image.open(fp).convert("RGBA").resize((INNER, INNER), Image.LANCZOS)).astype(np.float32)
    al = body_alpha(a[..., 3]); rgb = a[..., :3] / 255.0; solid = al > 0.6
    _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True); rgb = np.where(solid[..., None], rgb, rgb[iy, ix])
    r0 = (2 + row) * CELL
    atlas[r0 + PAD: r0 + PAD + INNER, PAD: PAD + INNER] = np.dstack([rgb, al])
    d = inflate(al) * (al > 0.05) * 0.75  # 寝ている体は床に押されて平たい：ふくらみを 3/4 に（2026-11-17）
    atlas[r0: r0 + CELL, CELL: 2 * CELL, 3] = 1
    atlas[r0 + PAD: r0 + PAD + INNER, CELL + PAD: CELL + PAD + INNER] = np.dstack([d, np.zeros_like(d), np.zeros_like(d), np.ones_like(d)])
out = Image.fromarray((np.clip(atlas, 0, 1) * 255).astype(np.uint8), "RGBA")
os.makedirs(f"{ROOT}/img/g3d", exist_ok=True)
out.save(f"{ROOT}/img/g3d/atlas.webp", quality=88, method=6, exact=True)
print("img/g3d/atlas.webp", out.size, os.path.getsize(f"{ROOT}/img/g3d/atlas.webp") // 1024, "KB")

# ---- 2 枚目の絵 atlas2.webp（2048×2048）：ばたん（フロップ）。1 枚目はもう空きが無く、4096 より大きい絵は読めないスマホがあるので、別の 1 枚にする（2026-11-17）
# 段 0＝モチ、段 1＝ユズ。列 0＝絵、列 1＝奥行き（R）
a2 = np.zeros((CELL * 2, CELL * 2, 4), np.float32)
for row, who in enumerate(("ren", "jill")):
    fp = f"/tmp/char_hi/{who}_flop.png"
    if not os.path.exists(fp): print("ばたんの絵が無い:", fp); continue
    a = np.array(Image.open(fp).convert("RGBA").resize((INNER, INNER), Image.LANCZOS)).astype(np.float32)
    al = body_alpha(a[..., 3]); rgb = a[..., :3] / 255.0; solid = al > 0.6
    _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True); rgb = np.where(solid[..., None], rgb, rgb[iy, ix])
    r0 = row * CELL
    a2[r0 + PAD: r0 + PAD + INNER, PAD: PAD + INNER] = np.dstack([rgb, al])
    d = inflate(al) * (al > 0.05) * 0.8
    a2[r0: r0 + CELL, CELL: 2 * CELL, 3] = 1
    a2[r0 + PAD: r0 + PAD + INNER, CELL + PAD: CELL + PAD + INNER] = np.dstack([d, np.zeros_like(d), np.zeros_like(d), np.ones_like(d)])
o2 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "img", "g3d", "atlas2.webp")
Image.fromarray((np.clip(a2, 0, 1) * 255).astype(np.uint8), "RGBA").save(o2, "WEBP", quality=88, method=6, exact=True)
print("img/g3d/atlas2.webp", (CELL * 2, CELL * 2), os.path.getsize(o2) // 1024, "KB")

