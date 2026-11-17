#!/bin/sh
# 動く 3D の案内役のファイルを変えたら実行：index.html の ?v= を、中身の指紋（sha256 の先頭 8 文字）に書きかえる（qa/check.mjs の 57 番が見張る）
cd "$(dirname "$0")/.." || exit 1
for f in guide3d.js img/g3d/atlas.webp img/g3d/atlas2.webp; do h=$(sha256sum "$f" | cut -c1-8); b=$(basename "$f"); sed -i "s#$b?v=[0-9a-z]*#$b?v=$h#" index.html; echo "$f → $h"; done
