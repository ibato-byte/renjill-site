#!/usr/bin/env python3
"""案内役の 3D（guide3d.js）用の絵を作る。使い方：python3 tools/make_g3d.py
img/char/{ren,jill}_{open,blink,happy}.webp → img/g3d/atlas.webp（2048x1024、512 のますが 4 列 × 2 段）
  列：ふだん / まばたき / にっこり / 奥行き（白いほど手前）。段：レン / ジル
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
CELL, PAD = 512, 16
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
    im = Image.fromarray((h * 255).astype(np.uint8)).resize((INNER, INNER), Image.BICUBIC).filter(ImageFilter.GaussianBlur(3))
    return np.array(im).astype(np.float32) / 255.0

atlas = np.zeros((CELL * 2, CELL * 4, 4), np.float32)
for row, who in enumerate(("ren", "jill")):
    base_alpha = None
    for col, face in enumerate(("open", "blink", "happy")):
        im = Image.open(f"{ROOT}/img/char/{who}_{face}.webp").convert("RGBA").resize((INNER, INNER), Image.LANCZOS)
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
    cell = np.dstack([d, d, d, np.ones_like(d)])
    atlas[row * CELL: (row + 1) * CELL, 3 * CELL: 4 * CELL, 3] = 1
    atlas[row * CELL + PAD: row * CELL + PAD + INNER, 3 * CELL + PAD: 3 * CELL + PAD + INNER] = cell
out = Image.fromarray((np.clip(atlas, 0, 1) * 255).astype(np.uint8), "RGBA")
os.makedirs(f"{ROOT}/img/g3d", exist_ok=True)
out.save(f"{ROOT}/img/g3d/atlas.webp", quality=88, method=6, exact=True)
print("img/g3d/atlas.webp", out.size, os.path.getsize(f"{ROOT}/img/g3d/atlas.webp") // 1024, "KB")
