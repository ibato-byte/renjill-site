/* レンとジルの「案内役」— スクロールに合わせて、2 人が 3D でページを案内する（2026-11-15）
 *
 * しくみ（外部ライブラリなし・WebGL を直接書いている）
 *  - 絵は img/g3d/atlas.webp の 1 枚（表情 3 種＋奥行き）。作り直しは tools/make_g3d.py
 *  - 奥行きの絵で、板を体の形にふくらませる（レリーフ）。向きを変えると本当に立体に見え、光の当たり方も変わる
 *  - カメラは本物の遠近（Z の奥行き）。z=0 の面が画面の 1px と一致するので、HTML の位置とぴったり合う
 *  - 立つ場所は HTML の <i class="g3d-spot">（見出しの線の上など。CSS で決める＝画面の幅ごとに調整できる）
 *    画面の上から 78% より上に来た最後の場所へ、2 人が跳ねて移動する。着いたら、その場所に貼りつく（ページと一緒に動く）
 *  - 動かない条件：動きを減らす設定・通信量の節約・WebGL が無い／遅い機械。そのときは何も足さない（元の絵のまま）
 *    確かめるとき：?g3d=1（遅い機械でも動かす）／?g3d=0（止める）
 */
(() => {
  "use strict";
  const Q = new URLSearchParams(location.search).get("g3d");
  const conn = navigator.connection || {};
  if (Q === "0") return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || conn.saveData) return;
  const cv = document.getElementById("g3d");
  if (!cv) return;
  let gl = null;
  try {
    const opt = { alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: Q !== "1" };
    gl = cv.getContext("webgl", opt) || cv.getContext("experimental-webgl", opt);
  } catch (e) { gl = null; }
  if (!gl) return;

  const root = document.documentElement;
  const state = { ready: false, lost: false, frames: 0, active: -1, chars: [] };
  window.__g3d = state;

  /* ───────── 絵のます目（tools/make_g3d.py と同じ数字） ───────── */
  const AW = 2048, AH = 1024, CELL = 512, PAD = 16, INNER = CELL - PAD * 2;
  const tile = (col, row) => [(col * CELL + PAD) / AW, (row * CELL + PAD) / AH, INNER / AW, INNER / AH];
  const FACE = { open: 0, blink: 1, happy: 2 };
  const FOOT = 0.058;      // 絵の下から足の裏までの割合
  const GRID = 40;         // 板の分割数
  const DEPTH = 0.24;      // ふくらみの厚さ（絵の幅に対して）
  const FOV = 30 * Math.PI / 180;

  /* ───────── シェーダー ───────── */
  const VS_CHAR = `
attribute vec2 aUv; attribute float aD;
uniform mat4 uP; uniform vec3 uPos; uniform float uSize; uniform vec3 uRot; uniform vec2 uSq; uniform vec2 uLag;
varying vec2 vUv;
void main() {
  float top = max(aUv.y - ${FOOT.toFixed(3)}, 0.0) / ${(1 - FOOT).toFixed(3)};
  vec3 p = vec3((aUv.x - 0.5) * uSq.x, (aUv.y - ${FOOT.toFixed(3)}) * uSq.y, aD * ${DEPTH.toFixed(2)} * uSq.x);
  p.xy += uLag * top * top;
  float cz = cos(uRot.z), sz = sin(uRot.z); p.xy = vec2(p.x * cz - p.y * sz, p.x * sz + p.y * cz);
  float cx = cos(uRot.x), sx = sin(uRot.x); p.yz = vec2(p.y * cx - p.z * sx, p.y * sx + p.z * cx);
  float cy = cos(uRot.y), sy = sin(uRot.y); p.xz = vec2(p.x * cy + p.z * sy, -p.x * sy + p.z * cy);
  vUv = vec2(aUv.x, 1.0 - aUv.y);
  gl_Position = uP * vec4(uPos + p * uSize, 1.0);
}`;
  const FS_CHAR = `
precision mediump float;
uniform sampler2D uT; uniform vec4 uTile; uniform vec4 uDTile; uniform vec3 uL; uniform float uAlpha; uniform float uBias; uniform float uTurn;
varying vec2 vUv;
float dep(vec2 uv) { return texture2D(uT, uDTile.xy + clamp(uv, 0.0, 1.0) * uDTile.zw).r; }
void main() {
  vec4 c = texture2D(uT, uTile.xy + vUv * uTile.zw, uBias);
  float e = 0.014;
  vec3 n = normalize(vec3((dep(vUv - vec2(e, 0.0)) - dep(vUv + vec2(e, 0.0))) * 3.2, (dep(vUv + vec2(0.0, e)) - dep(vUv - vec2(0.0, e))) * 3.2, 1.0));
  float cy = cos(uTurn), sy = sin(uTurn); n.xz = vec2(n.x * cy + n.z * sy, -n.x * sy + n.z * cy);
  float ndl = dot(n, uL);
  float rim = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.0);
  vec3 col = c.rgb * (0.80 + 0.30 * clamp(ndl, -0.4, 1.0));
  col += vec3(1.0, 0.93, 0.80) * rim * 0.20 * smoothstep(-0.2, 0.7, ndl);
  float a = c.a * uAlpha;
  gl_FragColor = vec4(col * a, a);
}`;
  const VS_BLOB = `
attribute vec2 aQ; uniform mat4 uP; uniform vec3 uPos; uniform vec2 uSz; varying vec2 vQ;
void main() { vQ = aQ; gl_Position = uP * vec4(uPos + vec3(aQ * uSz, 0.0), 1.0); }`;
  const FS_BLOB = `
precision mediump float; uniform vec4 uCol; varying vec2 vQ;
void main() { float d = length(vQ); float a = smoothstep(1.0, 0.25, d) * uCol.a; gl_FragColor = vec4(uCol.rgb * a, a); }`;

  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader"); return s; };
  const program = (vs, fs, attrs) => {
    const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  };

  let progChar, progBlob, tex, quadBuf, idxBuf, idxCount, meshes = [];
  const proj = new Float32Array(16);
  let W = 1, H = 1, DPR = 1, camD = 1;

  const build = (img) => {
    progChar = program(VS_CHAR, FS_CHAR, ["aUv", "aD"]);
    progBlob = program(VS_BLOB, FS_BLOB, ["aQ"]);
    tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // 奥行きを頂点に焼きこむ（頂点シェーダーで絵を読めない機械でも動くように）
    const N = GRID + 1, c2 = document.createElement("canvas"); c2.width = N; c2.height = N * 2;
    const g = c2.getContext("2d", { willReadFrequently: true });
    meshes = [0, 1].map((row) => {
      g.clearRect(0, 0, N, N); g.drawImage(img, 3 * CELL + PAD, row * CELL + PAD, INNER, INNER, 0, 0, N, N);
      const px = g.getImageData(0, 0, N, N).data, v = new Float32Array(N * N * 3);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = (j * N + i) * 3; v[k] = i / GRID; v[k + 1] = j / GRID; v[k + 2] = px[((N - 1 - j) * N + i) * 4] / 255; }
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW); return b;
    });
    const idx = new Uint16Array(GRID * GRID * 6); let q = 0;
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) { const a = j * N + i, b = a + 1, c = a + N, d = c + 1; idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c; }
    idxBuf = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW); idxCount = idx.length;
    quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
  };

  const resize = () => {
    const w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, w < 700 ? 2 : 1.75);
    if (w === W && h === H && dpr === DPR) return;
    W = w; H = h; DPR = dpr; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    gl.viewport(0, 0, cv.width, cv.height);
    camD = H / (2 * Math.tan(FOV / 2));
    const f = 1 / Math.tan(FOV / 2), near = camD * 0.05, far = camD * 6, nf = 1 / (near - far);
    proj.fill(0); proj[0] = f / (W / H); proj[5] = f; proj[10] = (far + near) * nf; proj[11] = -1; proj[14] = 2 * far * near * nf + (-camD) * proj[10]; proj[15] = camD;
    // ↑ 透視投影 × カメラを z=camD に置く平行移動 をまとめたもの
  };

  /* ───────── 立つ場所 ───────── */
  let spots = [];
  const findSpots = () => { spots = [...document.querySelectorAll(".g3d-spot")].filter((e) => e.offsetParent !== null || getComputedStyle(e).position === "fixed"); };
  const spotRect = (i) => spots[i] ? spots[i].getBoundingClientRect() : null;

  /* ───────── 2 人 ───────── */
  // fx：場所の箱の中での足の位置（横）／k：箱の高さに対する背の高さ／dz：手前に出す量
  const DEF = [{ name: "ren", row: 0, fx: 0.36, k: 1.0, dz: 0, delay: 0 }, { name: "jill", row: 1, fx: 0.80, k: 0.74, dz: 26, delay: 0.14 }];
  const mk = (d) => ({ ...d, x: 0, y: 0, z: 0, size: 100, alpha: 0, mode: "wait", t: 0, dur: 1, hops: 1, hopH: 60, zArc: 0, from: null, exit: null, h: 0, gx: 0, gy: 0,
    face: "open", blinkAt: 1.5 + Math.random() * 3, happyUntil: 0, ry: 0, rx: 0, rz: 0, sq: 1, sqV: 0, lagX: 0, lagXV: 0, lagY: 0, lagYV: 0, dir: 0, hopAt: 0, hop: 0, hopV: 0, landed: false, seen: false });
  const chars = DEF.map(mk); state.chars = chars;
  const puffs = [];

  const targetOf = (c, r) => ({ x: r.left + r.width * c.fx, y: r.bottom, size: (r.height * c.k) / (1 - FOOT - 0.085) });
  const onScreen = (r, m) => r.bottom > -m && r.top < H + m && r.right > -m && r.left < W + m;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // 最初の画面だけ：スクロールすると 2 人がカメラのほうへ近づく（奥行きのあるスクロール）
  const zBase = (c) => c.dz + (state.active === 0 ? clamp(scrollY, 0, 700) * 0.42 : 0);
  const smooth = (t) => t * t * (3 - 2 * t);

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
    c.hopH = clamp(dist / c.hops * 0.42, 34, 150) * (opt.intro ? 1.3 : 1);
    c.zArc = opt.intro ? 0 : clamp(dist * 0.35, 0, 240);
    c.dur = opt.intro ? 1.5 : 0.5 + 0.24 * c.hops + dist / 4200;
    c.t = -c.delay - (opt.wait || 0); c.mode = "fly"; c.dir = Math.sign(E.x - fx) || 0; c.seen = true;
  };

  const land = (c, now) => {
    c.mode = "sit"; c.h = 0; c.z = zBase(c); c.sqV = -3.2; c.happyUntil = now + 1.1; c.landed = true; c.dir = 0;
    if (c.y > 0 && c.y < H + 20) for (let i = 0; i < 5; i++) puffs.push({ x: c.x + (Math.random() - 0.5) * c.size * 0.5, dy: c.y + scrollY - 2, vx: (Math.random() - 0.5) * 90, vy: -20 - Math.random() * 40, r: c.size * (0.05 + Math.random() * 0.05), t: 0 });
  };

  /* ───────── 入力（ポインター・スクロール） ───────── */
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  let px = -1, py = -1, pAt = -10, lastY = scrollY, vel = 0;
  addEventListener("pointermove", (e) => { px = e.clientX; py = e.clientY; pAt = performance.now() / 1000; }, { passive: true });
  addEventListener("pointerdown", (e) => {
    const now = performance.now() / 1000;
    for (const c of chars) if (c.mode === "sit" && Math.hypot(e.clientX - c.x, e.clientY - (c.y - c.size * 0.4)) < c.size * 0.5) { c.hopV = 520; c.happyUntil = now + 1.2; }
  }, { passive: true });

  /* ───────── 毎フレーム ───────── */
  let last = 0, started = false, raf = 0, introDone = false;
  const heroGo = () => { const h = document.getElementById("hero"); return !h || h.classList.contains("go") || scrollY > 40; };

  const pickActive = () => {
    let a = -1;
    for (let i = 0; i < spots.length; i++) { const r = spots[i].getBoundingClientRect(); if (r.height > 0 && r.bottom < H * 0.78 + (i === 0 ? 1e6 : i === state.active ? 70 : 0)) a = i; }   // いまの場所は 70px ぶん粘る（境目で行ったり来たりしない）
    return a;
  };

  const frame = (ms) => {
    raf = requestAnimationFrame(frame);
    if (state.lost) return;
    const now = ms / 1000, dt = Math.min(0.05, last ? now - last : 0.016); last = now;
    resize();
    const sy = scrollY, v = (sy - lastY) / Math.max(dt, 0.001); lastY = sy; vel += (v - vel) * Math.min(1, dt * 10);
    if (!spots.length) findSpots();
    if (!started) { if (!heroGo() || !spots.length) return; started = true; }
    const a = pickActive();
    if (a !== state.active && a >= 0) { const first = state.active < 0; state.active = a; const intro = first && a === 0 && sy < 40; for (const c of chars) launch(c, now, { intro, wait: intro ? 0.35 : 0 }); if (!intro) introDone = true; }
    const r = spotRect(state.active);
    let visible = false;
    for (const c of chars) {
      if (!r || c.mode === "wait") continue;
      const T = targetOf(c, r);
      if (c.mode === "fly") {
        c.t += dt;
        if (c.exit && onScreen(r, 0) && c.t > 0) { launch(c, now); continue; }            // 出ていく途中で行き先が見えた → そこへ向かい直す
        const t = clamp(c.t / c.dur, 0, 1), E = c.exit || T, fy = c.from.dy - sy;
        const u = t * c.hops, f = u >= c.hops ? 1 : u - Math.floor(u), p = (Math.min(Math.floor(u), c.hops - 1) + smooth(f)) / c.hops;
        c.gx = c.from.x + (E.x - c.from.x) * p; c.gy = fy + (E.y - fy) * p;
        c.h = Math.sin(Math.PI * f) * c.hopH * (c.t < 0 ? 0 : 1);
        c.x = c.gx; c.y = c.gy - c.h;
        c.z = c.from.z + (zBase(c) - c.from.z) * smooth(t) + Math.sin(Math.PI * t) * c.zArc;
        c.size = c.from.size + (T.size - c.from.size) * p;
        c.alpha = c.t < 0 ? (c.from.z < -10 ? 0 : c.alpha) : Math.min(1, c.alpha + dt * 5);
        const air = Math.sin(Math.PI * f), ground = Math.exp(-Math.pow(Math.min(f, 1 - f) / 0.1, 2));
        c.sq = 1 + 0.10 * air - 0.16 * ground * (t > 0.02 ? 1 : 0);
        c.rz += ((-c.dir * 0.10 * air) - c.rz) * Math.min(1, dt * 12);
        if (t >= 1) { if (c.exit) { c.mode = "sit"; c.exit = null; c.h = 0; c.dir = 0; } else land(c, now); if (c.row === chars.length - 1 || c.name === "jill") introDone = true; }
      } else {
        // 着いたあとは、その場所に貼りつく（ページと一緒に動く）
        c.x = c.gx = T.x; c.gy = T.y; c.size = T.size; c.z = zBase(c); c.alpha = 1;
        c.hopV -= 2600 * dt; c.hop = Math.max(0, c.hop + c.hopV * dt); if (c.hop === 0 && c.hopV < 0) { if (c.hopV < -200) c.sqV = -2.4; c.hopV = 0; }
        if (introDone && now > c.hopAt) { c.hopAt = now + 5 + Math.random() * 6; if (onScreen(r, 0) && Math.abs(vel) < 30) c.hopV = 300; }
        c.h = c.hop; c.y = T.y - c.h;
        c.sqV += (-(c.sq - 1) * 190 - c.sqV * 13) * dt; c.sq += c.sqV * dt; c.sq = clamp(c.sq, 0.7, 1.25);
        c.rz += (clamp(-vel * 0.00004, -0.12, 0.12) - c.rz) * Math.min(1, dt * 8);
        if (fine && now - pAt < 4 && Math.hypot(px - c.x, py - (c.y - c.size * 0.4)) < c.size * 0.42 && now > c.happyUntil) { c.happyUntil = now + 0.9; if (c.hop === 0) c.hopV = 260; }
      }
      // 耳・頭の遅れ（重さ）：スクロールや移動の速さに、ばねで遅れてついてくる
      const txl = c.mode === "fly" ? -c.dir * 0.06 : 0, tyl = clamp(vel * 0.00006, -0.07, 0.07) + (c.mode === "sit" ? clamp(-c.hopV * 0.00008, -0.05, 0.05) : 0);
      c.lagXV += ((txl - c.lagX) * 160 - c.lagXV * 11) * dt; c.lagX += c.lagXV * dt;
      c.lagYV += ((tyl - c.lagY) * 160 - c.lagYV * 11) * dt; c.lagY += c.lagYV * dt;
      // 向き：移動中は進む方向へ。止まっているときは、PC はカーソルのほう、スマホはゆっくり見回す
      let ty = 0, tx = 0;
      if (c.mode === "fly") ty = c.dir * 0.55;
      else if (fine && now - pAt < 4) { ty = clamp((px - c.x) / W * 1.6, -0.5, 0.5); tx = clamp((py - (c.y - c.size * 0.5)) / H * 0.5, -0.16, 0.2); }
      else ty = Math.sin(now * 0.55 + c.row * 1.7) * 0.2 + clamp((W * 0.5 - c.x) / W, -0.5, 0.5) * 0.35;
      c.ry += (ty - c.ry) * Math.min(1, dt * 6); c.rx += (tx - c.rx) * Math.min(1, dt * 6);
      // 表情
      if (now > c.blinkAt) c.blinkAt = now + 2.4 + Math.random() * 3.6;
      c.face = now < c.happyUntil ? "happy" : (c.blinkAt - now < 0.13 ? "blink" : "open");
      if (c.alpha > 0.01 && c.y > -20 && c.y - c.size < H + 20 && c.x > -c.size && c.x < W + c.size) visible = true;
    }
    for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.t += dt; p.x += p.vx * dt; p.dy += p.vy * dt; p.vx *= 0.94; if (p.t > 0.6) puffs.splice(i, 1); else visible = true; }
    draw(now, visible);
    state.frames++;
    if (!state.ready && visible) { state.ready = true; root.classList.add("g3d-on"); }
  };

  let cleared = false;
  const draw = (now, visible) => {
    if (!visible) { if (!cleared) { gl.clear(gl.COLOR_BUFFER_BIT); cleared = true; } return; }
    cleared = false; gl.clear(gl.COLOR_BUFFER_BIT);
    const wx = (x) => x - W / 2, wy = (y) => H / 2 - y;
    // 影と土ぼこり
    gl.useProgram(progBlob.p); gl.uniformMatrix4fv(progBlob.u.uP, false, proj);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.disableVertexAttribArray(1);
    for (const c of chars) {
      if (c.alpha < 0.01 || c.mode === "wait") continue;
      const k = clamp(1 - c.h / (c.size * 1.3), 0.25, 1);
      gl.uniform3f(progBlob.u.uPos, wx(c.gx), wy(c.gy + c.size * 0.004), c.z); gl.uniform2f(progBlob.u.uSz, c.size * 0.36 * (0.7 + 0.3 * k), c.size * 0.055 * (0.7 + 0.3 * k));
      gl.uniform4f(progBlob.u.uCol, 0.17, 0.11, 0.07, 0.30 * k * c.alpha); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    for (const p of puffs) {
      const k = p.t / 0.6, rr = p.r * (1 + k * 1.6);
      gl.uniform3f(progBlob.u.uPos, wx(p.x), wy(p.dy - scrollY), 0); gl.uniform2f(progBlob.u.uSz, rr, rr);
      gl.uniform4f(progBlob.u.uCol, 0.93, 0.86, 0.74, 0.5 * (1 - k)); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    // 2 人（奥から順に）
    gl.useProgram(progChar.p); const u = progChar.u; gl.uniformMatrix4fv(u.uP, false, proj);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u.uT, 0);
    // 光：PC はカーソルの方向から、スマホはページの進みぐあいでゆっくり回る
    const doc = Math.max(1, root.scrollHeight - H);
    let lx, ly;
    if (fine && now - pAt < 6) { lx = (px / W - 0.5) * 1.6; ly = 0.55 - (py / H - 0.5) * 0.8; } else { const ang = (scrollY / doc) * Math.PI * 3 + now * 0.15; lx = Math.sin(ang) * 0.75; ly = 0.6; }
    const ll = Math.hypot(lx, ly, 0.9); gl.uniform3f(u.uL, lx / ll, ly / ll, 0.9 / ll);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    for (const c of [...chars].sort((p, q) => p.z - q.z)) {
      if (c.alpha < 0.01 || c.mode === "wait") continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, meshes[c.row]);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
      gl.uniform3f(u.uPos, wx(c.x), wy(c.y), c.z); gl.uniform1f(u.uSize, c.size);
      gl.uniform3f(u.uRot, c.rx, c.ry, c.rz); gl.uniform1f(u.uTurn, c.ry); gl.uniform2f(u.uSq, 1 / Math.sqrt(c.sq), c.sq); gl.uniform2f(u.uLag, c.lagX, c.lagY);
      gl.uniform4fv(u.uTile, tile(FACE[c.face], c.row)); gl.uniform4fv(u.uDTile, tile(3, c.row));
      gl.uniform1f(u.uAlpha, c.alpha); gl.uniform1f(u.uBias, clamp(Math.abs(c.z) / 420, 0, 1) * 2.2);
      gl.drawElements(gl.TRIANGLES, idxCount, gl.UNSIGNED_SHORT, 0);
    }
  };

  /* ───────── 始める ───────── */
  const stop = () => { cancelAnimationFrame(raf); raf = 0; last = 0; };
  const go = () => { if (!raf && !document.hidden && !state.lost) { lastY = scrollY; raf = requestAnimationFrame(frame); } };
  const fail = (e) => { state.lost = true; state.err = e && e.message ? String(e.message).slice(0, 300) : (e && e.type) || ""; stop(); root.classList.remove("g3d-on"); cv.style.display = "none"; };
  cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); fail(); });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : go()));
  addEventListener("resize", () => { findSpots(); }, { passive: true });
  addEventListener("pageshow", go);

  const img = new Image(); img.decoding = "async";
  img.onload = () => { try { build(img); resize(); findSpots(); go(); } catch (e) { fail(e); } };
  img.onerror = fail;
  img.src = (document.currentScript && document.currentScript.dataset.atlas) || "img/g3d/atlas.webp";
})();
