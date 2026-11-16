/* レンとジルの「案内役」— スクロールに合わせて、2 人が 3D でページを案内する（2026-11-15／磨き込み 11-16）
 *
 * しくみ（外部ライブラリなし・WebGL を直接書いている）
 *  - 絵は img/g3d/atlas.webp の 1 枚（表情 3 種＋奥行き）。作り直しは tools/make_g3d.py
 *  - 奥行きの絵で、板を体の形にふくらませる（レリーフ）。向きを変えると本当に立体に見え、光の当たり方も変わる
 *  - カメラは本物の遠近（Z の奥行き）。z=0 の面が画面の 1px と一致するので、HTML の位置とぴったり合う
 *  - 立つ場所は HTML の <i class="g3d-spot" data-act="…">（見出しの線の上など。CSS で決める＝画面の幅ごとに調整できる）
 *    画面の上から 78% より上に来た最後の場所へ、2 人が跳ねて移動する。着いたら、その場所に貼りつく（ページと一緒に動く）
 *  - data-act：着いたときのしぐさと、頭の上に出す印（字ではなく絵）
 *      hint（下へ）／wave（♪）／nap（レンが居眠り Zz）／watch（▶）／play（★）／follow（♥）／ask（?）
 *  - 動かない条件：動きを減らす設定・通信量の節約・WebGL が無い／遅い機械。そのときは何も足さない（元の絵のまま）
 *    動かしてみて遅い機械では、自動で画質を下げ、それでも遅ければ止めて元の絵に戻す
 *    確かめるとき：?g3d=1（遅い機械でも動かす）／?g3d=0（止める）
 */
(() => {
  "use strict";
  const Q = new URLSearchParams(location.search).get("g3d");
  const conn = navigator.connection || {};
  if (Q === "0") return;
  const mqReduce = matchMedia("(prefers-reduced-motion: reduce)");
  if (mqReduce.matches || conn.saveData) return;
  const cv = document.getElementById("g3d");
  if (!cv) return;
  let gl = null;
  try {
    const opt = { alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: Q !== "1" };
    gl = cv.getContext("webgl", opt) || cv.getContext("experimental-webgl", opt);
  } catch (e) { gl = null; }
  if (!gl) return;

  const root = document.documentElement, wrap = document.getElementById("g3dWrap");
  // 3D の画面はページの中に置き、描いたときのスクロール位置へ動かす（素早いスライドでもページとずれない。2026-11-16）
  let docH = 0; const ftr = document.querySelector("footer");
  // ページの終わり（フッターの下）を測る。画面の高さで測ると、この画面自身の高さが入って縮まなくなる
  const docEnd = () => ftr ? Math.ceil(ftr.getBoundingClientRect().bottom + scrollY) : root.scrollHeight;
  const fitWrap = () => { if (!wrap) return; docH = docEnd(); wrap.style.height = docH + "px"; };
  let placedY = -1; const place = (y) => { if (!wrap) return; const yy = Math.max(0, Math.min(y, docH - (cv.clientHeight || innerHeight))); if (yy !== placedY) { placedY = yy; cv.style.transform = "translate3d(0," + yy + "px,0)"; } return yy; };
  const state = { ready: false, lost: false, frames: 0, active: -1, chars: [], bubbles: [], quality: 1 };
  window.__g3d = state;

  /* ───────── 絵のます目（tools/make_g3d.py と同じ数字） ───────── */
  const AW = 4096, AH = 2048, CELL = 1024, PAD = 32, INNER = CELL - PAD * 2; // 2026-11-16：512 では手足がつぶれたので 2 倍（絵の割合は前と同じ）
  const tile = (col, row) => [(col * CELL + PAD) / AW, (row * CELL + PAD) / AH, INNER / AW, INNER / AH];
  const FACE = { open: 0, blink: 1, happy: 2 };
  const FOOT = 0.058;      // 絵の下から足の裏までの割合
  const GRID = 72;         // 板の分割数（2026-11-16：耳の形のとおりに動かすので、40 から細かく）
  const DEPTH = 0.27;      // ふくらみの厚さ（絵の幅に対して）
  const FOV = 30 * Math.PI / 180;
  const ICONS = ["down", "note", "zz", "play", "star", "heart", "ask", "bang"];
  const NAP_AT = 0.3;      // 居眠りの場所に着いてから、目を閉じるまでの秒数（Zz はそのあと）
  const ACTS = { hint: "down", wave: "note", nap: "zz", watch: "play", play: "star", follow: "heart", ask: "ask" };

  /* ───────── シェーダー ───────── */
  const VS_CHAR = `
attribute vec2 aUv; attribute vec3 aD; // aD.x＝奥行き、aD.y＝耳の形（1＝耳）、aD.z＝頭（耳こみ）の形
uniform mat4 uP; uniform vec3 uPos; uniform float uSize; uniform vec3 uRot; uniform vec2 uSq; uniform vec2 uLag;
uniform vec4 uEar; uniform vec4 uEarP; uniform vec4 uHead; uniform vec4 uNose; uniform vec4 uBelly; uniform vec4 uHop; // うさぎ跳び：x＝のび、y＝ちぢみ（背中を丸める）、z＝進む向き（-1・0・1）、w＝前足の着地
varying vec2 vUv;
vec2 rot2(vec2 q, vec2 c, float a) { vec2 d = q - c; float cs = cos(a), sn = sin(a); return c + vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs); }
void main() {
  float top = max(aUv.y - ${FOOT.toFixed(3)}, 0.0) / ${(1 - FOOT).toFixed(3)};
  vec2 q = aUv; float plant = smoothstep(${FOOT.toFixed(3)}, ${(FOOT + 0.1).toFixed(3)}, q.y);
  if (uEarP.w < 0.5) {
    float wy = smoothstep(uEarP.z, uEarP.z + 0.08, q.y), mid = 0.5 * (uEarP.x + uEarP.y);
    float mL = aD.y * (1.0 - smoothstep(mid - 0.02, mid + 0.02, q.x)), mR = aD.y * smoothstep(mid - 0.02, mid + 0.02, q.x); // 耳の形のところだけ（頭や体はついてこない）
    q.y -= (q.y - uEarP.z) * uEar.w * wy * max(mL, mR);
    q = rot2(q, vec2(uEarP.x, uEarP.z), uEar.x * wy * mL);
    q = rot2(q, vec2(uEarP.y, uEarP.z), uEar.y * wy * mR);
  } else {
    // たれ耳：付け根（上）は動かず、先ほど大きく動く。動かすのは耳の形のところだけ（前は耳のあたりの縦の帯ごと動かしていて、レンは背中まで動き、髪の毛のように見えた。2026-11-16）
    float wy = smoothstep(uEarP.z, uEarP.z - 0.36, q.y), mid = 0.5 * (uEarP.x + uEarP.y);
    float mL = aD.y * (1.0 - smoothstep(mid - 0.02, mid + 0.02, q.x)), mR = aD.y * smoothstep(mid - 0.02, mid + 0.02, q.x);
    q = rot2(q, vec2(uEarP.x, uEarP.z), uEar.x * wy * mL);
    q = rot2(q, vec2(uEarP.y, uEarP.z), uEar.y * wy * mR);
    q.y += uEar.z * wy * wy * (mL + mR) * 0.06; q.x += uEar.z * wy * (mR - mL) * 0.025;
  }
  { float wh = aD.z; // 頭と耳をひとかたまりで（前は高さの帯で分けていて、体の前に垂れたレンの耳が途中でちぎれ、ぎざぎざに見えた。2026-11-16）
    q = rot2(q, vec2(uNose.x, uHead.z), uHead.w * wh); q += uHead.xy * wh; }
  { vec2 dn = q - uNose.xy; float wn = exp(-dot(dn, dn) / 0.0009); q.y += uNose.z * wn; q.x -= dn.x * uNose.w * wn; }
  { vec2 db = (q - uBelly.xy) / uBelly.z; float wb = exp(-dot(db, db) * 1.6) * plant; q += (q - uBelly.xy) * vec2(1.0, 0.45) * uBelly.w * wb; }
  { // うさぎ跳び（2026-11-16 オーナー：「移動もうさぎの走り方を忠実に」）。けると前足は前へ・後ろ足は後ろへのびて体が長くなり、着くと足を体の下に集めて背中（お尻の側）が丸く上がる
    float low = 1.0 - smoothstep(0.05, 0.36, q.y), side = (q.x - 0.5) * uHop.z, fr = smoothstep(-0.06, 0.2, side), bk = smoothstep(-0.02, 0.26, -side), body = 1.0 - aD.z;
    q.x += uHop.z * uHop.x * low * (0.085 * fr - 0.11 * bk);                 // 前足を前へ、後ろ足を後ろへ
    q.y += uHop.x * low * (0.035 * fr + 0.05 * bk) * smoothstep(0.0, 0.12, q.y); // のびた足は床からはなれる
    q.x -= (q.x - 0.5) * uHop.y * low * 0.3;                                  // ちぢみ：足を体の下に集める
    q.y += uHop.y * 0.07 * bk * body * smoothstep(0.12, 0.5, q.y) * (1.0 - smoothstep(0.62, 0.9, q.y)); // ちぢみ：お尻の側の背中が丸く上がる
    q.y -= uHop.w * 0.035 * fr * smoothstep(0.2, 0.6, q.y);                   // 前足の着地：肩（進む側）が沈む
    q.x += uHop.z * uHop.x * 0.03 * smoothstep(0.2, 0.7, q.y) * body; }        // のび：胸が前へ出る
  vec3 p = vec3((q.x - 0.5) * uSq.x, (q.y - ${FOOT.toFixed(3)}) * uSq.y, aD.x * ${DEPTH.toFixed(2)} * uSq.x);
  p.xy += uLag * top * top * top;
  float cz = cos(uRot.z), sz = sin(uRot.z); p.xy = vec2(p.x * cz - p.y * sz, p.x * sz + p.y * cz);
  float cx = cos(uRot.x), sx = sin(uRot.x); p.yz = vec2(p.y * cx - p.z * sx, p.y * sx + p.z * cx);
  // 横を向くとき：体はあまり回さず、頭（上のほう）を大きく回す。板を回すと横幅が細って平べったく見えるので、そのぶん幅を戻す（2026-11-16 オーナー「横を向いたレンが平べったい」）
  // 幅を戻す割り算は、角度が大きいと絵を引きのばして壊すので、角度は必ず ±0.6 までに限る。押したときに 1 回転させる案は、真横を向いた瞬間に板の薄さが見えておかしいので、やめた（かわりに、高く跳ねて体を左右に振る）
  float ay = clamp(uRot.y, -0.6, 0.6) * mix(0.45, 1.0, smoothstep(0.22, 0.6, top));
  float cy = cos(ay), sy = sin(ay); p.x /= mix(1.0, cy, 0.85); p.xz = vec2(p.x * cy + p.z * sy, -p.x * sy + p.z * cy);
  vUv = vec2(aUv.x, 1.0 - aUv.y);
  gl_Position = uP * vec4(uPos + p * uSize, 1.0);
}`;
  const FS_CHAR = `
precision mediump float;
uniform sampler2D uT; uniform vec4 uTile; uniform vec4 uDTile; uniform vec3 uL; uniform float uAlpha; uniform float uBias; uniform float uTurn;
uniform vec3 uAmb; uniform vec4 uRim;
varying vec2 vUv;
float dep(vec2 uv) { return texture2D(uT, uDTile.xy + clamp(uv, 0.0, 1.0) * uDTile.zw).r; }
void main() {
  vec4 c = texture2D(uT, uTile.xy + vUv * uTile.zw, uBias);
  float e = 0.014;
  vec3 n = normalize(vec3((dep(vUv - vec2(e, 0.0)) - dep(vUv + vec2(e, 0.0))) * 3.2, (dep(vUv + vec2(0.0, e)) - dep(vUv - vec2(0.0, e))) * 3.2, 1.0));
  float cy = cos(uTurn), sy = sin(uTurn); n.xz = vec2(n.x * cy + n.z * sy, -n.x * sy + n.z * cy);
  float ndl = dot(n, uL);
  float edge = 1.0 - clamp(abs(n.z), 0.0, 1.0);
  vec3 col = c.rgb * uAmb * (0.85 + 0.25 * clamp(ndl, -0.2, 1.0));   // 影の側を暗くしすぎない（隣の子の顔が汚れて見える）
  col += vec3(1.0, 0.93, 0.80) * edge * edge * 0.20 * smoothstep(-0.2, 0.7, ndl);
  col += uRim.rgb * uRim.a * edge * sqrt(edge);   // 暗い背景では、ふちを明るくして体を浮かび上がらせる
  float a = c.a * uAlpha;
  gl_FragColor = vec4(col * a, a);
}`;
  const VS_BLOB = `
attribute vec2 aQ; uniform mat4 uP; uniform vec3 uPos; uniform vec2 uSz; uniform float uAng; varying vec2 vQ;
void main() { vQ = aQ; vec2 q = aQ * uSz; float c = cos(uAng), s = sin(uAng); gl_Position = uP * vec4(uPos + vec3(q.x * c - q.y * s, q.x * s + q.y * c, 0.0), 1.0); }`;
  const FS_BLOB = `
precision mediump float; uniform vec4 uCol; uniform float uRing; varying vec2 vQ;
void main() { float d = length(vQ); float a = mix(smoothstep(1.0, 0.25, d), smoothstep(0.55, 0.8, d) * smoothstep(1.0, 0.86, d), uRing) * uCol.a; gl_FragColor = vec4(uCol.rgb * a, a); }`;
  const FS_ICON = `
precision mediump float; uniform sampler2D uI; uniform vec4 uTile; uniform float uAlpha; varying vec2 vQ;
void main() { vec4 c = texture2D(uI, uTile.xy + (vQ * vec2(0.5, -0.5) + 0.5) * uTile.zw); gl_FragColor = c * uAlpha; }`;

  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader"); return s; };
  const program = (vs, fs, attrs) => {
    const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  };

  /* 頭の上に出す印（字ではなく絵）。2D の canvas に描いて、1 枚の絵として使う */
  const IC = 128;
  const drawIcons = () => {
    const c = document.createElement("canvas"); c.width = IC * ICONS.length; c.height = IC; const g = c.getContext("2d");
    const ink = "#2b1d12", paper = "#fffaf0", gold = "#d9a520", red = "#c8372d", navy = "#1f3a63";
    ICONS.forEach((name, i) => {
      g.save(); g.translate(i * IC + IC / 2, IC / 2); g.scale(IC / 96, IC / 96);
      // 吹き出し（丸＋しっぽ）
      g.lineJoin = "round"; g.lineWidth = 5; g.strokeStyle = ink; g.fillStyle = paper;
      g.beginPath(); g.arc(0, -6, 34, 0, Math.PI * 2); g.moveTo(-12, 22); g.lineTo(-18, 40); g.lineTo(4, 26); g.closePath(); g.stroke(); g.fill();
      g.beginPath(); g.arc(0, -6, 34, 0, Math.PI * 2); g.fill();
      g.translate(0, -6); g.lineWidth = 6; g.lineCap = "round";
      if (name === "down") { g.strokeStyle = navy; g.beginPath(); g.moveTo(0, -17); g.lineTo(0, 15); g.moveTo(-13, 3); g.lineTo(0, 17); g.lineTo(13, 3); g.stroke(); }
      else if (name === "note") { g.fillStyle = gold; g.strokeStyle = gold; g.beginPath(); g.ellipse(-8, 13, 9, 7, -0.4, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(0, 11); g.lineTo(0, -17); g.lineTo(15, -10); g.stroke(); }
      else if (name === "play") { g.fillStyle = red; g.strokeStyle = red; g.lineWidth = 5; g.beginPath(); g.moveTo(-9, -15); g.lineTo(16, 0); g.lineTo(-9, 15); g.closePath(); g.fill(); g.stroke(); }
      else if (name === "star") { g.fillStyle = gold; g.strokeStyle = gold; g.lineWidth = 4; g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 9 : 20, a = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke(); }
      else if (name === "heart") { g.fillStyle = red; g.beginPath(); g.moveTo(0, 18); g.bezierCurveTo(-30, -2, -18, -24, 0, -9); g.bezierCurveTo(18, -24, 30, -2, 0, 18); g.fill(); }
      else if (name === "zz") { g.strokeStyle = navy; g.lineWidth = 5; g.beginPath(); g.moveTo(-17, -12); g.lineTo(-1, -12); g.lineTo(-17, 8); g.lineTo(-1, 8); g.stroke(); g.lineWidth = 4; g.beginPath(); g.moveTo(6, 2); g.lineTo(17, 2); g.lineTo(6, 16); g.lineTo(17, 16); g.stroke(); }
      else if (name === "ask") { g.strokeStyle = navy; g.fillStyle = navy; g.beginPath(); g.arc(0, -8, 10, Math.PI * 1.05, Math.PI * 0.5); g.lineTo(0, 6); g.stroke(); g.beginPath(); g.arc(0, 17, 4, 0, Math.PI * 2); g.fill(); }
      else { g.strokeStyle = red; g.fillStyle = red; g.beginPath(); g.moveTo(0, -18); g.lineTo(0, 5); g.stroke(); g.beginPath(); g.arc(0, 17, 4, 0, Math.PI * 2); g.fill(); }
      g.restore();
    });
    return c;
  };

  let offY = 0;
  let progChar, progBlob, progIcon, tex, texIcon, quadBuf, idxBuf, idxCount, meshes = [], cleared = false;
  const proj = new Float32Array(16);
  let W = 1, H = 1, DPR = 1, camD = 1;

  const build = (img) => {
    progChar = program(VS_CHAR, FS_CHAR, ["aUv", "aD"]);
    progBlob = program(VS_BLOB, FS_BLOB, ["aQ"]);
    progIcon = program(VS_BLOB, FS_ICON, ["aQ"]);
    tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    texIcon = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texIcon);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, drawIcons());
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // 奥行きを頂点に焼きこむ（頂点シェーダーで絵を読めない機械でも動くように）
    const N = GRID + 1, c2 = document.createElement("canvas"); c2.width = N; c2.height = N * 2;
    const g = c2.getContext("2d", { willReadFrequently: true });
    meshes = [0, 1].map((row) => {
      g.clearRect(0, 0, N, N); g.drawImage(img, 3 * CELL + PAD, row * CELL + PAD, INNER, INNER, 0, 0, N, N);
      const px = g.getImageData(0, 0, N, N).data, v = new Float32Array(N * N * 5);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = (j * N + i) * 5, o = ((N - 1 - j) * N + i) * 4; v[k] = i / GRID; v[k + 1] = j / GRID; v[k + 2] = px[o] / 255; v[k + 3] = px[o + 1] / 255; v[k + 4] = px[o + 2] / 255; }
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW); return b;
    });
    const idx = new Uint16Array(GRID * GRID * 6); let q = 0;
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) { const a = j * N + i, b = a + 1, c = a + N, d = c + 1; idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c; }
    idxBuf = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW); idxCount = idx.length;
    quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
  };

  const resize = (force) => {
    const w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, state.quality < 1 ? 1 : (w < 700 ? 2 : 1.75));
    if (!force && w === W && h === H && dpr === DPR) return;
    W = w; H = h; DPR = dpr; cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
    gl.viewport(0, 0, cv.width, cv.height);
    camD = H / (2 * Math.tan(FOV / 2));
    const f = 1 / Math.tan(FOV / 2), near = camD * 0.05, far = camD * 6, nf = 1 / (near - far);
    proj.fill(0); proj[0] = f / (W / H); proj[5] = f; proj[10] = (far + near) * nf; proj[11] = -1; proj[14] = 2 * far * near * nf + (-camD) * proj[10]; proj[15] = camD;
    // ↑ 透視投影 × カメラを z=camD に置く平行移動 をまとめたもの
    cleared = false;
  };

  /* ───────── 立つ場所 ───────── */
  let spots = [], spotInfo = [];
  const findSpots = () => {
    const cur = spots[state.active];
    spots = [...document.querySelectorAll(".g3d-spot")].filter((e) => e.offsetParent !== null);
    spotInfo = spots.map((e) => { const s = e.closest("section"); return { act: e.dataset.act || "", tone: s && s.classList.contains("day") ? 1 : s && s.classList.contains("game") ? 2 : 0 }; });
    if (cur) state.active = spots.indexOf(cur);
  };
  const spotRect = (i) => spots[i] ? spots[i].getBoundingClientRect() : null;

  /* ───────── 2 人 ───────── */
  // fx：場所の箱の中での足の位置（横）／k：箱の高さに対する背の高さ／dz：手前に出す量
  const DEF = [{ name: "ren", row: 0, fx: 0.36, k: 1.0, dz: 0, delay: 0 }, { name: "jill", row: 1, fx: 0.80, k: 0.74, dz: 26, delay: 0.14 }];
  const BODY = [{ ear: [0.30, 0.875, 0.80, 1], nose: [0.58, 0.49], neck: 0.44, belly: [0.60, 0.24, 0.20] },
                { ear: [0.34, 0.525, 0.80, 0], nose: [0.43, 0.53], neck: 0.47, belly: [0.55, 0.26, 0.24] }];
  const spr = (c, k, target, stiff, damp, dt) => { c[k + "V"] += ((target - c[k]) * stiff - c[k + "V"] * damp) * dt; c[k] += c[k + "V"] * dt; };
  const mk = (d) => ({ ...d, x: 0, y: 0, z: 0, size: 100, alpha: 0, mode: "wait", t: 0, dur: 1, hops: 1, hopH: 60, zArc: 0, from: null, exit: null, h: 0, gx: 0, gy: 0, pre: 0,
    face: "open", blinkAt: 1.5 + Math.random() * 3, happyUntil: 0, ry: 0, rx: 0, rz: 0, sq: 1, sqV: 0, lagX: 0, lagXV: 0, lagY: 0, lagYV: 0, dir: 0, hopAt: 0, hop: 0, hopV: 0, seen: false,
    step: d.row * 0.5, trot: 0, hover: false, spinT: -1, lookUntil: 0, lookAt: 6 + Math.random() * 5, actUntil: 0, act: "", awakeUntil: 0, asleep: false, speed: 0, comp: 0, air: 0,
    eL: 0, eLV: 0, eR: 0, eRV: 0, eW: 0, eWV: 0, flap: 0, flapV: 0, hx: 0, hxV: 0, hy: 0, hyV: 0, ht: 0, htV: 0, ext: 0, extV: 0, nose: 0, twPh: 0, twAt: 1 + Math.random() * 2, twUntil: 0,
    br: Math.random() * 6, exert: 0, idle: "", idleT0: 0, idleUntil: 0, idleAt: 9 + Math.random() * 6, calmAt: 0, flickAt: 3 + Math.random() * 5, alertUntil: 0, hopF: -1, binkDir: 1, lastRy: 0, hopE: 0, hopG: 0, hopW: 0, hopDir: 0 });
  const chars = DEF.map(mk); state.chars = chars;
  const puffs = [], rings = [], bubbles = state.bubbles;
  // 奥行きのある牧草（最初の画面だけ。カメラに近いほど大きく、ぼけて、速く流れる）
  const motes = Array.from({ length: 9 }, () => ({ x: (Math.random() - 0.5) * 1.7, y: Math.random(), z: 0.2 + Math.random() * 0.45, a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.5, ph: Math.random() * 6, len: 0.03 + Math.random() * 0.03 }));

  const targetOf = (c, r) => ({ x: r.left + r.width * c.fx, y: r.bottom, size: (r.height * c.k) / (1 - FOOT - 0.085) });
  const onScreen = (r, m) => r.bottom > -m && r.top < H + m && r.right > -m && r.left < W + m;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (t) => t * t * (3 - 2 * t);
  // 最初の画面だけ：スクロールすると 2 人がカメラのほうへ近づく（奥行きのあるスクロール）
  const zBase = (c) => c.dz + (state.active === 0 ? clamp(scrollY / H, 0, 0.8) * camD * 0.2 : 0);   // 画面の高さに比例（横向きのスマホで大きくなりすぎない）
  // ここを押したら 2 人に当たるか（最初の画面の「ハンコ」が、2 人の上に押されないように index.html から使う）
  state.hit = (x, y) => chars.some((c) => c.mode === "sit" && c.alpha > 0.5 && Math.hypot(x - c.x, y - (c.y - c.size * 0.4)) < c.size * 0.5);
  const unsay = (c) => { for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].c === c) bubbles.splice(i, 1); };
  const say = (c, icon, t0, dur) => { unsay(c); bubbles.push({ c, icon, t0, until: t0 + dur }); };

  const launch = (c, now, opt = {}) => {
    const r = spotRect(state.active); if (!r) return;
    const T = targetOf(c, r);
    let fx = c.x, fy = c.y, fz = c.z, fs = c.size || T.size;
    const curOn = c.seen && fy > -fs && fy - fs < H + 40 && fx > -fs && fx < W + fs;
    c.exit = null;
    if (opt.intro) { fx = W * 0.5 + (c.row ? 60 : -60); fy = Math.min(T.y, H * 0.5) - 20; fz = -camD * 1.9; fs = T.size; }
    else if (!curOn) { fx = W + T.size; fy = T.y; fz = 0; fs = T.size; }               // 画面の外にいた → 右の端から走ってくる
    if (!opt.intro && !onScreen(r, T.size)) c.exit = { x: W + fs * 1.2, y: clamp(fy, fs, H - 20) }; // 行き先が画面の外 → 右の端へ出ていく
    c.from = { x: fx, dy: fy + scrollY, z: fz, size: fs };
    const E = c.exit || T, dist = Math.hypot(E.x - fx, E.y - fy);
    c.hops = opt.intro ? 3 : clamp(Math.round(dist / 380), 1, 3);
    c.hopH = clamp(dist / c.hops * 0.3, 28, 110) * (opt.intro ? 1.3 : 1);   // うさぎの跳びは低く長い（前は 0.42：高く上がりすぎて、ボールがはねるように見えた）
    c.zArc = opt.intro ? 0 : clamp(dist * 0.35, 0, 240);
    c.dur = opt.intro ? 1.5 : Math.min(1.15, 0.5 + 0.2 * c.hops + dist / 4200);   // 広い画面でも待たせない
    c.pre = opt.intro || !curOn || c.mode !== "sit" ? 0 : 0.13;                          // 跳ぶ前に、いちど沈む（ため）
    c.idle = ""; c.idNow = ""; c.env = 0; c.loafNow = false; c.calmNow = false; c.calmAt = 0;
    c.t = -c.delay - (opt.wait || 0) - c.pre; c.mode = "fly"; c.dir = Math.sign(E.x - fx) || 0; c.hopDir = c.dir || c.hopDir; c.seen = true; c.hop = 0; c.hopV = 0; c.spinT = -1; c.act = ""; c.hover = false; c.asleep = false;
    unsay(c);
  };

  const land = (c, now) => {
    c.mode = "sit"; c.h = 0; c.z = zBase(c); c.sqV = -3.2; c.happyUntil = now + 1.1;
    c.rx += 0.14; c.hyV -= 0.5; c.flapV -= 5; c.eWV += 3; c.exert = Math.min(1, c.exert + 0.45); c.hopF = -1;
    if (Math.random() < 0.3) { c.idle = "shake"; c.idleT0 = now + 0.55; c.idleUntil = now + 1.05; } c.dir = 0; c.hopAt = now + 4 + Math.random() * 5; c.lookAt = now + 5 + Math.random() * 5;
    if (c.y > 0 && c.y < H + 20) {
      for (let i = 0; i < 5; i++) puffs.push({ x: c.x + (Math.random() - 0.5) * c.size * 0.5, dy: c.y + scrollY - 2, vx: (Math.random() - 0.5) * 90, vy: -20 - Math.random() * 40, r: c.size * (0.05 + Math.random() * 0.05), t: 0 });
      rings.push({ x: c.x, dy: c.y + scrollY, r: c.size * 0.3, t: 0 });
    }
    // 着いたときのしぐさ
    const act = (spotInfo[state.active] || {}).act || "";
    c.act = act; c.actUntil = now + 2.6;
    if (act === "play") c.hopV = 330;
    if (act === "follow") c.happyUntil = now + 2.6;
    const icon = ACTS[act];
    // 居眠り：レンは着いたらすぐ目を閉じ（にっこりしない）、目を閉じてから Zz を出す（2026-11-16 オーナー「Zz が出るのに、寝るのが遅い。合っていない」）
    if (act === "nap" && c.row === 0) { c.happyUntil = 0; say(c, icon, now + NAP_AT + 0.45, 2.4); }
    else if (icon && act !== "hint" && act !== "nap" && c.row === 1) say(c, icon, now + 0.3, 2.4);   // ほかの印はジルが出す
  };

  /* ───────── 入力（ポインター・スクロール） ───────── */
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  let px = -1, py = -1, pAt = -10, lastY = scrollY, vel = 0, lastScrollAt = 0, hintAt = 0;
  addEventListener("pointermove", (e) => { if (e.pointerType === "touch") return; px = e.clientX; py = e.clientY; pAt = performance.now() / 1000; }, { passive: true });
  addEventListener("pointerdown", (e) => {
    const now = performance.now() / 1000;
    for (const c of chars) if (c.mode === "sit" && c.alpha > 0.5 && Math.hypot(e.clientX - c.x, e.clientY - (c.y - c.size * 0.4)) < c.size * 0.5) { c.hopV = 520; c.happyUntil = now + 1.4; c.spinT = 0; c.binkDir = Math.random() < 0.5 ? -1 : 1; c.awakeUntil = now + 8; c.idle = ""; c.flapV += 6; unsay(c); }
  }, { passive: true });


  // 体の中の動き（2026-11-16。調べた動きは docs/RABBIT-MOTION-2026-11-16.md）
  const life = (c, now, dt, other, cur) => {
    const B = BODY[c.row], sit = c.mode === "sit", lop = B.ear[3] > 0.5, id = sit ? c.idNow || "" : "", e = id ? c.env : 0, hf = c.hopF, fly = c.mode === "fly", air = fly && hf >= 0 ? Math.sin(Math.PI * hf) : 0, cs = fly && hf >= 0 ? Math.cos(Math.PI * hf) : 0;
    if (sit && c.calmNow && !c.asleep && !id && now > c.idleAt && introDone) { const r = Math.random(); c.idle = r < 0.45 ? "groom" : r < 0.8 ? "scope" : "stretch"; c.idleT0 = now; c.idleUntil = now + (r < 0.45 ? 2.6 : r < 0.8 ? 2.3 : 1.6); c.idleAt = now + 9 + Math.random() * 9; }
    if (sit && Math.abs(vel) > 1100 && c.calmNow) c.alertUntil = now + 0.7;
    let eL = 0, eR = 0, eW = 0, fl = 0, hx = 0, hy = 0, ht = 0, ex = 0;
    if (!lop) {
      eL = 0.05; eR = -0.05; if (cur && sit) { if (px < c.x) eL = 0.2; else eR = -0.2; }
      if (c.asleep || c.hover || c.loafNow || id === "groom" || c.face === "happy") { eL = 0.24; eR = -0.24; eW = 0.22; }
      if (now < c.alertUntil || id === "scope") { eL = -0.02; eR = 0.02; eW = -0.07; }
      if (fly) { eW = 0.32 * air + (cs > 0 ? 0.1 : 0); eL = 0.08; eR = -0.08; }
      eW += 0.12 * c.trot + (sit && c.hop > 0 ? clamp(c.hopV / 2000, -0.1, 0.2) : 0);
    } else {
      eL = eR = clamp(-c.rz * 0.8, -0.2, 0.2) + (c.asleep ? Math.sin(c.br) * 0.02 : 0);
      fl = fly ? -cs * 0.9 : clamp(-c.hopV / 450, -1, 1) * 0.7 - (c.lope || 0) * 0.35 * c.trot;
      c.eLV -= (c.ry - c.lastRy) * 26; c.eRV -= (c.ry - c.lastRy) * 26;
    }
    c.lastRy = c.ry;
    if (sit && !c.asleep && id !== "groom" && now > c.flickAt) { c.flickAt = now + 3.5 + Math.random() * 6; if (lop) { c.eLV += 2.2; c.eRV -= 2.2; } else if (Math.random() < 0.5) c.eLV += 7; else c.eRV -= 7; }
    if (id === "shake" && now > c.idleT0 && now < c.idleT0 + 0.05) { c.eLV += 6; c.eRV -= 6; c.flapV += 5; }
    const k = lop ? 90 : 230, d = lop ? 4 : 10; spr(c, "eL", eL, k, d, dt); spr(c, "eR", eR, k, d, dt); spr(c, "eW", eW, 170, 12, dt); spr(c, "flap", fl, 110, 5.5, dt);
    if (fly) { if (hf >= 0) { hx = c.dir * 0.02 * air; hy = 0.014 * cs; ex = (c.dir ? 0.08 : 0.03) * air; } else if (c.pre > 0) hy = -0.02; }
    else {
      hy = (c.lope || 0) * 0.006 * c.trot;
      if (c.sniff) { hx = clamp((px - c.x) / c.size, -1, 1) * 0.03; hy = clamp((c.y - c.size * 0.5 - py) / c.size, -1, 1) * 0.015; }
      else if (cur && !c.hover && now - pAt > 0.8) ht = (px < c.x ? 1 : -1) * 0.1;
      if (c.hover) hy = -0.03;
      if (id === "groom") { const t = now - c.idleT0; hy = -0.035 * e; hx = Math.sin(t * 16.3) * 0.014 * e; ht = Math.sin(t * 8.2) * 0.14 * e; }
      if (id === "scope") hy = 0.03 * e;
      if (id === "stretch") { hy = -0.02 * e; ex = 0.12 * e; }
      if (c.asleep) { hy = -0.03; ht = 0.12; }
      if (c.row && other.asleep && !cur) hx = Math.sign(other.x - c.x) * 0.015;
      if (c.loafNow) ex = -0.02;
    }
    if (c.spinT >= 0) { hx += Math.sin(c.spinT * 22) * 0.025 * (1 - c.spinT); ex += 0.1 * Math.sin(Math.PI * c.spinT); }
    spr(c, "hx", hx, 160, 14, dt); spr(c, "hy", hy, 160, 14, dt); spr(c, "ht", ht, 120, 12, dt); spr(c, "ext", ex, 120, 12, dt);
    for (const [n, m] of [["eL", 0.45], ["eR", 0.45], ["flap", 1.2], ["hx", 0.06], ["hy", 0.06], ["ht", 0.25]]) c[n] = clamp(c[n], -m, m);
    c.eW = clamp(c.eW, -0.12, 0.42); c.ext = clamp(c.ext, -0.05, 0.18);
    if (now > c.twAt && now > c.twUntil) { c.twUntil = now + 1 + Math.random() * 2.2; c.twAt = c.twUntil + 0.8 + Math.random() * 3; }
    c.twPh += dt * (c.sniff ? 8 : 5 + 2 * c.exert) * 6.283;
    c.nose = !(c.asleep || c.hover || id === "groom" || fly) && (c.sniff || now < c.twUntil) ? Math.pow(Math.max(0, Math.sin(c.twPh)), 2) * (c.sniff ? 0.007 : 0.0045) : c.nose * Math.max(0, 1 - dt * 12);
    c.exert = Math.max(0, c.exert - dt / 7); c.br += dt * (c.asleep ? 28 : c.loafNow ? 36 : 42 + 58 * c.exert) / 60 * 6.283;
  };
  /* ───────── 毎フレーム ───────── */
  let last = 0, started = false, raf = 0, introDone = false, introAt = -10, slow = 0, fast = 0;
  const tone = [0, 0];
  const heroGo = () => { const h = document.getElementById("hero"); return !h || h.classList.contains("go") || scrollY > 40 || performance.now() > 7000; };

  const pickActive = () => {
    let a = -1;
    for (let i = 0; i < spots.length; i++) { const r = spots[i].getBoundingClientRect(); if (r.height > 0 && r.bottom < H * 0.78 + (i === 0 ? 1e6 : i === state.active ? 70 : 0)) a = i; }   // いまの場所は 70px ぶん粘る（境目で行ったり来たりしない）
    return a;
  };

  const frame = (ms) => {
    raf = requestAnimationFrame(frame);
    if (state.lost) return;
    const now = ms / 1000, rawDt = last ? now - last : 0.016, dt = Math.min(0.05, rawDt); last = now;
    resize();
    if (wrap && (state.frames & 15) === 0 && Math.abs(docEnd() - docH) > 2) fitWrap();
    const sy = scrollY, dy = sy - lastY, v = dy / Math.max(dt, 0.001); lastY = sy; vel += (v - vel) * Math.min(1, dt * 10);
    if (Math.abs(dy) > 0.5) lastScrollAt = now;
    if (!spots.length) findSpots();
    if (!started) { if (!heroGo() || !spots.length) return; started = true; root.classList.add("g3d-on"); }
    const a = pickActive();
    if (a !== state.active && a >= 0) {
      const first = state.active < 0 && !chars[0].seen; state.active = a; const intro = first && a === 0 && sy < 40;
      for (const c of chars) launch(c, now, { intro, wait: intro ? 0.3 : 0 });
      if (intro) introAt = now + 0.3; else introDone = true;
    }
    const r = spotRect(state.active), info = spotInfo[state.active] || { act: "", tone: 0 };
    tone[0] += ((info.tone === 1 ? 1 : 0) - tone[0]) * Math.min(1, dt * 4); tone[1] += ((info.tone === 2 ? 1 : 0) - tone[1]) * Math.min(1, dt * 4);
    let visible = false;
    for (const c of chars) {
      if (!r || c.mode === "wait") continue;
      const T = targetOf(c, r), ox = c.x, oy = c.y;
      if (c.mode === "fly") {
        c.t += dt;
        if (c.exit && onScreen(r, 0) && c.t > 0) { launch(c, now); continue; }            // 出ていく途中で行き先が見えた → そこへ向かい直す
        const t = clamp(c.t / c.dur, 0, 1), E = c.exit || T, fy = c.from.dy - sy;
        const u = t * c.hops, hi = Math.min(Math.floor(u), c.hops - 1), f = u >= c.hops ? 1 : u - Math.floor(u);
        const ST = hi > 0 ? 0.14 : 0, fa = clamp((f - ST) / (1 - ST), 0, 1), p = (hi + smooth(fa)) / c.hops;
        c.gx = c.from.x + (E.x - c.from.x) * p; c.gy = fy + (E.y - fy) * p;
        c.h = Math.sin(Math.PI * fa) * c.hopH * (c.t < 0 ? 0 : 1); c.hopF = c.t < 0 ? -1 : fa;
        c.x = c.gx; c.y = c.gy - c.h;
        c.z = c.from.z + (zBase(c) - c.from.z) * smooth(t) + Math.sin(Math.PI * t) * c.zArc;
        c.size = c.from.size + (T.size - c.from.size) * p; c.comp = smooth(t); c.air = clamp(Math.min(t, 1 - t) * 5, 0, 1);
        c.alpha = c.t < 0 ? (c.from.z < -10 ? 0 : c.alpha) : Math.min(1, c.alpha + dt * 5);
        const air = Math.sin(Math.PI * fa), ground = f < ST ? 1 : Math.exp(-Math.pow(Math.min(fa, 1 - fa) / 0.1, 2));
        if (c.t < 0) c.sq = 1 - 0.15 * (c.pre > 0 ? smooth(clamp(1 + c.t / c.pre, 0, 1)) : 0);   // ため
        else c.sq = 1 - 0.07 * Math.pow(air, 0.7) + 0.05 * ground * (t > 0.02 ? 1 : 0);          // 空中は体が長く低い・着いた時は背中が丸く高い（前は逆に、空中で縦にのびていた）
        // うさぎ跳びの形：のびは、けった直後がいちばん大きい。着く少し前から前足を下ろし、前足 → 後ろ足の順に着く
        { const pre = c.t < 0 ? (c.pre > 0 ? smooth(clamp(1 + c.t / c.pre, 0, 1)) : 0) : 0, ext = c.t < 0 ? 0 : Math.pow(Math.sin(Math.PI * Math.min(1, fa * 1.12)), 0.75) * (fa < 0.9 ? 1 : (1 - fa) / 0.1);
          const front = c.t < 0 ? 0 : Math.exp(-Math.pow((fa - 0.9) / 0.07, 2)), gath = Math.max(pre, c.t < 0 ? 0 : ground * (t > 0.02 ? 1 : 0));
          const k = Math.min(1, dt * 22); c.hopE += (ext - c.hopE) * k; c.hopG += (gath - c.hopG) * k; c.hopW += (front - c.hopW) * k; }
        c.rz += ((c.dir * (0.13 * Math.cos(Math.PI * fa) - 0.03) * (c.t < 0 ? 0 : 1)) - c.rz) * Math.min(1, dt * 12); // けった時は鼻が上、着く時は鼻が下（前足から着く）
        if (t >= 1) { if (c.exit) { c.mode = "sit"; c.exit = null; c.h = 0; c.dir = 0; } else land(c, now); if (c.row === chars.length - 1) introDone = true; }
      } else {
        { const k = Math.min(1, dt * 9); c.hopE += (0 - c.hopE) * k; c.hopG += (0 - c.hopG) * k; c.hopW += (0 - c.hopW) * k; } // 着いたあと：のび・ちぢみをゆっくり戻す（お尻が落ちて、おすわりに戻る）
        // 着いたあとは、その場所に貼りつく（ページと一緒に動く）
        c.x = c.gx = T.x; c.gy = T.y; c.size = T.size; c.z = zBase(c); c.alpha = 1; c.comp = 1; c.air = 0;
        const near = fine && now - pAt < 4 && Math.hypot(px - c.x, py - (c.y - c.size * 0.4)) < c.size * 0.42;
        const asleep = info.act === "nap" && c.row === 0 && now > c.awakeUntil && now > c.actUntil - 2.6 + NAP_AT;
        c.hopV -= 2600 * dt; c.hop = Math.max(0, c.hop + c.hopV * dt); if (c.hop === 0 && c.hopV < 0) { if (c.hopV < -200) c.sqV = -2.4; c.hopV = 0; }
        if (introDone && now > c.hopAt && !asleep) { c.hopAt = now + 5 + Math.random() * 6; if (onScreen(r, 0) && Math.abs(vel) < 30) c.hopV = 300; }
        if (c.act === "play" && c.hop === 0 && c.hopV === 0 && now < c.actUntil - 1.9 && now > c.actUntil - 2.2) c.hopV = 300;   // ゲームの所では 2 回跳ねる
        // ページが動いているあいだは、とことこ歩く
        const moving = Math.abs(vel) > 60 && !asleep;
        c.trot += ((moving ? 1 : 0) - c.trot) * Math.min(1, dt * 8); c.step += Math.abs(dy) / 64;
        { const ph = c.step % 1, lope = ph < 0.62 ? Math.sin(Math.PI * ph / 0.62) : 0; c.h = c.hop + lope * Math.min(7, c.size * 0.06) * c.trot; c.lope = (ph < 0.62 ? Math.cos(Math.PI * ph / 0.62) : -1) * c.trot; }
        c.y = T.y - c.h;
        // なでる：カーソルを乗せると、にっこりして少し沈む。乗せた瞬間に 1 回だけ跳ねる
        if (near && !c.hover) { c.happyUntil = now + 1.2; c.awakeUntil = now + 8; if (c.hop === 0) c.hopV = 260; if (asleep) unsay(c); c.idle = ""; }
        if (near) c.happyUntil = Math.max(c.happyUntil, now + 0.3);
        c.hover = near;
        const calm = !near && Math.abs(vel) < 30 && c.hop === 0 && now > c.actUntil; if (!calm || c.calmAt === 0) c.calmAt = calm ? (c.calmAt || now) : 0;
        const loaf = calm && c.calmAt > 0 && now - c.calmAt > 25 && !asleep;
        const id = c.idle && now < c.idleUntil ? c.idle : "", ik = id ? clamp((now - c.idleT0) / (c.idleUntil - c.idleT0), 0, 1) : 0, env = Math.sin(Math.PI * ik);
        const rest = (near ? 0.94 : loaf ? 0.95 : 1) + (id === "scope" ? 0.11 * env : 0) - (id === "stretch" ? 0.08 * env : 0) - (id === "groom" ? 0.03 * env : 0) + Math.sin(c.br) * (asleep ? 0.009 : 0.004);
        c.sqV += (-(c.sq - rest) * 190 - c.sqV * 13) * dt; c.sq += c.sqV * dt; c.sq = clamp(c.sq, 0.7, 1.25);
        let trz = clamp(-vel * 0.00004, -0.12, 0.12);
        if (now < c.actUntil && c.hop === 0) { const k = c.actUntil - now; if (c.act === "wave") trz += Math.sin(k * 11) * 0.09 * clamp(k / 1.2, 0, 1); if (c.act === "ask") trz += (c.row ? -0.16 : 0.12) * clamp(k / 1.0, 0, 1); }
        if (asleep) trz += 0.13 + Math.sin(c.br) * 0.01;
        if (calm && !asleep) trz += Math.sin(now * 0.37 + c.row * 2.3) * 0.014;
        if (id === "shake" && now > c.idleT0) { const k = clamp((now - c.idleT0) / 0.5, 0, 1); trz += Math.sin(k * Math.PI * 9) * 0.1 * (1 - k); c.rz = trz; }
        c.rz += (trz - c.rz) * Math.min(1, dt * 8);
        if (asleep && now > c.lookAt) { c.lookAt = now + 4.2; if (onScreen(r, 0)) say(c, "zz", now, 2.0); }   // 居眠り中は、ときどき Zz
        if (c.asleep && !asleep) { unsay(c); c.idle = "stretch"; c.idleT0 = now; c.idleUntil = now + 1.7; }
        c.asleep = asleep; c.idNow = id; c.env = env; c.loafNow = loaf; c.calmNow = calm;
      }
      c.speed = Math.hypot(c.x - ox, c.y - oy) / Math.max(dt, 0.001);
      // 耳・頭の遅れ（重さ）：スクロールや移動の速さに、ばねで遅れてついてくる
      const txl = c.mode === "fly" ? -c.dir * 0.11 : 0, tyl = clamp(vel * 0.00011, -0.12, 0.12) + (c.mode === "sit" ? clamp(-c.hopV * 0.00015, -0.09, 0.09) : 0);
      c.lagXV += ((txl - c.lagX) * 150 - c.lagXV * 9) * dt; c.lagX += c.lagXV * dt;
      c.lagYV += ((tyl - c.lagY) * 150 - c.lagYV * 9) * dt; c.lagY += c.lagYV * dt;
      // 向き：移動中は進む方向へ。止まっているときは、PC はカーソルのほう、スマホはゆっくり見回す。ときどき相手のほうを見る
      let ty = 0, tx = 0; const other = chars[1 - c.row], cursor = fine && now - pAt < 4;
      if (c.mode === "fly") ty = c.dir * (c.row ? 0.55 : 0.4);
      else if (c.asleep) { ty = 0.12; tx = 0.1; }
      else if (info.act === "nap" && c.row === 1 && !cursor) ty = Math.sign(other.x - c.x) * 0.42;   // ジルは、寝ているレンを見ている
      else if (now < c.lookUntil) ty = Math.sign(other.x - c.x) * 0.5;
      else if (cursor) { ty = clamp((px - c.x) / W * 1.6, -0.5, 0.5); tx = clamp((py - (c.y - c.size * 0.5)) / H * 0.5, -0.16, 0.2); }
      else { ty = Math.sin(now * 0.55 + c.row * 1.7) * 0.2 + clamp((W * 0.5 - c.x) / W, -0.5, 0.5) * 0.35; if (c.act === "watch" && now < c.actUntil) tx = 0.16; }
      if (c.mode === "sit" && !c.asleep && now > c.lookAt && info.act !== "nap") { c.lookAt = now + 6 + Math.random() * 6; c.lookUntil = now + 1.3; }
      if (c.mode === "fly") { if (c.hopF >= 0) tx += -0.12 * Math.cos(Math.PI * c.hopF); else if (c.pre > 0) tx += 0.1; }
      else {
        tx += (c.lope || 0) * 0.05;
        const nearC = cursor && !c.hover && !c.asleep && Math.hypot(px - c.x, py - (c.y - c.size * 0.45)) < c.size * 1.25; c.sniff = nearC;
        if (nearC) tx += 0.05;
        if (c.idNow === "groom") tx += 0.12 * c.env;
        if (c.idNow === "stretch") tx += 0.06 * c.env;
        if (c.idNow === "scope") { tx -= 0.08 * c.env; ty = Math.sin((now - c.idleT0) * 2.6) * 0.45 * c.env; }
      }
      if (c.spinT >= 0) ty += Math.sin(c.spinT * Math.PI * 2) * 0.45 * c.binkDir * (1 - c.spinT);
      ty = clamp(ty, c.row ? -0.5 : -0.36, c.row ? 0.5 : 0.36);   // レンは体が横に長いので、回しすぎない
      c.ry += (ty - c.ry) * Math.min(1, dt * 6); c.rx += (tx - c.rx) * Math.min(1, dt * 6);
      if (c.spinT >= 0) { c.spinT += dt / 0.8; if (c.spinT >= 1) c.spinT = -1; }
      life(c, now, dt, other, cursor);
      if (now > c.blinkAt) c.blinkAt = now + 4 + Math.random() * 7;
      c.face = c.asleep || (c.mode === "sit" && (c.idNow === "groom" || (c.idNow === "stretch" && c.env > 0.5))) ? "blink" : now < c.happyUntil ? "happy" : (c.blinkAt - now < 0.13 ? "blink" : "open");
      if (c.alpha > 0.01 && c.y > -20 && c.y - c.size * 1.3 < H + 20 && c.x > -c.size && c.x < W + c.size) visible = true;
    }
    // 最初の画面で止まっていたら、「下へ」の印をジルが出す
    const jill = chars[1];
    if (state.active === 0 && introDone && jill.mode === "sit" && sy < 30 && now - lastScrollAt > 4.5 && now > hintAt && now - introAt > 4) { hintAt = now + 8; say(jill, "down", now, 2.6); jill.hopV = Math.max(jill.hopV, 240); }
    for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.t += dt; p.x += p.vx * dt; p.dy += p.vy * dt; p.vx *= 0.94; if (p.t > 0.6) puffs.splice(i, 1); else visible = true; }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > 0.5) rings.splice(i, 1); else visible = true; }
    for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; if (now > b.until || b.c.mode !== "sit") bubbles.splice(i, 1); }
    for (const m of motes) { m.a += m.va * dt; m.ph += dt; }
    const heroK = state.active === 0 && introDone ? clamp(1 - sy / (H * 0.9), 0, 1) : 0;
    offY = wrap ? sy - place(sy) : 0;   // 下の端で画面を動かしきれないぶんは、絵のほうをずらす
    draw(now, visible, heroK);
    state.frames++;
    if (visible) {
      state.ready = true;
      // 遅い機械：まず画質を下げ、それでも遅ければ止めて元の絵に戻す
      if (rawDt > 0.034 && rawDt < 0.25) slow++; else if (rawDt < 0.025) fast++;
      if (slow + fast >= 120) { if (slow > fast * 1.5) { if (state.quality === 1) { state.quality = 0.5; resize(true); } else if (Q !== "1") { fail({ message: "slow" }); return; } } slow = fast = 0; }
    }
  };

  const draw = (now, visible, heroK) => {
    if (!visible) { if (!cleared) { gl.clear(gl.COLOR_BUFFER_BIT); cleared = true; } return; }
    cleared = false; gl.clear(gl.COLOR_BUFFER_BIT);
    const wx = (x) => x - W / 2, wy = (y) => H / 2 - y - offY, dark = Math.max(tone[0], tone[1]);
    // 手前（z>0）に来ると遠近で外へずれる。着いているときは足の位置が HTML とずれないよう打ち消す（画面の端からはみ出さない）
    const pin = (c) => 1 - c.comp * c.z / camD, cx = (c, x) => wx(x) * pin(c), cy = (c, y) => wy(y) * pin(c);
    gl.useProgram(progBlob.p); const ub = progBlob.u; gl.uniformMatrix4fv(ub.uP, false, proj);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.disableVertexAttribArray(1);
    const blob = (x, y, z, sx, sy2, ang, r, g, b, a, ring) => { gl.uniform3f(ub.uPos, x, y, z); gl.uniform2f(ub.uSz, sx, sy2); gl.uniform1f(ub.uAng, ang); gl.uniform1f(ub.uRing, ring || 0); gl.uniform4f(ub.uCol, r, g, b, a); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
    // 最初の画面：2 人のうしろに、やわらかい光
    if (heroK > 0.01) { const c = chars[0], j = chars[1]; if (c.mode === "sit" && j.mode === "sit") blob(wx((c.x + j.x) / 2), wy(c.y - c.size * 0.42), -40, c.size * 1.15, c.size * 0.8, 0, 1, 0.98, 0.9, 0.5 * heroK); }
    // 影・着地の輪・土ぼこり
    for (const c of chars) {
      if (c.alpha < 0.01 || c.mode === "wait") continue;
      const k = clamp(1 - c.h / (c.size * 1.3), 0.25, 1), s = 0.7 + 0.3 * k, d = 1 - dark;
      blob(cx(c, c.gx), cy(c, c.gy + c.size * 0.004), c.z, c.size * 0.36 * s * (1 + c.ext), c.size * 0.055 * s, 0, 0.17 * d, 0.11 * d, 0.07 * d, (0.30 + 0.25 * dark) * k * c.alpha * (1 - c.air));
    }
    for (const p of rings) { const k = p.t / 0.5, rr = p.r * (1 + k * 2.2); blob(wx(p.x), wy(p.dy - scrollY), 0, rr, rr * 0.22, 0, 1, 0.87 + 0.1 * dark, 0.66 + 0.2 * dark, 0.5 * (1 - k) * (1 - k), 1); }
    for (const p of puffs) { const k = p.t / 0.6, rr = p.r * (1 + k * 1.6); blob(wx(p.x), wy(p.dy - scrollY), 0, rr, rr, 0, 0.93, 0.86, 0.74, 0.5 * (1 - k)); }
    // 2 人（奥から順に）
    gl.useProgram(progChar.p); const u = progChar.u; gl.uniformMatrix4fv(u.uP, false, proj);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u.uT, 0);
    // 光：登場のときは左から右へさっと流れる。PC はカーソルの方向から、スマホはページの進みぐあいでゆっくり回る
    const doc = Math.max(1, root.scrollHeight - H);
    let lx, ly; const sweep = now - introAt;
    if (sweep > 0 && sweep < 2.1) { lx = -1.3 + smooth(sweep / 2.1) * 2.1; ly = 0.6; }
    else if (fine && now - pAt < 6) { lx = (px / W - 0.5) * 1.6; ly = 0.55 - (py / H - 0.5) * 0.8; } else { const ang = (scrollY / doc) * Math.PI * 3 + now * 0.15; lx = Math.sin(ang) * 0.75; ly = 0.6; }
    const ll = Math.hypot(lx, ly, 0.9); gl.uniform3f(u.uL, lx / ll, ly / ll, 0.9 / ll);
    // 場所の色に合わせる：紺の所は少し青く、こげ茶の所は少し暖かく。暗い所では、ふちを光らせる
    gl.uniform3f(u.uAmb, 1 - 0.06 * tone[0] - 0.02 * tone[1], 1 - 0.03 * tone[0] - 0.04 * tone[1], 1 + 0.04 * tone[0] - 0.08 * tone[1]);
    gl.uniform4f(u.uRim, 0.75 * tone[0] + 1.0 * tone[1], 0.85 * tone[0] + 0.8 * tone[1], 1.0 * tone[0] + 0.5 * tone[1], 0.34 * dark);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    for (const c of (chars[0].z <= chars[1].z ? chars : [chars[1], chars[0]])) {
      if (c.alpha < 0.01 || c.mode === "wait") continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, meshes[c.row]);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);
      const wig = c.spinT >= 0 ? Math.sin(c.spinT * Math.PI * 4) * 0.17 * (1 - c.spinT) : 0;   // 押したとき：体を左右に振る
      gl.uniform3f(u.uPos, cx(c, c.x), cy(c, c.y), c.z); gl.uniform1f(u.uSize, c.size * pin(c) + c.size * (1 - pin(c)) * 0.45);   // 近づくぶんは、少しだけ大きく見せる
      gl.uniform3f(u.uRot, c.rx, c.ry, c.rz + wig); gl.uniform1f(u.uTurn, clamp(c.ry, -0.6, 0.6)); gl.uniform2f(u.uSq, (1 + c.ext) / Math.sqrt(c.sq), c.sq); gl.uniform2f(u.uLag, c.lagX, c.lagY);
      { const B = BODY[c.row], breath = (c.asleep ? 0.05 : 0.03 + 0.02 * c.exert) * (0.5 + 0.5 * Math.sin(c.br));
        gl.uniform4f(u.uEar, c.eL, c.eR, c.flap, c.eW); gl.uniform4f(u.uEarP, B.ear[0], B.ear[1], B.ear[2], B.ear[3]);
        gl.uniform4f(u.uHead, c.hx, c.hy, B.neck, c.ht); gl.uniform4f(u.uNose, B.nose[0], B.nose[1], c.nose, c.nose * 6);
        gl.uniform4f(u.uBelly, B.belly[0], B.belly[1], B.belly[2], breath); }
      gl.uniform4f(u.uHop, c.hopE || 0, c.hopG || 0, c.mode === "fly" ? c.dir : (c.hopDir || 0), c.hopW || 0);
      gl.uniform4fv(u.uTile, tile(FACE[c.face], c.row)); gl.uniform4fv(u.uDTile, tile(3, c.row));
      gl.uniform1f(u.uAlpha, c.alpha); gl.uniform1f(u.uBias, clamp(Math.abs(c.z) / 420, 0, 1) * 2.2 + (c.mode === "fly" ? clamp(c.speed / 2600, 0, 1) * 1.1 : 0));   // 遠い・近い・速いときは少しぼかす
      gl.drawElements(gl.TRIANGLES, idxCount, gl.UNSIGNED_SHORT, 0);
    }
    gl.disableVertexAttribArray(1); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // 頭の上の印
    if (bubbles.length) {
      gl.useProgram(progIcon.p); const ui = progIcon.u; gl.uniformMatrix4fv(ui.uP, false, proj); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texIcon); gl.uniform1i(ui.uI, 1);
      for (const b of bubbles) {
        const t = now - b.t0; if (t < 0) continue; const c = b.c, out = clamp((b.until - now) / 0.25, 0, 1);
        const pop = t < 0.35 ? 1 + Math.sin(t / 0.35 * Math.PI) * 0.25 - Math.pow(1 - t / 0.35, 3) : 1, s = clamp(c.size * 0.2, 17, 34) * pop * (0.6 + 0.4 * out);
        const bx = c.x + c.size * (c.row ? 0.2 : -0.06), by = c.y - c.size * (c.row ? 0.93 : 0.9) - s - Math.sin(t * 3) * 2;
        gl.uniform3f(ui.uPos, wx(clamp(bx, s + 4, W - s - 4)), wy(Math.max(by, s + 4)), c.z + 30); gl.uniform2f(ui.uSz, s, s); gl.uniform1f(ui.uAng, Math.sin(t * 2.2) * 0.07);
        gl.uniform4f(ui.uTile, ICONS.indexOf(b.icon) / ICONS.length, 0, 1 / ICONS.length, 1); gl.uniform1f(ui.uAlpha, out); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.activeTexture(gl.TEXTURE0);
    }
    // 手前の牧草（カメラに近いので、ぼけて大きく、速く流れる。最初の画面だけ）
    if (heroK > 0.01 && state.quality === 1) {
      gl.useProgram(progBlob.p);
      for (const m of motes) { const k = 1 - m.z, yy = ((m.y * 1.6 * H - scrollY * 0.9) % (H * 1.6) + H * 1.6) % (H * 1.6) - H * 0.3; blob((m.x * W * 0.5 + Math.sin(m.ph * 0.5) * 14) * k, (H * 0.5 - yy) * k, camD * m.z, H * m.len * k, H * 0.005 * k, m.a, 0.85, 0.66, 0.16, 0.24 * heroK); }
    }
  };

  /* ───────── 始める・止める ───────── */
  const stop = () => { cancelAnimationFrame(raf); raf = 0; last = 0; };
  const go = () => { if (!raf && !document.hidden && !state.lost && progChar) { lastY = scrollY; raf = requestAnimationFrame(frame); } };
  const fail = (e) => { state.lost = true; if (wrap) wrap.style.display = "none"; state.err = e && e.message ? String(e.message).slice(0, 300) : (e && e.type) || ""; stop(); root.classList.remove("g3d-on"); cv.style.display = "none"; };
  cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); fail(e); });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : go()));
  addEventListener("resize", () => { findSpots(); fitWrap(); }, { passive: true });
  addEventListener("orientationchange", () => setTimeout(findSpots, 300), { passive: true });
  addEventListener("pageshow", go);
  const onReduce = () => { if (mqReduce.matches) fail({ message: "reduced-motion" }); };   // 途中で「動きを減らす」に変えたら、すぐ止める
  if (mqReduce.addEventListener) mqReduce.addEventListener("change", onReduce); else if (mqReduce.addListener) mqReduce.addListener(onReduce);

  const img = new Image(); img.decoding = "async"; img.crossOrigin = "anonymous";   // 絵が別の場所（CDN）から配られても読めるように。同じ場所なら何も変わらない
  img.onload = () => { try { fitWrap(); build(img); resize(true); findSpots(); go(); } catch (e) { fail(e); } };
  img.onerror = fail;
  img.src = (document.currentScript && document.currentScript.dataset.atlas) || "img/g3d/atlas.webp";
})();
