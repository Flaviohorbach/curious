/**
 * Curious — one page com o Tito, raposa 3D que acompanha o visitante.
 *
 * O canvas da raposa fica fixo atrás do conteúdo; cada seção marcada com
 * data-pose leva a raposa para uma posição (hero grande, de lado, espiando
 * no canto, no convite final). Elementos com data-look atraem o olhar dela.
 */
// mascote.js herda a versão deste arquivo (?ver=...), para o cache nunca servir um mascote antigo
const VER = new URL(import.meta.url).searchParams.get('ver');
const { createMascot } = await import(`./mascote.js${VER ? `?ver=${VER}` : ''}`);

const body = document.body;
const root = document.documentElement;
const isEditor = body.classList.contains('elementor-editor-active');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;
const params = new URLSearchParams(location.search);
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

if (!isEditor && gsap && ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);
  root.classList.add('cu-js');
  body.classList.add('cu-js');
  start();
}

function start() {
  /* ---------- rolagem suave ---------- */
  let lenis = null;
  if (window.Lenis && !reduced && !params.has('semlenis')) {
    lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      const el = id.length > 1 && document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.4 });
      else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    });
  });

  /* ---------- raposa ---------- */
  const canvas = $('.cu-owl');
  let owl = null;
  try {
    // quadros dos vídeos (gerados por IA), tratados por scripts/mascote-quadros.py
    // corujinha por padrão (olha em todas as direções); ?mascote=raposa mostra a raposa
    const which = params.get('mascote') === 'raposa' ? 'raposa' : 'coruja';
    body.classList.add(`cu-mascote-${which}`);
    owl = createMascot(canvas, { base: new URL(`../img/${which}/`, import.meta.url).href });
  } catch (err) {
    console.warn('Curious: mascote indisponível', err);
  }

  const pointer = { x: innerWidth * 0.5, y: innerHeight * 0.35, has: false };
  const bubble = $('.cu-bubble');
  const lines = ['Huu?', 'Por quê?', 'Hmm…', 'Ei!', 'E aí?', 'Curioso, né?'];
  let sayTimer = 0;
  let lookEl = null;

  if (owl) {
    window.cuOwl = owl;
    setupPoses(owl);
    setupLook(owl);
    setupPoke(owl);
    fillSnapshots(owl);
    document.addEventListener('visibilitychange', () => owl.setRunning(!document.hidden));
  }

  setupCursor();
  setupHeader();
  setupQuestions();
  setupWorlds();
  setupCounters();
  setupReveals();
  setupBlobs();
  intro();

  /* ---------- poses por seção ---------- */
  function setupPoses(o) {
    const FOV_H = 2 * 11.5 * Math.tan(THREE_DEG(13));
    const Y = (f) => 1.3 + (0.5 - f) * FOV_H;
    const halfW = () => (FOV_H / 2) * (innerWidth / innerHeight);
    const wide = () => innerWidth / innerHeight >= 1;

    // A raposa é um busto (cabeça + ombros); `head` é a altura da cabeça na tela (0 = topo).
    const at = (x, head, s) => ({ x, y: Y(head) - 1.62 * s, scale: s, turn: 0 });
    const P = {
      hero: () => (wide() ? at(halfW() * 0.1, 0.5, 1.3) : at(0, 0.6, clamp(halfW() / 1.95, 0.55, 0.85))),
      side: () => (wide() ? at(halfW() * 0.52, 0.5, 0.9) : at(halfW() - 0.6, 0.93, 0.42)),
      peek: () => (wide() ? at(halfW() * 0.74, 0.84, 0.75) : at(halfW() - 0.6, 0.93, 0.42)),
      cta: () => (wide() ? at(halfW() * 0.5, 0.47, 0.88) : at(0, 0.74, clamp(halfW() / 2.0, 0.5, 0.8))),
      // no rodapé a coruja não desce mais: fica na pose do CTA e é empurrada para cima pelo rodapé
      away: () => P.cta(),
    };

    // A pose é calculada direto do progresso de cada trecho (sem tweens
    // encadeados), então pular de seção pelo menu nunca deixa estado velho.
    const KEYS = ['x', 'y', 'scale', 'turn'];
    const footer = $('.cu-footer');
    const ease = (t) => t * t * (3 - 2 * t);
    const steps = $$('[data-pose]').map((el) => {
      const name = el.dataset.pose;
      const isFoot = name === 'away';
      const st = ScrollTrigger.create({
        trigger: el,
        start: isFoot ? 'top bottom' : 'top 92%',
        end: isFoot ? 'top 55%' : 'top 30%',
      });
      if (name === 'cta') {
        ScrollTrigger.create({
          trigger: el,
          start: 'top 45%',
          onEnter: () => { o.wave(); say('Bora?', 1600, true); },
        });
      }
      return { fn: P[name] || P.peek, st, val: null };
    });

    let heroVal = P.hero();
    const cache = () => { heroVal = P.hero(); steps.forEach((s) => { s.val = s.fn(); }); };
    cache();
    ScrollTrigger.addEventListener('refresh', cache);
    window.addEventListener('resize', cache);

    const goal = { ...heroVal };
    Object.assign(o.pose, heroVal);
    gsap.ticker.add((_, dt) => {
      KEYS.forEach((k) => { goal[k] = heroVal[k]; });
      for (const s of steps) {
        const p = ease(clamp(s.st.progress, 0, 1));
        if (p <= 0) break;
        KEYS.forEach((k) => { goal[k] += (s.val[k] - goal[k]) * p; });
      }
      const a = 1 - Math.exp(-(dt / 1000) * 5);
      KEYS.forEach((k) => { o.pose[k] += (goal[k] - o.pose[k]) * a; });
      // a base da coruja nunca passa da borda de cima do rodapé (fica sempre visível, "sentada" nele)
      if (footer) {
        const top = footer.getBoundingClientRect().top;
        if (top < innerHeight) {
          const floor = 1.3 + (innerHeight / 2 - top) * (FOV_H / innerHeight);
          if (o.pose.y < floor) o.pose.y = floor;
        }
      }
    });
  }

  function THREE_DEG(d) { return (d * Math.PI) / 180; }

  /* ---------- olhar ---------- */
  function setupLook(o) {
    const target = () => {
      if (lookEl) {
        const r = lookEl.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + Math.min(r.height / 2, 60)];
      }
      return [pointer.x, pointer.y];
    };
    const update = () => { const [x, y] = target(); o.lookAtScreen(x, y); };

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.has = true;
      update();
    }, { passive: true });
    window.addEventListener('pointerdown', (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      update();
    }, { passive: true });

    $$('[data-look]').forEach((el) => {
      el.addEventListener('pointerenter', () => { lookEl = el; update(); });
      el.addEventListener('pointerleave', () => { if (lookEl === el) lookEl = null; });
      el.addEventListener('focusin', () => { lookEl = el; update(); });
      el.addEventListener('focusout', () => { if (lookEl === el) lookEl = null; });
    });

    // rolar também conta como "estar por perto"
    let raf = 0;
    window.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (pointer.has || lookEl) update(); else o.nudge();
      });
    }, { passive: true });

    // sem mouse: a raposa passeia o olhar pelo que está na tela
    if (!finePointer) {
      setInterval(() => {
        const vis = $$('[data-look]').filter((el) => {
          const r = el.getBoundingClientRect();
          return r.bottom > 60 && r.top < innerHeight - 60;
        });
        if (vis.length && Math.random() < 0.7) {
          lookEl = vis[Math.floor(Math.random() * vis.length)];
        } else {
          lookEl = null;
          pointer.x = innerWidth * (0.2 + Math.random() * 0.6);
          pointer.y = innerHeight * (0.15 + Math.random() * 0.5);
        }
        update();
      }, 2600);
    }
  }

  /* ---------- cutucar a raposa ---------- */
  function say(text, ms = 1300, nearOwl = false) {
    if (!bubble) return;
    bubble.textContent = text;
    let x = pointer.x + 18;
    let y = pointer.y - 10;
    if (nearOwl || !pointer.has) {
      x = innerWidth * (innerWidth > innerHeight ? 0.66 : 0.6);
      y = innerHeight * (innerWidth > innerHeight ? 0.36 : 0.62);
    }
    // o balão nasce acima e à direita do ponto, com a "ponta" no canto de baixo
    gsap.set(bubble, { x: clamp(x, 10, innerWidth - 180), y: clamp(y, 150, innerHeight - 20), yPercent: -130, transformOrigin: '0% 100%' });
    gsap.fromTo(bubble, { opacity: 0, scale: 0.5, rotate: -8 }, { opacity: 1, scale: 1, rotate: 0, duration: 0.5, ease: 'back.out(2.4)' });
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => gsap.to(bubble, { opacity: 0, scale: 0.8, duration: 0.3 }), ms);
  }

  function setupPoke(o) {
    let hovering = false;
    const cursor = $('.cu-cursor');
    let tick = 0;
    window.addEventListener('pointermove', (e) => {
      if (++tick % 3) return;
      const hit = !e.target.closest?.('a, button, [data-look]') && o.hitTest(e.clientX, e.clientY);
      if (hit !== hovering) {
        hovering = hit;
        cursor?.classList.toggle('is-owl', hit);
      }
    }, { passive: true });
    window.addEventListener('pointerdown', (e) => {
      if (e.target.closest?.('a, button, input')) return;
      if (o.hitTest(e.clientX, e.clientY)) {
        o.poke();
        say(lines[Math.floor(Math.random() * lines.length)]);
      }
    });
  }

  /* ---------- retratos da raposa nos cards ---------- */
  function fillSnapshots(o) {
    // retratos = quadros prontos da biblioteca de poses (avatar de frente,
    // card 1 olhando para o lado, card 2 sorrindo de olhos fechados)
    $$('img[data-snap]').forEach(async (img) => {
      img.src = await o.portrait(img.dataset.snap);
    });
  }

  /* ---------- cursor ---------- */
  function setupCursor() {
    const c = $('.cu-cursor');
    if (!c || !finePointer) return;
    const ring = $('.cu-cursor-ring', c);
    const dot = $('.cu-cursor-dot', c);
    const rx = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3' });
    const ry = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3' });
    const dx = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power3' });
    const dy = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power3' });
    gsap.set([ring, dot], { x: -100, y: -100 });
    window.addEventListener('pointermove', (e) => {
      rx(e.clientX); ry(e.clientY); dx(e.clientX); dy(e.clientY);
      c.classList.toggle('is-link', !!e.target.closest?.('a, button'));
    }, { passive: true });
    window.addEventListener('pointerdown', () => c.classList.add('is-down'));
    window.addEventListener('pointerup', () => c.classList.remove('is-down'));
    document.addEventListener('mouseleave', () => gsap.to(c, { opacity: 0, duration: 0.2 }));
    document.addEventListener('mouseenter', () => gsap.to(c, { opacity: 1, duration: 0.2 }));
  }

  /* ---------- topo ---------- */
  function setupHeader() {
    const header = $('.cu-header');
    if (!header) return;
    const actions = $('.cu-actions');
    // menu do celular/tablet: os 9 pontinhos abrem a lista de seções
    const menuBtn = $('.cu-menu-btn');
    const setMenu = (open) => {
      header.classList.toggle('is-menu', open);
      menuBtn?.setAttribute('aria-expanded', String(open));
      menuBtn?.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    };
    menuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      setMenu(!header.classList.contains('is-menu'));
    });
    $$('.cu-menu a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('click', (e) => {
      if (!e.target.closest?.('.cu-menu')) setMenu(false);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    let lastY = window.scrollY;
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => {
        const y = self.scroll();
        const dir = y > lastY ? 1 : -1;
        lastY = y;
        header.classList.toggle('is-solid', y > innerHeight * 0.6);
        header.classList.toggle('is-hidden', dir > 0 && y > innerHeight * 0.9);
        if (header.classList.contains('is-hidden')) setMenu(false);
        actions?.classList.toggle('is-away', y > innerHeight * 0.35);
      },
    });
    const links = $$('.cu-nav a');
    links.forEach((a) => {
      const sec = document.querySelector(a.getAttribute('href'));
      if (!sec) return;
      ScrollTrigger.create({
        trigger: sec,
        start: 'top 50%',
        end: 'bottom 50%',
        onToggle: (self) => {
          if (!self.isActive) return;
          links.forEach((l) => l.classList.toggle('is-active', l === a));
        },
      });
    });
  }

  /* ---------- perguntas ---------- */
  function setupQuestions() {
    const items = $$('.cu-q');
    items.forEach((li) => {
      const btn = $('button', li);
      btn.addEventListener('click', () => {
        const open = !li.classList.contains('is-open');
        items.forEach((o) => {
          o.classList.toggle('is-open', o === li && open);
          $('button', o).setAttribute('aria-expanded', String(o === li && open));
        });
        if (open && owl) {
          owl.wake();
          say(['Aha!', 'Sabia?', 'Uau!', 'Faz sentido!'][Math.floor(Math.random() * 4)], 1100);
        }
        setTimeout(() => ScrollTrigger.refresh(), 520);
      });
    });
  }

  /* ---------- cards dos mundos: inclinação 3D ---------- */
  function setupWorlds() {
    if (!finePointer || reduced) return;
    $$('.cu-world').forEach((card) => {
      const rx = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3' });
      const ry = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3' });
      gsap.set(card, { transformPerspective: 900 });
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 12);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 10);
      });
      card.addEventListener('pointerleave', () => { rx(0); ry(0); });
    });
  }

  /* ---------- números ---------- */
  function setupCounters() {
    $$('[data-count]').forEach((el) => {
      const end = parseFloat(el.dataset.count);
      const dec = parseInt(el.dataset.dec || '0', 10);
      const suf = el.dataset.suffix || '';
      const fmt = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
      el.textContent = fmt(reduced ? end : 0);
      if (reduced) return;
      const o = { v: 0 };
      ScrollTrigger.create({
        trigger: el,
        start: 'top 85%',
        once: true,
        onEnter: () => gsap.to(o, { v: end, duration: 1.8, ease: 'power3.out', onUpdate: () => { el.textContent = fmt(o.v); } }),
      });
    });
  }

  /* ---------- revelações ---------- */
  function setupReveals() {
    $$('.cu-reveal').forEach((el) => {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 1.1,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });
    const groups = [['.cu-q', '.cu-questions'], ['.cu-world', '.cu-world-grid'], ['.cu-stat', '.cu-stats']];
    groups.forEach(([item, wrap]) => {
      const w = $(wrap);
      if (!w) return;
      gsap.from($$(item, w), {
        y: 60,
        opacity: 0,
        duration: 1,
        ease: 'power3.out',
        stagger: 0.09,
        scrollTrigger: { trigger: w, start: 'top 85%', once: true },
      });
    });
  }

  /* ---------- fundo vivo ---------- */
  function setupBlobs() {
    if (reduced) return;
    $$('.cu-blob').forEach((b, i) => {
      gsap.to(b, { x: `+=${40 + i * 20}`, y: `-=${30 + i * 15}`, duration: 7 + i * 2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    });
  }

  /* ---------- entrada ---------- */
  function intro() {
    $$('.cu-title').forEach((t) => splitChars(t));
    const hero = $('.cu-hero');
    if (!hero) return;
    if (reduced) return;
    // durante a entrada, nenhuma transição CSS (o Astra põe uma em todo link) disputa com o GSAP
    root.classList.add('cu-intro');
    const tl = gsap.timeline({ defaults: { ease: 'power4.out' }, onComplete: () => root.classList.remove('cu-intro') });
    tl.from('.cu-header > :not(.cu-menu)', { y: -30, opacity: 0, duration: 1, stagger: 0.06, clearProps: 'transform,opacity' }, 0.2)
      .from('.cu-hero .cu-kicker', { y: 20, opacity: 0, duration: 0.8 }, 0.35)
      .from('.cu-hero .cu-title .cu-char', { yPercent: 110, rotate: 8, opacity: 0, duration: 1, stagger: 0.03 }, 0.4)
      .from('.cu-hero .cu-lead', { y: 24, opacity: 0, duration: 0.9 }, 0.8)
      .from('.cu-actions > *', { y: 30, opacity: 0, duration: 0.9, stagger: 0.08 }, 0.9)
      .from('.cu-mission', { x: 40, opacity: 0, duration: 1 }, 1.0)
      .from('.cu-card', { x: 120, opacity: 0, duration: 1.2, stagger: 0.12 }, 1.1);
    if (owl) {
      tl.from(owl.pose, { dy: -5, duration: 1.7, ease: 'elastic.out(1, 0.55)', onComplete: () => owl.poke() }, 0.15);
    }
  }

  function splitChars(el) {
    $$('.cu-line', el).forEach((line) => {
      const text = line.textContent;
      line.textContent = '';
      line.setAttribute('aria-hidden', 'true');
      // cada palavra num bloco que não quebra; cada letra anima sozinha
      text.split(' ').forEach((word, wi, arr) => {
        const w = document.createElement('span');
        w.className = 'cu-word';
        for (const ch of word) {
          const s = document.createElement('span');
          s.className = 'cu-char';
          s.textContent = ch;
          w.appendChild(s);
        }
        line.appendChild(w);
        if (wi < arr.length - 1) line.appendChild(document.createTextNode(' '));
      });
    });
    el.setAttribute('aria-label', $$('.cu-line', el).map((l) => l.textContent).join(' '));
  }
}
