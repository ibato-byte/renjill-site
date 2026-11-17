/* レンとジルの「案内役」（3D）。しくみ・決まりは docs/GUIDE3D-NOTES.md */
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
  // 3D の画面はページの中に置き、描いたときのスクロール位置へ動かす（→ NOTES）
  let docH = 0; const ftr = document.querySelector("footer");
  // ページの終わり（→ NOTES）
  const docEnd = () => ftr ? Math.ceil(ftr.getBoundingClientRect().bottom + scrollY) : root.scrollHeight;
  const fitWrap = () => { if (!wrap) return; docH = docEnd(); wrap.style.height = docH + "px"; };
  let placedY = -1; const place = (y) => { if (!wrap) return; const yy = Math.max(0, Math.min(y, docH - (cv.clientHeight || innerHeight))); if (yy !== placedY) { placedY = yy; cv.style.transform = "translate3d(0," + yy + "px,0)"; } return yy; };
  const state = { ready: false, lost: false, frames: 0, fixed: false, active: -1, chars: [], bubbles: [], quality: 1 };
  window.__g3d = state;

  /* ───────── 絵のます目（tools/make_g3d.py と同じ数字） ───────── */
  const ATLAS2 = (document.currentScript && document.currentScript.dataset.atlas2) || "img/g3d/atlas2.webp";   // ばたんの絵（2 枚目）
  const AW = 4096, AH = 4096, CELL = 1024, PAD = 32, INNER = CELL - PAD * 2; // 2026-11-16（→ NOTES）
  const tile = (col, row) => [(col * CELL + PAD) / AW, (row * CELL + PAD) / AH, INNER / AW, INNER / AH];
  const FACE = { open: 0, blink: 1, happy: 2 };
  // 寝る姿勢の倍率（→ NOTES）
  const POSE_R = [1.728, 1.2604], POSE_X = [-0.3272, 0.2587];   // X＝ずれ
  const FLOP_R = [1.2992, 1.0677], FLOP_X = [-0.2872, 0.1832], t2 = (col, row) => [(col * CELL + PAD) / 2048, (row * CELL + PAD) / 2048, INNER / 2048, INNER / 2048];   // ばたん（2 枚目の絵 atlas2.webp）
  const BOW_R = [1.408, 1.125], BOW_X = [-0.1528, 0.0938];   // 前のび（伸び＋あくび）の（→ NOTES）
  const flatOff = (c) => { const X = c.fp ? FLOP_X : POSE_X, Rr = c.fp ? FLOP_R : POSE_R; return Math.cos(c.tA || 0) >= 0 ? X[c.row] + (c.row ? 0.16 : -0.16) : (c.row ? -1 : 1) * (0.3 - Rr[c.row] / 2); };   // 寝る絵のまん中のずれ（→ NOTES）
  const FOOT = 0.058;      // 絵の下から足の裏までの割合
  const GRID = 72;         // 板の分割数（2026-11-16：耳（→ NOTES）
  const DEPTH = 0.27;      // ふくらみの厚さ（絵の幅に対して）
  const FOV = 30 * Math.PI / 180;
  const ICONS = ["down", "note", "zz", "play", "star", "heart", "ask", "bang"];
  const NAP_AT = 0.3;      // 居眠りの場所に着いてから（→ NOTES）
  const ACTS = { hint: "down", wave: "note", nap: "zz", watch: "play", play: "star", follow: "heart", ask: "ask" };

  /* ───────── シェーダー ───────── */
  const VS_CHAR = `
attribute vec2 aUv; attribute vec3 aD; // aD.x＝奥行き（→ NOTES）
uniform mat4 uP; uniform vec3 uPos; uniform float uSize; uniform vec3 uRot; uniform vec2 uSq; uniform vec2 uLag; uniform float uM;
uniform vec4 uEar; uniform vec4 uEarP; uniform vec4 uHead; uniform vec4 uNose; uniform vec4 uBelly; uniform vec4 uHop; // うさぎ跳び：x＝のび、y＝ちぢみ（背（→ NOTES）
varying vec2 vUv;
vec2 rot2(vec2 q, vec2 c, float a) { vec2 d = q - c; float cs = cos(a), sn = sin(a); return c + vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs); }
void main() {
  float top = max(aUv.y - ${FOOT.toFixed(3)}, 0.0) / ${(1 - FOOT).toFixed(3)};
  vec2 q = aUv; float plant = smoothstep(${FOOT.toFixed(3)}, ${(FOOT + 0.1).toFixed(3)}, q.y);
  if (uEarP.w < 0.5) {
    float wy = smoothstep(uEarP.z, uEarP.z + 0.08, q.y), mid = 0.5 * (uEarP.x + uEarP.y);
    float mL = aD.y * (1.0 - smoothstep(mid - 0.02, mid + 0.02, q.x)), mR = aD.y * smoothstep(mid - 0.02, mid + 0.02, q.x); // 耳の形のところだけ（→ NOTES）
    q.y -= (q.y - uEarP.z) * uEar.w * wy * max(mL, mR);
    q = rot2(q, vec2(uEarP.x, uEarP.z), uEar.x * wy * mL);
    q = rot2(q, vec2(uEarP.y, uEarP.z), uEar.y * wy * mR);
  } else {
    // たれ耳：付け根（上）は動かず、先ほど大きく動く。（→ NOTES）
    float wy = smoothstep(uEarP.z, uEarP.z - 0.36, q.y), mid = 0.5 * (uEarP.x + uEarP.y);
    float mL = aD.y * (1.0 - smoothstep(mid - 0.02, mid + 0.02, q.x)), mR = aD.y * smoothstep(mid - 0.02, mid + 0.02, q.x);
    q = rot2(q, vec2(uEarP.x, uEarP.z), uEar.x * wy * mL);
    q = rot2(q, vec2(uEarP.y, uEarP.z), uEar.y * wy * mR);
    q.y += uEar.z * wy * wy * (mL + mR) * 0.06; q.x += uEar.z * wy * (mR - mL) * 0.025;
  }
  { float wh = aD.z; // 頭と耳をひとかたまりで（→ NOTES）
    q = rot2(q, vec2(uNose.x, uHead.z), uHead.w * wh); q += uHead.xy * wh; }
  { vec2 dn = q - uNose.xy; float wn = exp(-dot(dn, dn) / 0.0009); q.y += uNose.z * wn; q.x -= dn.x * uNose.w * wn; }
  { vec2 db = (q - uBelly.xy) / uBelly.z; float wb = exp(-dot(db, db) * 1.6) * plant; q += (q - uBelly.xy) * vec2(1.0, 0.45) * uBelly.w * wb; }
  { // うさぎ跳び（2026-11-16 オーナー：「移（→ NOTES）
    float low = 1.0 - smoothstep(0.05, 0.36, q.y), side = (q.x - 0.5) * uHop.z, fr = smoothstep(-0.06, 0.2, side), bk = smoothstep(-0.02, 0.26, -side), body = 1.0 - aD.z;
    q.x += uHop.z * uHop.x * low * (0.085 * fr - 0.11 * bk);                 // 前足を前へ、後ろ足を後ろへ
    q.y += uHop.x * low * (0.035 * fr + 0.05 * bk) * smoothstep(0.0, 0.12, q.y); // のびた足は床からはなれる
    q.x -= (q.x - 0.5) * uHop.y * low * 0.3;                                  // ちぢみ：足を体の下に集める
    q.y += uHop.y * 0.07 * bk * body * smoothstep(0.12, 0.5, q.y) * (1.0 - smoothstep(0.62, 0.9, q.y)); // ちぢみ：お尻の側の背中が丸く上がる
    q.y -= uHop.w * 0.035 * fr * smoothstep(0.2, 0.6, q.y);                   // 前足の着地：肩（進む側）が沈む
    q.x += uHop.z * uHop.x * 0.03 * smoothstep(0.2, 0.7, q.y) * body; }        // のび：胸が前へ出る
  vec3 p = vec3((q.x - 0.5) * uSq.x, (q.y - ${FOOT.toFixed(3)}) * uSq.y, aD.x * ${DEPTH.toFixed(2)} * uSq.x);
  { float m = uM > 1.5708 ? -1.0 : 1.0, th = (uM > 1.5708 ? uM - 3.14159 : uM) * 0.45, c0 = cos(th), s0 = sin(th); p.x *= m; p.z *= 1.0 + 0.6 * abs(s0); p.xz = vec2(p.x * c0 + p.z * s0, -p.x * s0 + p.z * c0); }   // 向きを変える（→ NOTES）
  p.xy += uLag * top * top * top;
  float cz = cos(uRot.z), sz = sin(uRot.z); p.xy = vec2(p.x * cz - p.y * sz, p.x * sz + p.y * cz);
  float cx = cos(uRot.x), sx = sin(uRot.x); p.yz = vec2(p.y * cx - p.z * sx, p.y * sx + p.z * cx);
  // 横を向くとき：体はあまり回さず、頭（上のほう）を（→ NOTES）
  // 幅を戻す割り算は、角度が大きいと絵を引きのばして壊すので、角度は必ず ±0.6 までに限る（→ NOTES）
  float ay = clamp(uRot.y, -0.6, 0.6) * mix(0.45, 1.0, smoothstep(0.22, 0.6, top));
  float cy = cos(ay), sy = sin(ay); p.x /= mix(1.0, cy, 0.85); p.xz = vec2(p.x * cy + p.z * sy, -p.x * sy + p.z * cy);
  vUv = vec2(aUv.x, 1.0 - aUv.y);
  gl_Position = uP * vec4(uPos + p * uSize, 1.0);
}`;
  const FS_CHAR = `
precision mediump float;
uniform sampler2D uT; uniform vec4 uTile; uniform vec4 uDTile; uniform vec3 uL; uniform float uAlpha; uniform float uBias; uniform float uTurn; uniform float uMf;
uniform vec3 uAmb; uniform vec4 uRim;
varying vec2 vUv;
float dep(vec2 uv) { return texture2D(uT, uDTile.xy + clamp(uv, 0.0, 1.0) * uDTile.zw).r; }
void main() {
  vec4 c = texture2D(uT, uTile.xy + vUv * uTile.zw, uBias);
  float e = 0.014;
  vec3 n = normalize(vec3((dep(vUv - vec2(e, 0.0)) - dep(vUv + vec2(e, 0.0))) * 3.2, (dep(vUv + vec2(0.0, e)) - dep(vUv - vec2(0.0, e))) * 3.2, 1.0));
  n.x *= uMf; float cy = cos(uTurn), sy = sin(uTurn); n.xz = vec2(n.x * cy + n.z * sy, -n.x * sy + n.z * cy);   // 反転した時は、光の当たる側も反転
  float ndl = dot(n, uL);
  float edge = 1.0 - clamp(abs(n.z), 0.0, 1.0);
  vec3 col = c.rgb * uAmb * (0.85 + 0.25 * clamp(ndl, -0.2, 1.0));   // 影の側を暗くしすぎない（→ NOTES）
  col += vec3(1.0, 0.93, 0.80) * edge * edge * 0.20 * smoothstep(-0.2, 0.7, ndl);
  col += uRim.rgb * uRim.a * edge * sqrt(edge);   // 暗い背景では（→ NOTES）
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
  let progChar, progBlob, progIcon, tex, texIcon, quadBuf, idxBuf, idxCount, meshes = [], meshesF = [], meshesB = [], meshesP = [], tex2 = null, cleared = false;
  const proj = new Float32Array(16);
  let W = 1, H = 1, DPR = 1, camD = 1;

  const build = (img) => {
    progChar = program(VS_CHAR, FS_CHAR, ["aUv", "aD"]);
    progBlob = program(VS_BLOB, FS_BLOB, ["aQ"]);
    progIcon = program(VS_BLOB, FS_ICON, ["aQ"]);
    const mkTex = (im) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    tex = mkTex(img);
    texIcon = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texIcon);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, drawIcons());
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // 奥行きを頂点に焼きこむ（→ NOTES）
    const N = GRID + 1, c2 = document.createElement("canvas"); c2.width = N; c2.height = N * 2;
    const g = c2.getContext("2d", { willReadFrequently: true });
    const mesh = (col, row, im = img) => {
      g.clearRect(0, 0, N, N); g.drawImage(im, col * CELL + PAD, row * CELL + PAD, INNER, INNER, 0, 0, N, N);
      const px = g.getImageData(0, 0, N, N).data, v = new Float32Array(N * N * 5);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = (j * N + i) * 5, o = ((N - 1 - j) * N + i) * 4; v[k] = i / GRID; v[k + 1] = j / GRID; v[k + 2] = px[o] / 255; v[k + 3] = px[o + 1] / 255; v[k + 4] = px[o + 2] / 255; }
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW); return b;
    };
    meshes = [mesh(3, 0), mesh(3, 1)]; meshesF = [mesh(1, 2), mesh(1, 3)]; meshesB = [mesh(3, 2), mesh(3, 3)];
    { const i2 = new Image(); i2.crossOrigin = "anonymous"; i2.onload = () => { try { tex2 = mkTex(i2); meshesP = [mesh(1, 0, i2), mesh(1, 1, i2)]; } catch (e) { tex2 = null; } }; i2.src = ATLAS2; }   // 2 枚目（ばたん）。読めなくても、ばたんをしないだけ
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
    // ↑ 透視投影 × カメラ（→ NOTES）
    cleared = false;
  };

  /* ───────── 立つ場所 ───────── */
  let spots = [], spotInfo = [];
  const findSpots = () => {
    const cur = spots[state.active];
    spots = [...document.querySelectorAll(".g3d-spot")].filter((e) => e.offsetParent !== null);
    // pin＝場所を画面に止める親（→ NOTES）
    const pinOf = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.position === "sticky") return { el: p, top: parseFloat(cs.top) || 0 }; } return null; };
    spotInfo = spots.map((e) => { const s = e.closest("section"); return { act: e.dataset.act || "", tone: s && s.classList.contains("day") ? 1 : s && s.classList.contains("game") ? 2 : 0, pin: pinOf(e) }; });
    if (cur) state.active = spots.indexOf(cur);
  };
  const spotRect = (i) => spots[i] ? spots[i].getBoundingClientRect() : null;

  /* ───────── 2 人 ───────── */
  // fx：場所の箱の中での足の位置（横）（→ NOTES）
  const DEF = [{ name: "ren", row: 0, fx: 0.31, k: 1.0, dz: 0, delay: 0 }, { name: "jill", row: 1, fx: 0.87, k: 0.74, dz: 26, delay: 0.14 }];
  const BODY = [{ ear: [0.30, 0.875, 0.80, 1], nose: [0.58, 0.49], neck: 0.44, belly: [0.60, 0.24, 0.20] },
                { ear: [0.34, 0.525, 0.80, 0], nose: [0.43, 0.53], neck: 0.47, belly: [0.55, 0.26, 0.24] }];
  const spr = (c, k, target, stiff, damp, dt) => { c[k + "V"] += ((target - c[k]) * stiff - c[k + "V"] * damp) * dt; c[k] += c[k + "V"] * dt; };
  const mk = (d) => ({ ...d, x: 0, y: 0, z: 0, size: 100, alpha: 0, mode: "wait", t: 0, dur: 1, hops: 1, hopH: 60, zArc: 0, from: null, exit: null, h: 0, gx: 0, gy: 0, pre: 0,
    face: "open", blinkAt: 1.5 + Math.random() * 3, happyUntil: 0, ry: 0, rx: 0, rz: 0, sq: 1, sqV: 0, lagX: 0, lagXV: 0, lagY: 0, lagYV: 0, dir: 0, hopAt: 0, hop: 0, hopV: 0, seen: false,
    step: d.row * 0.5, trot: 0, hover: false, spinT: -1, lookUntil: 0, lookAt: 6 + Math.random() * 5, actUntil: 0, act: "", awakeUntil: 0, asleep: false, speed: 0, comp: 0, air: 0,
    eL: 0, eLV: 0, eR: 0, eRV: 0, eW: 0, eWV: 0, flap: 0, flapV: 0, hx: 0, hxV: 0, hy: 0, hyV: 0, ht: 0, htV: 0, ext: 0, extV: 0, nose: 0, twPh: 0, twAt: 1 + Math.random() * 2, twUntil: 0,
    br: Math.random() * 6, exert: 0, idle: "", idleT0: 0, idleUntil: 0, idleAt: 9 + Math.random() * 6, calmAt: 0, flickAt: 3 + Math.random() * 5, alertUntil: 0, hopF: -1, binkDir: 1, lastRy: 0, flat: false, flatGoal: false, lieT: 1, hopE: 0, hopG: 0, hopW: 0, hopDir: 0 });
  const chars = DEF.map(mk); state.chars = chars;
  const puffs = [], rings = [], bubbles = state.bubbles;
  // 奥行きのある牧草（→ NOTES）
  const motes = Array.from({ length: 9 }, () => ({ x: (Math.random() - 0.5) * 1.7, y: Math.random(), z: 0.2 + Math.random() * 0.45, a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.5, ph: Math.random() * 6, len: 0.03 + Math.random() * 0.03 }));

  // 2 人の間：ジルの頭がレンの体に食いこまないよう（→ NOTES）
  const targetOf = (c, r) => ({ x: r.left + r.width * (c.fx + (W < 360 ? (c.row ? -0.07 : 0.05) : 0)), y: r.bottom, size: (r.height * c.k) / (1 - FOOT - 0.085) });
  const onScreen = (r, m) => r.bottom > -m && r.top < H + m && r.right > -m && r.left < W + m;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (t) => t * t * (3 - 2 * t);
  // 最初の画面だけ（→ NOTES）
  const zBase = (c) => c.dz + (state.active === 0 ? clamp(scrollY / H, 0, 0.8) * camD * 0.2 : 0);   // 画面の高さに比例（→ NOTES）
  // ここを押したら 2 人に当たるか（→ NOTES）
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
    c.shortMv = opt.intro || Math.abs(E.x - fx) < fs * 0.5;   // 最初の登場（→ NOTES）
    c.hops = opt.intro ? 3 : clamp(Math.round(dist / (c.row ? 300 : 380)), 1, c.row ? 4 : 3);   // ジル（小さい種類）は、小さな跳びを多く
    c.hopH = clamp(dist / c.hops * 0.22, c.shortMv && !opt.intro ? 10 : 26, 64) * (opt.intro ? 1.3 : 1) * (c.row ? 1.08 : 0.92);   // 重いレンは低く、軽いジルは少し高く   // 長い移動でも高く跳ばない   // うさぎの跳びは低く長い（→ NOTES）
    c.zArc = opt.intro ? 0 : clamp(dist * 0.35, 0, 240);
    c.seed = Math.random() * 6; c.dur = (opt.intro ? 1.5 : Math.min(1.15, 0.5 + 0.2 * c.hops + dist / 4200)) * (0.94 + 0.06 * Math.random());   // 広い画面でも待たせない（→ NOTES）
    c.pre = opt.intro || !curOn || c.mode !== "sit" ? 0 : Math.abs(E.x - fx) < fs * 0.5 ? 0.05 : 0.13;   // ほんの少しの移動は（→ NOTES）
    { const dd = Math.sign(E.x - fx), want = dd * (c.row ? -1 : 1); if (dd && !c.shortMv && c.mode === "sit" && Math.cos(c.tA || 0) * want < 0) c.pre = Math.max(c.pre, c.row ? 0.28 : 0.38); }   // 重いレンは（→ NOTES）
    c.idle = ""; c.idNow = ""; c.env = 0; c.loafNow = false; c.calmNow = false; c.calmAt = 0;
    const dd0 = Math.sign(E.x - fx) || 0; c.t = -(dd0 ? (dd0 * (c.row ? 1 : -1) > 0 ? 0 : 0.08 + 0.06 * Math.random()) : c.delay) - (opt.wait || 0) - c.pre; c.flat = false; c.flatGoal = false; c.lieT = 1; c.mode = "fly"; c.dir = Math.sign(E.x - fx) || 0; c.hopDir = c.dir || c.hopDir; c.seen = true; c.hop = 0; c.hopV = 0; c.spinT = -1; c.act = ""; c.hover = false; c.asleep = false;   // 進む方で前にいる子が先に出る（→ NOTES）
    unsay(c);
  };

  const land = (c, now) => {
    c.dust = 1; c.dX = c.x; c.dY = c.gy; c.mode = "sit"; c.h = 0; c.z = zBase(c); c.sqV = c.row ? -2.8 : -3.8; c.sl = c.dir * c.size * 0.03 * clamp(c.hopH / 40, 0.6, 1.6); c.happyUntil = now + 1.1;   // レン（重い種類）は着地で（→ NOTES）
    c.rx += 0.14; c.hyV -= 0.5; c.flapV -= 5; c.eWV += 3; c.exert = Math.min(1, c.exert + 0.25 + 0.12 * c.hops); c.hopF = -1;
    if (Math.random() < 0.3) { c.idle = "shake"; c.idleT0 = now + 0.55; c.idleUntil = now + 1.05; } c.dir = 0; c.lookUntil = Math.cos(c.tA || 0) * (c.row ? -1 : 1) < 0 ? now + 1.4 : c.lookUntil; if (c.hops >= 3 && Math.random() < 0.35) { c.idle = "scope"; c.idleT0 = now + 0.4; c.idleUntil = now + 2; } c.hopAt = now + 4 + Math.random() * 5; c.lookAt = now + 5 + Math.random() * 5;   // 相手に背を向けて着いたら（→ NOTES）
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
    // 居眠り：レンは着いたらすぐ目を閉じ（にっこりしな（→ NOTES）
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


  // 体の中の動き（2026-11-16。調べた動きは（→ NOTES）
  const life = (c, now, dt, other, cur) => {
    const B = BODY[c.row], sit = c.mode === "sit", lop = B.ear[3] > 0.5, id = sit ? c.idNow || "" : "", e = id ? c.env : 0, hf = c.hopF, fly = c.mode === "fly", air = fly && hf >= 0 ? Math.sin(Math.PI * hf) : 0, cs = fly && hf >= 0 ? Math.cos(Math.PI * hf) : 0;
    if (sit && c.calmNow && !c.asleep && !id && now > c.idleAt && introDone) { const r = Math.random(); c.idle = r < 0.45 ? "groom" : r < 0.8 ? "scope" : "stretch"; c.idleT0 = now; c.idleUntil = now + (r < 0.45 ? 2.6 : r < 0.8 ? 2.3 : 1.6); c.idleAt = now + 9 + Math.random() * 9; }
    if (sit && Math.abs(vel) > 1100 && c.calmNow) c.alertUntil = now + 0.7;
    let eL = 0, eR = 0, eW = 0, fl = 0, hx = 0, hy = 0, ht = 0, ex = 0;
    if (!lop) {
      eL = 0.05; eR = -0.05; if (cur && sit) { if (px < c.x) eL = 0.2; else eR = -0.2; }
      if ((c.tq ?? 1) < 0.6) { const tf = (c.tG > 1.5 ? -1 : 1) * (c.row ? -1 : 1) * (Math.cos(c.tA || 0) < 0 ? -1 : 1), k = 0.22 * Math.sin(Math.PI * Math.min(1, c.tq / 0.6)); eL -= tf * k; eR -= tf * k; }   // 体より先に、耳が新しい向きへ向く
      if (c.asleep || c.hover || c.loafNow || id === "groom" || c.face === "happy") { eL = 0.24; eR = -0.24; eW = 0.22; }
      if (now < c.alertUntil || id === "scope") { eL = -0.02; eR = 0.02; eW = -0.07; }
      if (fly) { const fw = c.dir * (Math.cos(c.tA || 0) < 0 ? -1 : 1); eW = 0.32 * air + (cs > 0 ? 0.1 : 0); eL = 0.08 + fw * (0.22 * air + (c.t < 0 ? 0.1 : 0)); eR = -0.08 + fw * (0.22 * air + (c.t < 0 ? 0.1 : 0)); }   // 走ると耳はうしろへ流れる
      eW += 0.12 * c.trot + (sit && c.hop > 0 ? clamp(c.hopV / 2000, -0.1, 0.2) : 0);
    } else {
      eL = eR = clamp(-c.rz * 0.8, -0.2, 0.2) + (c.asleep ? Math.sin(c.br) * 0.02 : 0);
      fl = fly ? -cs * 0.9 : clamp(-c.hopV / 450, -1, 1) * 0.7 - (c.lope || 0) * 0.35 * c.trot;
      c.eLV -= (c.ry - c.lastRy) * 12; c.eRV -= (c.ry - c.lastRy) * 12; // 頭の向きを変えた時の耳のゆれ（→ NOTES）
    }
    c.lastRy = c.ry;
    if (sit && !c.asleep && id !== "groom" && now > c.flickAt) { c.flickAt = now + 3.5 + Math.random() * 6; if (lop) { c.eLV += 2.2; c.eRV -= 2.2; } else if (Math.random() < 0.5) c.eLV += 7; else c.eRV -= 7; }
    if (id === "shake" && now > c.idleT0 && now < c.idleT0 + 0.05) { c.eLV += 6; c.eRV -= 6; c.flapV += 5; }
    const k = lop ? 90 : 230, d = lop ? 8 : 10; spr(c, "eL", eL, k, d, dt); spr(c, "eR", eR, k, d, dt); spr(c, "eW", eW, 170, 12, dt); spr(c, "flap", fl, 110, 5.5, dt);
    if (lop) { // たれ耳は重く、頭の横にそってゆれるだけ（→ NOTES）
      const L = 0.1; if (Math.abs(c.eL) > L) { c.eL = Math.sign(c.eL) * L; c.eLV *= 0.3; } if (Math.abs(c.eR) > L) { c.eR = Math.sign(c.eR) * L; c.eRV *= 0.3; } c.flap = clamp(c.flap, -0.55, 0.45); }
    if (fly) { if (hf >= 0) { hx = c.dir * Math.sign(Math.cos(c.tA || 0)) * 0.02 * air; hy = 0.014 * cs; ex = (c.dir ? 0.08 : 0.03) * air; } else if (c.pre > 0) hy = -0.02; }
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
    { // 向き（2026-11-1（→ NOTES）
      const mT = fly && c.dir && !c.shortMv ? c.dir * (c.row ? -1 : 1) : c.faceM || 1; if (fly && c.dir && !c.shortMv) c.faceM = mT;   // 着いたら（→ NOTES）
      const tg = mT > 0 ? 0 : Math.PI; if (tg !== c.tG) { c.tG = tg; c.tF = c.tA || 0; c.tq = 0; } c.tq = Math.min(1, (c.tq ?? 1) + dt / (c.row ? 0.32 : 0.45)); c.tA = c.tF + (c.tG - c.tF) * smooth(c.tq); const d = c.tG - c.tA;   // ゆっくり始まり（→ NOTES）
      c.dust = Math.max(0, (c.dust || 0) - dt * 2.4);
      if (c.tq >= 0.92 && (c.tqP || 0) < 0.92 && c.tq < 1.01) { c.dust = 0.7; c.dX = c.x; c.dY = c.gy; c.dK = 0.55; c.dDir = 0; c.flapV -= 2; } c.tqP = c.tq;   // 向きを変えて小さく跳ねたあと（→ NOTES）
      if (Math.abs(d) > 2 && !c.turning) { c.turning = 1; c.flapV -= 4; c.eWV += 2; } if (Math.abs(d) < 0.01) c.turning = 0; c.sl = (c.sl || 0) * Math.max(0, 1 - dt * 7); }   // 向きを変える時、耳がふわっと外へ
    c.exert = Math.max(0, c.exert - dt / 7); c.br += dt * (c.asleep ? 28 : c.loafNow ? 36 : 42 + 58 * c.exert) / 60 * 6.283;
  };
  /* ───────── 毎フレーム ───────── */
  let last = 0, started = false, raf = 0, introDone = false, introAt = -10, slow = 0, fast = 0;
  const tone = [0, 0];
  const heroGo = () => { const h = document.getElementById("hero"); return !h || h.classList.contains("go") || scrollY > 40 || performance.now() > 7000; };

  const pickActive = () => {
    let a = -1;
    for (let i = 0; i < spots.length; i++) { const r = spots[i].getBoundingClientRect(); if (r.height > 0 && r.bottom < H * 0.78 + (i === 0 ? 1e6 : i === state.active ? 70 : 0)) a = i; }   // いまの場所は 70px ぶん（→ NOTES）
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
        if (c.exit && onScreen(r, 0) && c.t > 0) { launch(c, now); continue; }            // 出ていく途中で行き先が見（→ NOTES）
        const t = clamp(c.t / c.dur, 0, 1), E = c.exit || T, fy = c.from.dy - sy;
        const u = t * c.hops, hi = Math.min(Math.floor(u), c.hops - 1), f = u >= c.hops ? 1 : u - Math.floor(u);
        if ((c.t > 0 && c.tP <= 0) || (hi !== c.hiL && c.t > 0)) { c.dust = 1; c.dX = c.x; c.dY = c.gy; c.dK = clamp(c.hopH / 50, 0.6, 1.3); c.dDir = c.dir; if (hi !== c.hiL && c.t > 0) c.flapV -= 2.5; } c.hiL = hi; c.tP = c.t;   // けった所・着いた所に小さな土ぼこり
        const ST = hi > 0 ? (hi === c.hops - 1 ? 0.14 : 0.09) : 0, fa = clamp((f - ST) / (1 - ST), 0, 1), Wt = (i) => c.hops < 2 ? 1 : i === 0 ? 0.8 : i === c.hops - 1 ? 0.85 : 1.15;
        let tw = 0, sw = 0; for (let i = 0; i < c.hops; i++) { tw += Wt(i); if (i < hi) sw += Wt(i); } const p = (sw + Wt(hi) * smooth(fa)) / tw;   // 1 歩目は短く（→ NOTES）
        c.gx = c.from.x + (E.x - c.from.x) * p; c.gy = fy + (E.y - fy) * p;
        c.h = Math.sin(Math.PI * fa) * c.hopH * (c.hops < 2 ? 1 : Wt(hi) * c.hops / tw) * (1 + 0.08 * Math.sin(hi * 2.3 + c.row * 1.7 + (c.seed || 0))) * (c.t < 0 ? 0 : 1); c.hopF = c.t < 0 ? -1 : fa;   // 1 歩ごとに高さが少しちがう（→ NOTES）
        { const o = chars[1 - c.row], g = c.size * 0.62 + o.size * 0.42; if (o.mode === "fly" && c.dir && o.dir === c.dir && (o.x - c.gx) * c.dir > 0 && (o.x - c.gx) * c.dir < g) c.gx = o.x - c.dir * g; }   // 前の子に追いつかない（間をあける）
        c.x = c.gx; c.y = c.gy - c.h;
        c.z = c.from.z + (zBase(c) - c.from.z) * smooth(t) + Math.sin(Math.PI * t) * c.zArc;
        c.size = c.from.size + (T.size - c.from.size) * p; c.comp = smooth(t); c.air = clamp(Math.min(t, 1 - t) * 5, 0, 1);
        c.alpha = c.t < 0 ? (c.from.z < -10 ? 0 : c.alpha) : Math.min(1, c.alpha + dt * 5);
        const air = Math.sin(Math.PI * fa), ground = f < ST ? 1 : Math.exp(-Math.pow(Math.min(fa, 1 - fa) / 0.1, 2));
        if (c.t < 0) c.sq = 1 - (0.11 + 0.03 * c.hops) * (c.pre > 0 ? smooth(clamp(1 + c.t / c.pre, 0, 1)) : 0);   // 遠くへ行く時ほど深くため（→ NOTES）
        else c.sq = 1 - 0.07 * Math.pow(air, 0.7) + 0.05 * ground * (t > 0.02 ? 1 : 0);          // 空中は体が長く低い・着いた時は背中が丸く高い（→ NOTES）
        // うさぎ跳びの形（→ NOTES）
        { const pre = c.t < 0 ? (c.pre > 0 ? smooth(clamp(1 + c.t / c.pre, 0, 1)) : 0) : 0, ext = c.t < 0 ? 0 : Math.pow(Math.sin(Math.PI * Math.min(1, fa * 1.12)), 0.75) * (fa < 0.9 ? 1 : (1 - fa) / 0.1);
          const front = c.t < 0 ? 0 : Math.exp(-Math.pow((fa - 0.9) / 0.07, 2)), gath = Math.max(pre, c.t < 0 ? 0 : ground * (t > 0.02 ? 1 : 0));
          const k = Math.min(1, dt * 22); c.hopE += (ext - c.hopE) * k; c.hopG += (gath - c.hopG) * k; c.hopW += (front - c.hopW) * k; }
        c.rz += ((c.dir * (0.13 * Math.cos(Math.PI * fa) - 0.03) * (c.t < 0 ? 0 : 1)) - c.rz) * Math.min(1, dt * 12); // けった時は鼻が上（→ NOTES）
        if (t >= 1) { if (c.exit) { c.mode = "sit"; c.exit = null; c.h = 0; c.dir = 0; } else land(c, now); if (c.row === chars.length - 1) introDone = true; }
      } else {
        { const k = Math.min(1, dt * 9); c.hopE += (0 - c.hopE) * k; c.hopG += (0 - c.hopG) * k; c.hopW += (0 - c.hopW) * k; } // 着いたあと（→ NOTES）
        // 着いたあとは（→ NOTES）
        c.x = c.gx = T.x; c.gy = T.y; c.size = T.size; c.z = zBase(c); c.alpha = 1; c.comp = 1; c.air = 0;
        const near = fine && now - pAt < 4 && Math.hypot(px - c.x, py - (c.y - c.size * 0.4)) < c.size * 0.42;
        const asleep = info.act === "nap" && c.row === 0 && now > c.awakeUntil && now > c.actUntil - 2.6 + NAP_AT;
        c.hopV -= 2600 * dt; c.hop = Math.max(0, c.hop + c.hopV * dt); if (c.hop === 0 && c.hopV < 0) { if (c.hopV < -200) c.sqV = -2.4; c.hopV = 0; }
        if (introDone && now > c.hopAt && !asleep) { c.hopAt = now + 5 + Math.random() * 6; if (onScreen(r, 0) && Math.abs(vel) < 30) c.hopV = 300; }
        if (c.act === "play" && c.hop === 0 && c.hopV === 0 && now < c.actUntil - 1.9 && now > c.actUntil - 2.2) c.hopV = 300;   // ゲームの所では 2 回跳ねる
        // ページが動いているあいだは、とことこ歩く
        const moving = Math.abs(vel) > 60 && !asleep && !state.fixed;   // 場所が画面に止まっている所（→ NOTES）
        c.trot += ((moving ? 1 : 0) - c.trot) * Math.min(1, dt * 8); c.step += Math.abs(dy) / 64;
        { const ph = c.step % 1, lope = ph < 0.62 ? Math.sin(Math.PI * ph / 0.62) : 0; c.h = c.hop + lope * Math.min(7, c.size * 0.06) * c.trot; c.lope = (ph < 0.62 ? Math.cos(Math.PI * ph / 0.62) : -1) * c.trot; }
        c.y = T.y - c.h;
        // なでる：カーソルを乗せると、にっこり（→ NOTES）
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
        { const wb = c.mode === "sit" && c.idNow === "stretch" && c.env > 0.3 && !c.flat; if (wb !== c.bwG) { c.bwG = wb; c.bwT = 0; } if ((c.bwT ?? 1) < 1) { const w0 = c.bwT; c.bwT = Math.min(1, c.bwT + dt / 0.32); if (w0 < 0.5 && c.bwT >= 0.5) c.bw = wb; } }   // 伸び：前足を前へ・お尻を（→ NOTES）
        // 居眠り：のびて横になる（（→ NOTES）
        { const want = asleep && c.hop === 0; if (want !== c.flatGoal) { c.flatGoal = want; c.lieT = 0; if (want) c.fp = !!tex2 && Math.random() < 0.4; } if (c.lieT < 1) { const was = c.lieT; c.lieT = Math.min(1, c.lieT + dt / (want ? 0.7 : 0.45)); if (was < 0.5 && c.lieT >= 0.5) { c.flat = want; if (want) c.legIn = 0.45; if (want && c.fp) { c.dust = 0.8; c.dX = c.x; c.dY = c.gy; c.dK = 0.7; c.dDir = 0; } } }
          c.legIn = want ? (c.legIn || 0) * Math.max(0, 1 - dt * 3.2) : c.lieT < 0.5 ? c.lieT * 0.9 : 0;   // 横になると後ろ足をうしろへ少（→ NOTES）
          if (c.flat && (Math.random() < dt / 7 || (c.twN > 0 && (c.twN -= dt) <= 0))) { c.tw = 1; c.twN = Math.random() < 0.5 ? 0.3 : 0; } if (c.flat && Math.random() < dt / 11) c.sigh = 1; c.tw = Math.max(0, (c.tw || 0) - dt * 5); c.sigh = Math.max(0, (c.sigh || 0) - dt / 2.4); }   // 夢で足がぴくっ／ときどき大きく息
      }
      c.speed = Math.hypot(c.x - ox, c.y - oy) / Math.max(dt, 0.001);
      // 耳・頭の遅れ（重さ）：ス（→ NOTES）
      // 体のゆれは（→ NOTES）
      const sv = c.mode === "sit" && c.lastSY != null && dt > 0 ? (c.gy - c.lastSY) / dt : -vel; c.lastSY = c.mode === "sit" ? c.gy : null;
      const txl = c.mode === "fly" ? -c.dir * 0.11 : 0, tyl = clamp(-sv * 0.00011, -0.12, 0.12) + (c.mode === "sit" ? clamp(-c.hopV * 0.00015, -0.09, 0.09) : 0);
      c.lagXV += ((txl - c.lagX) * 150 - c.lagXV * 9) * dt; c.lagX += c.lagXV * dt;
      c.lagYV += ((tyl - c.lagY) * 150 - c.lagYV * 9) * dt; c.lagY += c.lagYV * dt;
      // 向き：移動中は進む方向へ。止まっているときは、P（→ NOTES）
      let ty = 0, tx = 0; const other = chars[1 - c.row], cursor = fine && now - pAt < 4;
      if (c.mode === "fly") ty = c.dir * (c.row ? 0.25 : 0.18);   // 絵がもう進む方を向いているの（→ NOTES）
      else if (c.asleep) { ty = 0.12; tx = 0.1; }
      else if (info.act === "nap" && c.row === 1 && !cursor) ty = Math.sign(other.x - c.x) * 0.42;   // ジルは、寝ているレンを見ている
      else if (now < c.lookUntil) ty = Math.sign(other.x - c.x) * 0.5;
      else if (cursor) { // カーソルを目で追う（→ NOTES）
        const dxn = (px - c.x) / c.size, dyn = (py - (c.y - c.size * 0.5)) / c.size, far = smooth(clamp((Math.hypot(dxn, dyn) - 0.25) / 0.9, 0, 1));
        ty = clamp((px - c.x) / W * 1.6, -0.5, 0.5) * (0.25 + 0.75 * far); tx = clamp((py - (c.y - c.size * 0.5)) / H * 0.5, -0.16, 0.2) * (0.3 + 0.7 * far);
        const toward = Math.sign(other.x - c.x) * ty; if (toward > 0) ty *= 1 - 0.45 * clamp(1.6 - Math.abs(other.x - c.x) / c.size, 0, 1); } // となりの子のほうへは（→ NOTES）
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
      // 向きは、ばねで追う（→ NOTES）
      c.ryV = (c.ryV || 0) + ((ty - c.ry) * 70 - (c.ryV || 0) * 15) * dt; c.ry += c.ryV * dt; c.rxV = (c.rxV || 0) + ((tx - c.rx) * 70 - (c.rxV || 0) * 15) * dt; c.rx += c.rxV * dt;
      if (c.spinT >= 0) { c.spinT += dt / 0.8; if (c.spinT >= 1) c.spinT = -1; }
      life(c, now, dt, other, cursor);
      if (now > c.blinkAt) c.blinkAt = now + 4 + Math.random() * 7;
      c.face = c.asleep || (c.mode === "sit" && (c.idNow === "groom" || (c.idNow === "stretch" && c.env > 0.5))) ? "blink" : now < c.happyUntil ? "happy" : (c.blinkAt - now < 0.13 && c.mode !== "fly" ? "blink" : "open");   // 跳んでいる間は（→ NOTES）
      if (c.alpha > 0.01 && c.y > -20 && c.y - c.size * 1.3 < H + 20 && c.x > -c.size && c.x < W + c.size) visible = true;
    }
    // 最初の画面で止まっていたら（→ NOTES）
    const jill = chars[1];
    if (state.active === 0 && introDone && jill.mode === "sit" && sy < 30 && now - lastScrollAt > 4.5 && now > hintAt && now - introAt > 4) { hintAt = now + 8; say(jill, "down", now, 2.6); jill.hopV = Math.max(jill.hopV, 240); }
    for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.t += dt; p.x += p.vx * dt; p.dy += p.vy * dt; p.vx *= 0.94; if (p.t > 0.6) puffs.splice(i, 1); else visible = true; }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > 0.5) rings.splice(i, 1); else visible = true; }
    for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; if (now > b.until || b.c.mode !== "sit") bubbles.splice(i, 1); }
    for (const m of motes) { m.a += m.va * dt; m.ph += dt; }
    const heroK = state.active === 0 && introDone ? clamp(1 - sy / (H * 0.9), 0, 1) : 0;
    // 場所が画面に止まっている間は 3D の画面も固定（→ NOTES）
    const pin = spotInfo[state.active] && spotInfo[state.active].pin, stuck = !!(pin && Math.abs(pin.el.getBoundingClientRect().top - pin.top) < 0.75 && chars.every((c) => c.mode !== "fly"));
    if (stuck !== state.fixed) { state.fixed = stuck; cv.style.position = stuck ? "fixed" : ""; cv.style.transform = stuck ? "none" : ""; placedY = -1; }
    offY = stuck ? 0 : wrap ? sy - place(sy) : 0;   // 下の端で画面を動かしきれない（→ NOTES）
    draw(now, visible, heroK);
    state.frames++;
    if (visible) {
      state.ready = true;
      // 遅い機械（→ NOTES）
      if (rawDt > 0.034 && rawDt < 0.25) slow++; else if (rawDt < 0.025) fast++;
      if (slow + fast >= 120) { if (slow > fast * 1.5) { if (state.quality === 1) { state.quality = 0.5; resize(true); } else if (Q !== "1") { fail({ message: "slow" }); return; } } slow = fast = 0; }
    }
  };

  const draw = (now, visible, heroK) => {
    if (!visible) { if (!cleared) { gl.clear(gl.COLOR_BUFFER_BIT); cleared = true; } return; }
    cleared = false; gl.clear(gl.COLOR_BUFFER_BIT);
    const wx = (x) => x - W / 2, wy = (y) => H / 2 - y - offY, dark = Math.max(tone[0], tone[1]);
    // 手前（z>0）に来ると遠近で外へずれる。着いてい（→ NOTES）
    const pin = (c) => 1 - c.comp * c.z / camD, cx = (c, x) => wx(x) * pin(c), cy = (c, y) => wy(y) * pin(c);
    gl.useProgram(progBlob.p); const ub = progBlob.u; gl.uniformMatrix4fv(ub.uP, false, proj);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.disableVertexAttribArray(1);
    const blob = (x, y, z, sx, sy2, ang, r, g, b, a, ring) => { gl.uniform3f(ub.uPos, x, y, z); gl.uniform2f(ub.uSz, sx, sy2); gl.uniform1f(ub.uAng, ang); gl.uniform1f(ub.uRing, ring || 0); gl.uniform4f(ub.uCol, r, g, b, a); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
    // 最初の画面（→ NOTES）
    if (heroK > 0.01) { const c = chars[0], j = chars[1]; if (c.mode === "sit" && j.mode === "sit") blob(wx((c.x + j.x) / 2), wy(c.y - c.size * 0.42), -40, c.size * 1.15, c.size * 0.8, 0, 1, 0.98, 0.9, 0.5 * heroK); }
    // 影・着地の輪・土ぼこり
    for (const c of chars) {
      if (c.alpha < 0.01 || c.mode === "wait") continue;
      const k = clamp(1 - c.h / (c.size * 1.3), 0.25, 1), s = 0.7 + 0.3 * k, d = 1 - dark;
      const fs = c.flatGoal ? c.lieT : 1 - c.lieT, mc2 = Math.cos(c.tA || 0), bodyX = -(c.row ? -1 : 1) * Math.sign(mc2) * c.size * 0.06;   // かげは体（頭のうしろ）の下へ少しずらす
      blob(cx(c, c.gx + bodyX * (1 - Math.max(0, fs))) + Math.max(0, fs) * flatOff(c) * c.size * 0.9, cy(c, c.gy + c.size * 0.004), c.z, c.size * (0.36 + 0.26 * Math.max(0, fs)) * s * (1 + c.ext) * (0.78 + 0.22 * Math.abs(mc2)), c.size * (0.055 - 0.01 * Math.max(0, fs)) * s, 0, 0.17 * d, 0.11 * d, 0.07 * d, (0.30 + 0.25 * dark) * k * c.alpha * (1 - c.air) * (1 + 0.35 * (c.dust || 0)));   // 向きを変える途中はかげも短く（→ NOTES）
      if (c.dust > 0) { const k = 1 - c.dust; for (const sd of [-1, 1]) blob(cx(c, c.dX + sd * c.size * (0.1 + 0.16 * k) - (c.dir || c.dDir || 0) * c.size * 0.12 * k), cy(c, c.dY - c.size * 0.05 * k), c.z, c.size * (0.04 + 0.05 * k) * (c.dK || 1), c.size * (0.016 + 0.014 * k) * (c.dK || 1), 0, dark ? 0.93 : 0.55, dark ? 0.89 : 0.45, dark ? 0.82 : 0.36, (dark ? 0.3 : 0.2) * c.dust * c.alpha); }   // 土ぼこりは（→ NOTES）
    }
    for (const p of rings) { const k = p.t / 0.5, rr = p.r * (1 + k * 2.2); blob(wx(p.x), wy(p.dy - scrollY), 0, rr, rr * 0.22, 0, 1, 0.87 + 0.1 * dark, 0.66 + 0.2 * dark, 0.5 * (1 - k) * (1 - k), 1); }
    for (const p of puffs) { const k = p.t / 0.6, rr = p.r * (1 + k * 1.6); blob(wx(p.x), wy(p.dy - scrollY), 0, rr, rr, 0, 0.93, 0.86, 0.74, 0.5 * (1 - k)); }
    // 2 人（奥から順に）
    gl.useProgram(progChar.p); const u = progChar.u; gl.uniformMatrix4fv(u.uP, false, proj);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u.uT, 0);
    // 光：登場のときは左から右へさっと流れ（→ NOTES）
    const doc = Math.max(1, root.scrollHeight - H);
    let lx, ly; const sweep = now - introAt;
    if (sweep > 0 && sweep < 2.1) { lx = -1.3 + smooth(sweep / 2.1) * 2.1; ly = 0.6; }
    else if (fine && now - pAt < 6) { lx = (px / W - 0.5) * 1.6; ly = 0.55 - (py / H - 0.5) * 0.8; } else { const ang = (scrollY / doc) * Math.PI * 3 + now * 0.15; lx = Math.sin(ang) * 0.75; ly = 0.6; }
    const ll = Math.hypot(lx, ly, 0.9); gl.uniform3f(u.uL, lx / ll, ly / ll, 0.9 / ll);
    // 場所の色に合わせる（→ NOTES）
    gl.uniform3f(u.uAmb, 1 - 0.06 * tone[0] - 0.02 * tone[1], 1 - 0.03 * tone[0] - 0.04 * tone[1], 1 + 0.04 * tone[0] - 0.08 * tone[1]);
    gl.uniform4f(u.uRim, 0.75 * tone[0] + 1.0 * tone[1], 0.85 * tone[0] + 0.8 * tone[1], 1.0 * tone[0] + 0.5 * tone[1], 0.34 * dark);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    for (const c of (chars[0].z <= chars[1].z ? chars : [chars[1], chars[0]])) {
      if (c.alpha < 0.01 || c.mode === "wait") continue;
      const mc = Math.cos(c.tA || 0), mm = mc < 0 ? -1 : 1, tw = Math.abs(Math.sin(c.tA || 0)), piv = c.tq < 1 ? Math.sin(Math.PI * c.tq) : 0;   // 向きを変える途中：小さく跳ねながらまわる
      const fl = !!c.flat, fp = fl && c.fp && tex2, bw = !fl && !!c.bw, R = fp ? FLOP_R[c.row] : fl ? POSE_R[c.row] : bw ? BOW_R[c.row] : 1, dip = (c.bwT < 1 ? 1 - 0.1 * Math.sin(Math.PI * c.bwT) : 1) * (c.lieT < 1 ? 1 - 0.16 * Math.sin(Math.PI * c.lieT) : 1) * (1 - 0.08 * tw) * (c.tq > 0.85 && c.tq < 1 ? 1 - 0.06 * Math.sin(Math.PI * (c.tq - 0.85) / 0.15) : 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, fp ? meshesP[c.row] : fl ? meshesF[c.row] : bw ? meshesB[c.row] : meshes[c.row]);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);
      const wig = c.spinT >= 0 ? Math.sin(c.spinT * Math.PI * 4) * 0.17 * (1 - c.spinT) : 0;   // 押したとき：体を左右に振る
      gl.uniform3f(u.uPos, cx(c, c.x + (c.sl || 0) + piv * c.size * 0.05 * (c.tG > 1.5 ? -1 : 1) * (c.row ? -1 : 1)) + (fl ? flatOff(c) * c.size : bw ? (BOW_X[c.row] + (c.row ? 0.24 : -0.24)) * mm * c.size : 0), cy(c, c.y - c.size * (c.row ? 0.07 : 0.045) * piv), c.z); gl.uniform1f(u.uSize, (c.size * pin(c) + c.size * (1 - pin(c)) * 0.45) * R);   // 近づくぶんは少し大きく（→ NOTES）
      gl.uniform1f(u.uM, fl ? (mc < 0 ? Math.PI : 0) : c.tA || 0); gl.uniform1f(u.uMf, mm > 0 ? 1 : -1);
      gl.uniform3f(u.uRot, fl ? 0 : c.rx, fl ? 0 : c.ry, fl ? 0 : c.rz + wig + (c.flatGoal && c.lieT < 0.5 ? (c.row ? 1 : -1) * mm * (c.fp ? 0.2 * Math.pow(c.lieT * 2, 1.7) : 0.14 * Math.sin(Math.PI * c.lieT * 2)) : 0)); gl.uniform1f(u.uTurn, fl ? 0 : clamp(c.ry, -0.6, 0.6) + ((c.tA || 0) > 1.5708 ? (c.tA || 0) - Math.PI : c.tA || 0) * 0.45); gl.uniform2f(u.uSq, (1 + c.ext) / Math.sqrt(c.sq * dip), c.sq * dip); gl.uniform2f(u.uLag, fl ? 0 : c.lagX, fl ? 0 : c.lagY);   // 寝る：体が長いので回さな（→ NOTES）
      { const B = BODY[c.row], breath = (c.asleep ? 0.05 : 0.03 + 0.02 * c.exert) * (0.5 + 0.5 * Math.sin(c.br));
        if (fl || bw) { // 寝ている（→ NOTES）
          gl.uniform4f(u.uEar, 0, 0, 0, 0); gl.uniform4f(u.uEarP, B.ear[0], B.ear[1], B.ear[2], B.ear[3]); gl.uniform4f(u.uHead, 0, 0, B.neck, 0); gl.uniform4f(u.uNose, 0.5, 0.5, 0, 0);
          gl.uniform4f(u.uBelly, c.row ? 0.42 : 0.58, 0.2, 0.2, breath * (1.4 + 1.6 * Math.sin(Math.PI * (c.sigh || 0)))); }
        else {
        gl.uniform4f(u.uEar, c.eL, c.eR, c.flap, c.eW); gl.uniform4f(u.uEarP, B.ear[0], B.ear[1], B.ear[2], B.ear[3]);
        gl.uniform4f(u.uHead, c.hx, c.hy, B.neck, c.ht); gl.uniform4f(u.uNose, B.nose[0], B.nose[1], c.nose, c.nose * 6);
        gl.uniform4f(u.uBelly, B.belly[0], B.belly[1], B.belly[2], breath); } }
      gl.uniform4f(u.uHop, fl ? 0 : c.hopE || 0, fl ? (c.legIn || 0) + Math.sin(Math.PI * (c.tw || 0)) * 0.1 : (c.hopG || 0) + 0.5 * tw, fl ? (c.row ? -1 : 1) * mm : (c.mode === "fly" ? c.dir : c.hopDir || 0) * Math.sign(mm), fl ? 0 : c.hopW || 0);
      if (fp) gl.bindTexture(gl.TEXTURE_2D, tex2); gl.uniform4fv(u.uTile, fp ? t2(0, c.row) : fl ? tile(0, 2 + c.row) : bw ? tile(2, 2 + c.row) : tile(FACE[c.face], c.row)); gl.uniform4fv(u.uDTile, fp ? t2(1, c.row) : fl ? tile(1, 2 + c.row) : tile(3, bw ? 2 + c.row : c.row));
      gl.uniform1f(u.uAlpha, c.alpha); gl.uniform1f(u.uBias, clamp(Math.abs(c.z) / 420, 0, 1) * 2.2 + (c.mode === "fly" ? clamp(c.speed / 2600, 0, 1) * 1.1 : 0));   // 遠い・近い・速いときは少しぼかす
      gl.drawElements(gl.TRIANGLES, idxCount, gl.UNSIGNED_SHORT, 0); if (fp) gl.bindTexture(gl.TEXTURE_2D, tex);
    }
    gl.disableVertexAttribArray(1); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // 頭の上の印
    if (bubbles.length) {
      gl.useProgram(progIcon.p); const ui = progIcon.u; gl.uniformMatrix4fv(ui.uP, false, proj); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texIcon); gl.uniform1i(ui.uI, 1);
      for (const b of bubbles) {
        const t = now - b.t0; if (t < 0) continue; const c = b.c, out = clamp((b.until - now) / 0.25, 0, 1);
        const pop = t < 0.35 ? 1 + Math.sin(t / 0.35 * Math.PI) * 0.25 - Math.pow(1 - t / 0.35, 3) : 1, s = clamp(c.size * 0.2, 17, 34) * pop * (0.6 + 0.4 * out);
        const fsg = Math.cos(c.tA || 0) < 0 ? -1 : 1, bx = c.x + c.size * (c.flat ? flatOff(c) + fsg * (c.row ? -1 : 1) * (POSE_R[c.row] / 2 - 0.32) : (c.row ? 0.2 : -0.06) * fsg), by = c.y - c.size * (c.row ? 0.93 : c.flat ? 0.8 : 0.9) - s - Math.sin(t * (c.flat ? 1.5 : 3)) * 2;
        gl.uniform3f(ui.uPos, wx(clamp(bx, s + 4, W - s - 4)), wy(Math.max(by, s + 4)), c.z + 30); gl.uniform2f(ui.uSz, s, s); gl.uniform1f(ui.uAng, Math.sin(t * 2.2) * 0.07);
        gl.uniform4f(ui.uTile, ICONS.indexOf(b.icon) / ICONS.length, 0, 1 / ICONS.length, 1); gl.uniform1f(ui.uAlpha, out); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.activeTexture(gl.TEXTURE0);
    }
    // 手前の牧草（→ NOTES）
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
  const onReduce = () => { if (mqReduce.matches) fail({ message: "reduced-motion" }); };   // 途中で「動きを減らす」に変え（→ NOTES）
  if (mqReduce.addEventListener) mqReduce.addEventListener("change", onReduce); else if (mqReduce.addListener) mqReduce.addListener(onReduce);

  const img = new Image(); img.decoding = "async"; img.crossOrigin = "anonymous";   // 絵が別の場所（→ NOTES）
  img.onload = () => { try { fitWrap(); build(img); resize(true); findSpots(); go(); } catch (e) { fail(e); } };
  img.onerror = fail;
  img.src = (document.currentScript && document.currentScript.dataset.atlas) || "img/g3d/atlas.webp";
})();
