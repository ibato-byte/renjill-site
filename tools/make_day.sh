#!/bin/sh
# 「オフィスの、ある一日。」の 9 枚（img/day/*.webp、720×450）を、公開した動画のコマから切り出して作る（2026-11-24 新シリーズ「定時1分前」）。
# tools/day_shots.txt の 1 行 = 番号 Part 何秒 切り出す左上x y 幅（1080×1920 の座標。高さは幅×450/720）。動画は usagi-office-media の 20261124_teiji59_<Part>.mp4
# 使い方：sh tools/make_day.sh <usagi-office-media のフォルダ>   ※動画を出し直したら、場面を選び直してこれを実行する（字幕・吹き出しが切れていないか、目で確かめる）
set -e
MEDIA=${1:-../usagi-office-media}; D=$(dirname "$0"); OUT=$D/../img/day
while read n v t x y w; do h=$((w*450/720))
  ffmpeg -nostdin -loglevel error -y -ss "$t" -i "$MEDIA/20261124_teiji59_$v.mp4" -frames:v 1 -vf "crop=$w:$h:$x:$y,scale=720:450:flags=lanczos" "/tmp/day_$n.png"
  python3 -c "from PIL import Image; Image.open('/tmp/day_$n.png').convert('RGB').save('$OUT/$n.webp','WEBP',quality=86,method=6)"
  echo "$n Part$v ${t}s"
done < "$D/day_shots.txt"
