/**
 * Mascote do Curious (raposa ou coruja), a partir de vídeos gerados por IA.
 *
 * Efeito "segue o cursor" como nos sites de referência: scripts/mascote-quadros.py
 * extrai um trecho CONTÍNUO do vídeo em que o bicho vira a cabeça do perfil
 * esquerdo ao direito (assets/img/<mascote>/caminho.json). Cada quadro tem uma
 * posição "u" (0..1) nesse caminho; o mouse define o u alvo, uma mola leva o u
 * atual até ele e cada frame mostra a mistura dos dois quadros vizinhos —
 * quadros consecutivos do vídeo, então o giro sai liso. Os quadros da virada em
 * que o bicho pisca ocupam um trecho curto e o mascote nunca para neles.
 *
 * Posição em "unidades de cena", as mesmas das poses de curious.js.
 */

const HEAD_Y = 1.62;           // centro da cabeça em unidades de cena (escala 1)
const FRAME_H = 3.7;           // altura do quadro em unidades de cena (escala 1)
const CAM_Y = 1.3;             // centro da tela em unidades de cena
const VIEW_H = 2 * 11.5 * Math.tan((13 * Math.PI) / 180);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

function loadImg(src) {
  return new Promise((res) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

export function createMascot(canvas, { base = '' } = {}) {
  const ctx = canvas.getContext('2d');
  const buf = document.createElement('canvas');
  const bctx = buf.getContext('2d');
  let meta = null;
  let path = [];       // { img, u, open } em ordem
  let opens = [];      // u dos quadros de olho aberto
  let reaction = [];
  let smile = null;
  let ready = false;
  const readyCbs = [];
  // modo "anel" (coruja 360): olhar em todas as direções
  let anel = false;
  let ring = [];       // { img, a } ordenado por ângulo (graus; 0 = direita, 90 = baixo)
  let center = null;

  /* estado */
  const st = {
    gx: 0, gy: 0, vgx: 0, vgy: 0,      // olhar 2D atual (modo anel), -1..1
    u: 0.5, vU: 0, tU: 0.5, rawU: 0.5, still: 0,
    nod: 0, vNod: 0, tNod: 0,
    target: { x: innerWidth / 2, y: innerHeight * 0.4 },
    sleep: 0, idle: 0, lastMove: performance.now(),
    react: -1, smile: 0,
    hop: 0, hopV: 0, tilt: 0, tiltTarget: 0,
    surprised: 0,
  };
  const pose = { x: 0, y: 0, dy: 0, scale: 1, turn: 0 };

  (async () => {
    meta = await fetch(`${base}caminho.json`).then((r) => r.json());
    if (meta.mode === 'anel') {
      anel = true;
      center = await loadImg(base + meta.center);
      ready = true;
      readyCbs.forEach((cb) => cb());
      ring = (await Promise.all(meta.ring.map(async (p) => ({ img: await loadImg(base + p.f), a: p.a })))).filter((p) => p.img);
      reaction = (await Promise.all(meta.reaction.map((f) => loadImg(base + f)))).filter(Boolean);
      return;
    }
    st.u = st.tU = st.rawU = meta.rest;
    const restIdx = meta.path.reduce((bi, p, i) => (Math.abs(p.u - meta.rest) < Math.abs(meta.path[bi].u - meta.rest) ? i : bi), 0);
    const restImg = await loadImg(base + meta.path[restIdx].f);
    path = [{ img: restImg, u: meta.path[restIdx].u, open: true }];
    ready = true;
    readyCbs.forEach((cb) => cb());
    const all = await Promise.all(meta.path.map(async (p, i) => ({ img: i === restIdx ? restImg : await loadImg(base + p.f), u: p.u, open: p.open })));
    path = all.filter((p) => p.img);
    opens = path.filter((p) => p.open).map((p) => p.u);
    if (meta.smile) smile = await loadImg(base + meta.smile);
    reaction = (await Promise.all(meta.reaction.map((f) => loadImg(base + f)))).filter(Boolean);
  })();

  let W = 0;
  let H = 0;
  let dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || innerWidth;
    H = canvas.clientHeight || innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  const ppu = () => H / VIEW_H;
  const toScreen = (wx, wy) => [W / 2 + wx * ppu(), H / 2 - (wy - CAM_Y) * ppu()];
  const headScreen = () => toScreen(pose.x, pose.y + pose.dy + HEAD_Y * pose.scale);

  function lookAtScreen(px, py) {
    st.target.x = px;
    st.target.y = py;
    st.lastMove = performance.now();
    if (st.sleep > 0.5) wake();
  }

  function wake() {
    st.sleep = 0;
    st.surprised = 1;
  }

  function hitTest(px, py) {
    const [hx, hy] = headScreen();
    const r = 1.25 * pose.scale * ppu();
    const dx = (px - hx) / r;
    const dy = (py - hy) / (r * 1.1);
    return dx * dx + dy * dy < 1;
  }

  // cutucar: sequência de reação (coruja) ou sorriso rápido (raposa) + pulinho
  function poke() {
    st.hopV += 2.6;
    st.surprised = 1;
    if (reaction.length) { if (st.react < 0) st.react = 0; } else if (smile) st.smile = 1.2;
  }
  function wave() { poke(); }

  // u de olho aberto mais próximo (o mascote não fica parado no meio de uma piscada)
  function nearestOpen(u) {
    let best = u;
    let bd = Infinity;
    for (const o of opens) { const d = Math.abs(o - u); if (d < bd) { bd = d; best = o; } }
    return best;
  }

  /* animação */
  function update(dt) {
    st.dt = dt;
    if (!meta) return;
    const now = performance.now();
    st.idle = (now - st.lastMove) / 1000;
    const wantSleep = st.idle > 10 ? 1 : 0;
    st.sleep = damp(st.sleep, wantSleep, wantSleep ? 0.8 : 10, dt);

    const [hx, hy] = headScreen();
    if (anel) {
      // modo anel: vetor cabeça → cursor, normalizado (o olhar vai mais longe para os lados)
      let tx = (st.target.x - hx) / Math.max(W * 0.38, 280);
      let ty = (st.target.y - hy) / Math.max(H * 0.42, 260);
      const m = Math.hypot(tx, ty);
      if (m > 1) { tx /= m; ty /= m; }
      if (st.sleep > 0.5) { tx = 0; ty = 0; }
      const k2 = 70;
      const c2 = 2 * Math.sqrt(k2);
      st.vgx += ((tx - st.gx) * k2 - st.vgx * c2) * dt;
      st.vgy += ((ty - st.gy) * k2 - st.vgy * c2) * dt;
      st.gx += st.vgx * dt;
      st.gy += st.vgy * dt;
    }

    // mouse → posição no caminho (centro = quadro de frente)
    const span = Math.max(W * 0.4, 300);
    const tx = clamp((st.target.x - hx) / span, -1, 1);
    const e = Math.sign(tx) * (1 - (1 - Math.abs(tx)) ** 1.6);
    const raw = meta.rest + (e < 0 ? e * meta.rest : e * (1 - meta.rest));
    st.still = Math.abs(raw - st.rawU) < 0.002 ? st.still + dt : 0;
    st.rawU = raw;
    // parado no meio da virada? escorrega para o quadro de olho aberto mais perto
    st.tU = st.still > 0.12 && opens.length ? nearestOpen(raw) : raw;
    if (st.sleep > 0.5) st.tU = meta.rest;
    st.tNod = clamp((st.target.y - hy) / (H * 0.5), -1, 1);

    // mola criticamente amortecida: segue rápido e liso, sem tremer
    const k = 85;
    st.vU += ((st.tU - st.u) * k - st.vU * 2 * Math.sqrt(k)) * dt;
    st.u = clamp(st.u + st.vU * dt, 0, 1);
    st.vNod += ((st.tNod - st.nod) * 40 - st.vNod * 2 * Math.sqrt(40)) * dt;
    st.nod += st.vNod * dt;

    if (st.react >= 0) {
      st.react += dt * (meta.fps || 8);
      if (st.react >= reaction.length) st.react = -1;
    }
    st.smile = Math.max(0, st.smile - dt);

    if (Math.random() < dt * 0.12 && st.idle > 1.5) st.tiltTarget = (Math.random() - 0.5) * 0.07;
    if (st.idle < 0.3) st.tiltTarget = 0;
    st.tilt = damp(st.tilt, st.tiltTarget, 3, dt);
    st.hopV += (-st.hop * 80 - st.hopV * 9) * dt;
    st.hop += st.hopV * dt;
    st.surprised = damp(st.surprised, 0, 1.6, dt);
  }

  // modo anel: centro (de frente) ↔ anel (olhando longe), e no anel os dois
  // quadros vizinhos do ângulo do olhar. Nos buracos grandes do anel a troca é
  // rápida (no meio do buraco), para não mostrar duas poses distantes misturadas.
  function drawAnel(alpha) {
    const r = Math.hypot(st.gx, st.gy);
    const dt = st.dt || 1 / 60;
    // frente ↔ olhar longe: decisão com margem (histerese) e cruzamento curto no
    // tempo — nunca fica parado misturando duas poses (o "fantasma")
    if (r > 0.22) st.ringOn = 1;
    else if (r < 0.14) st.ringOn = 0;
    st.wS = damp(st.wS ?? 0, ring.length ? st.ringOn || 0 : 0, 16, dt);
    const wRing = st.wS < 0.01 ? 0 : st.wS > 0.99 ? 1 : st.wS;
    if (wRing < 0.999 && center) {
      bctx.globalAlpha = (1 - wRing) * alpha;
      bctx.drawImage(center, 0, 0, buf.width, buf.height);
    }
    if (wRing <= 0.001) return;
    const ang = (Math.atan2(st.gy, st.gx) * 180) / Math.PI;
    let j = ring.findIndex((p) => p.a > ang);
    if (j < 0) j = 0;
    const i = (j - 1 + ring.length) % ring.length;
    const a = ring[i];
    const b = ring[j];
    let gap = b.a - a.a;
    let pos = ang - a.a;
    if (gap <= 0) gap += 360;
    if (pos < 0) pos += 360;
    let t = clamp(pos / gap, 0, 1);
    if (gap > 20) {
      // buraco grande no anel: escolhe o lado mais perto e cruza rápido no tempo
      const goal = t < 0.5 ? 0 : 1;
      if (st.gapKey !== i) { st.gapKey = i; st.gapT = goal; }
      st.gapT = damp(st.gapT, goal, 16, dt);
      t = st.gapT;
    } else {
      st.gapKey = -1;
    }
    bctx.globalAlpha = (1 - t) * wRing * alpha;
    bctx.drawImage(a.img, 0, 0, buf.width, buf.height);
    if (t > 0.003) {
      bctx.globalAlpha = t * wRing * alpha;
      bctx.drawImage(b.img, 0, 0, buf.width, buf.height);
    }
  }

  function drawPath(alpha) {
    if (anel) { drawAnel(alpha); return; }
    if (!path.length) return;
    let i = 0;
    while (i < path.length - 1 && path[i + 1].u < st.u) i++;
    const a = path[i];
    const b = path[Math.min(i + 1, path.length - 1)];
    const t = a === b ? 0 : clamp((st.u - a.u) / (b.u - a.u), 0, 1);
    bctx.globalAlpha = (1 - t) * alpha;
    bctx.drawImage(a.img, 0, 0, buf.width, buf.height);
    if (t > 0.003) {
      bctx.globalAlpha = t * alpha;
      bctx.drawImage(b.img, 0, 0, buf.width, buf.height);
    }
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!ready || !meta) return;
    const [fw, fh] = meta.size;
    const h = FRAME_H * (meta.scale || 1) * pose.scale * ppu();
    const w = (h * fw) / fh;
    if (h < 4) return;

    // monta o quadro no buffer (soma ponderada exata, pesos somando 1)
    const bw = Math.min(fw, Math.round(w * dpr));
    const bh = Math.round((bw * fh) / fw);
    if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; }
    bctx.globalCompositeOperation = 'source-over';
    bctx.globalAlpha = 1;
    bctx.clearRect(0, 0, bw, bh);
    bctx.globalCompositeOperation = 'lighter';
    if (st.react >= 0 && reaction.length) {
      bctx.drawImage(reaction[Math.floor(st.react)], 0, 0, bw, bh);
    } else {
      const sm = smile && st.smile > 0 ? Math.min(1, st.smile * 4, (1.2 - st.smile) * 6) : 0;
      drawPath(1 - sm);
      if (sm > 0.003) {
        bctx.globalAlpha = sm;
        bctx.drawImage(smile, 0, 0, bw, bh);
      }
    }
    // o busto some suavemente embaixo (o vídeo termina no peito)
    bctx.globalCompositeOperation = 'destination-out';
    bctx.globalAlpha = 1;
    const g = bctx.createLinearGradient(0, bh * 0.82, 0, bh);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    bctx.fillStyle = g;
    bctx.fillRect(0, bh * 0.82, bw, bh * 0.18 + 1);
    bctx.globalCompositeOperation = 'source-over';

    // na tela: leve aceno vertical acompanhando o mouse, pulinho e inclinação
    const [hx, hy] = toScreen(pose.x, pose.y + pose.dy + (HEAD_Y + st.hop * 0.15) * pose.scale);
    const left = hx - meta.head[0] * w;
    const nod = anel ? 0 : st.nod; // no anel o olhar vertical é real (quadros do vídeo)
    const top = hy - meta.head[1] * h + nod * h * 0.012;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(hx, top + h);
    ctx.rotate(st.tilt);
    ctx.scale(1, 1 - nod * 0.008);
    ctx.translate(-hx, -(top + h));
    ctx.drawImage(buf, left, top, w, h);
  }

  let last = performance.now();
  let running = true;
  function loop(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame((n) => { last = n; requestAnimationFrame(loop); });

  // retratos para o avatar e os cards (quadros prontos)
  function portrait(kind) {
    return new Promise((res) => {
      const go = () => {
        if (!meta) { setTimeout(go, 100); return; }
        if (meta.mode === 'anel') {
          if (kind === 'card2' && meta.reaction.length) { res(base + meta.reaction[Math.floor(meta.reaction.length * 0.3)]); return; }
          if (kind === 'card1') { res(base + meta.ring.reduce((a, b) => (Math.abs(Math.abs(b.a) - 165) < Math.abs(Math.abs(a.a) - 165) ? b : a)).f); return; }
          res(base + meta.center);
          return;
        }
        const near = (u) => meta.path.reduce((a, b) => (Math.abs(b.u - u) < Math.abs(a.u - u) && b.open ? b : a));
        if (kind === 'card2') {
          if (meta.smile) { res(base + meta.smile); return; }
          if (meta.reaction.length) { res(base + meta.reaction[Math.floor(meta.reaction.length * 0.3)]); return; }
        }
        res(base + (kind === 'card1' ? near(0.08) : near(meta.rest)).f);
      };
      go();
    });
  }

  return {
    pose,
    lookAtScreen,
    hitTest,
    poke,
    wave,
    wake,
    resize,
    portrait,
    onReady(cb) { if (ready) cb(); else readyCbs.push(cb); },
    get state() { return st; },
    nudge() { st.lastMove = performance.now(); },
    setRunning(v) {
      if (v === running) return;
      running = v;
      if (v) { last = performance.now(); requestAnimationFrame(loop); }
    },
    tick(dt = 1 / 60) { update(dt); render(); },
  };
}
