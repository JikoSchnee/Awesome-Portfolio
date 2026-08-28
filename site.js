(() => {
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { width: innerWidth, height: innerHeight, pointerX: .5, pointerY: .5, scrollY: 0, ticking: false };
  const workIntroState = { outer: null, inner: null, dotField: null, title: null, typeLayer: null, typeInnerMask: null, scene: null, spread: null, measured: false, coverScale: 1, cloneCount: 0 };
  const workAnchorBuffer = 5;
  const workInnerSpeed = .8;
  const workTitleSpeed = .1;
  const workSpreadTargetColumnWidth = 256;
  const workSpreadMinimumCopiesPerSide = 2;
  const workTitleLineHeight = .78;
  const workTitleGap = 10;
  const workSpreadEdgeGrowth = .34;
  const workOuterArcRatio = .14;
  const workInnerArcRatio = .065;
  const workExpansionScreens = 3;
  const workHoldScreens = .35;
  const workCardTravelScreens = 1.2;
  const workCardStaggerScreens = workCardTravelScreens / 2;
  const workCardEdgeRatio = .2;
  const workCardMiddleRatio = .6;
  const workCardMiddleSpeed = .45;
  const workCardPerspectiveDegrees = 11;
  const workCardTailScreens = .35;
  const workCollapseScreens = workExpansionScreens;
  const workTimelineState = { expansion: 0, hold: 0, media: 0, cardTail: 0, collapse: 0, total: 0 };
  const paperPalette = ['#e1cab8', '#f40c3f', '#fff2ed'];
  const memorySpawnSequence = ['photo', 'photo', 'photo', 'photo', 'star', 'photo', 'photo', 'photo', 'star'];
  const memoryMinimumSlots = 3;
  const memoryMaximumSlots = 10;
  const memoryDensityArea = 140000;
  const memorySpawnIntervalMin = 900;
  const memorySpawnIntervalMax = 1600;
  const memorySpawnReferenceArea = 950000;
  const memoryLifetimeMin = 7500;
  const memoryLifetimeMax = 9000;
  const memoryGrabDepth = 300;
  const memoryGrabWidth = 240;
  const memoryExitDuration = 700;
  const memoryDissolveDuration = 900;
  const memoryScene = {
    section: null, host: null, smiley: null, slots: [], smileyVisible: false,
    nextSpawnAt: 0, sequenceIndex: 0, photoIndex: 0, serial: 0, frame: 0,
    renderer: null, scene: null, camera: null, canvas: null, textures: new Map(),
    worldPerPixel: 1, spawnOrigin: { x: 0, y: 0 }, smileyDocumentCenter: { x: 0, y: 0 },
    size: { width: 0, height: 0 }, frustum: null, viewProjectionMatrix: null, bounds: null,
    raycaster: null, pointerNdc: null, pointerWorld: null, grabbedSlot: null, hoveredSlot: null,
    pointer: { x: 0, y: 0, lastX: 0, lastY: 0, vx: 0, vy: 0, lastAt: 0, id: null, seen: false },
    capacity: memoryMaximumSlots, spawnInterval: memorySpawnIntervalMin,
    lastFrameAt: 0, suppressClickUntil: 0
  };
  let paperThemeIndex = 0;

  class Noise {
    constructor(seed = 0.314159) {
      let value = Math.floor(seed * 0xffffffff) >>> 0;
      const random = () => {
        value += 0x6d2b79f5;
        let result = value;
        result = Math.imul(result ^ result >>> 15, result | 1);
        result ^= result + Math.imul(result ^ result >>> 7, result | 61);
        return ((result ^ result >>> 14) >>> 0) / 4294967296;
      };
      const permutation = Array.from({ length: 256 }, (_, index) => index);
      for (let i = permutation.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
      }
      this.permutation = new Uint8Array(512);
      for (let i = 0; i < 512; i += 1) this.permutation[i] = permutation[i & 255];
    }
    fade(value) { return value * value * value * (value * (value * 6 - 15) + 10); }
    gradient(hash, x, y) {
      switch (hash & 7) {
        case 0: return x + y;
        case 1: return -x + y;
        case 2: return x - y;
        case 3: return -x - y;
        case 4: return x;
        case 5: return -x;
        case 6: return y;
        default: return -y;
      }
    }
    perlin2(x, y) {
      const floorX = Math.floor(x), floorY = Math.floor(y);
      const cellX = floorX & 255, cellY = floorY & 255;
      const localX = x - floorX, localY = y - floorY;
      const u = this.fade(localX), v = this.fade(localY), p = this.permutation;
      const aa = p[p[cellX] + cellY], ab = p[p[cellX] + cellY + 1];
      const ba = p[p[cellX + 1] + cellY], bb = p[p[cellX + 1] + cellY + 1];
      const top = this.gradient(aa, localX, localY) * (1 - u) + this.gradient(ba, localX - 1, localY) * u;
      const bottom = this.gradient(ab, localX, localY - 1) * (1 - u) + this.gradient(bb, localX - 1, localY - 1) * u;
      return top * (1 - v) + bottom * v;
    }
  }

  class AWaves extends HTMLElement {
    connectedCallback() {
      this.svg = this.querySelector('.js-svg');
      this.mouse = { x: -10, y: 0, lx: 0, ly: 0, sx: 0, sy: 0, v: 0, vs: 0, a: 0, set: false };
      this.lines = []; this.paths = []; this.noise = new Noise(0.314159);
      this.setSize(); this.setLines(); this.bindEvents();
      requestAnimationFrame(this.tick.bind(this));
    }
    bindEvents() {
      window.addEventListener('resize', this.onResize.bind(this), { passive: true });
      window.addEventListener('mousemove', this.onMouseMove.bind(this), { passive: true });
      this.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    }
    onResize() { this.setSize(); this.setLines(); }
    onMouseMove(e) { this.updateMousePosition(e.pageX, e.pageY); }
    onTouchMove(e) { e.preventDefault(); const touch = e.touches[0]; this.updateMousePosition(touch.clientX, touch.clientY); }
    updateMousePosition(x, y) {
      const { mouse } = this; mouse.x = x - this.bounding.left; mouse.y = y - this.bounding.top + window.scrollY;
      if (!mouse.set) { mouse.sx = mouse.x; mouse.sy = mouse.y; mouse.lx = mouse.x; mouse.ly = mouse.y; mouse.set = true; }
    }
    setSize() { this.bounding = this.getBoundingClientRect(); this.svg.style.width = `${this.bounding.width}px`; this.svg.style.height = `${this.bounding.height}px`; }
    setLines() {
      const { width, height } = this.bounding; this.lines = []; this.paths.forEach(path => path.remove()); this.paths = [];
      const xGap = 10, yGap = 32, oWidth = width + 200, oHeight = height + 30;
      const totalLines = Math.ceil(oWidth / xGap), totalPoints = Math.ceil(oHeight / yGap);
      const xStart = (width - xGap * totalLines) / 2, yStart = (height - yGap * totalPoints) / 2;
      for (let i = 0; i <= totalLines; i += 1) {
        const points = [];
        for (let j = 0; j <= totalPoints; j += 1) points.push({ x: xStart + xGap * i, y: yStart + yGap * j, wave: { x: 0, y: 0 }, cursor: { x: 0, y: 0, vx: 0, vy: 0 } });
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.classList.add('a__line', 'js-line'); this.svg.appendChild(path); this.paths.push(path); this.lines.push(points);
      }
    }
    movePoints(time) {
      const { lines, mouse, noise } = this;
      lines.forEach(points => points.forEach(p => {
        const flow = time * .000035;
        const noiseX = p.x * .002;
        const noiseY = p.y * .004;
        const warp = noise.perlin2(noiseX * .55 + 19.7 + flow * .55, noiseY * .8 - 7.1 - flow * .32);
        const detail = noise.perlin2(noiseX * 1.7 - 31.4 - flow * .36, noiseY * 1.9 + 12.8 + flow * .28);
        const phase = noise.perlin2(noiseX * .37 + 63.2 + flow * .2, noiseY * .61 - 27.4 - flow * .15);
        const move = noise.perlin2(noiseX + warp * .72 + flow, noiseY + detail * .42 - flow * .38) * 9 + detail * 3 + phase * 1.4;
        p.wave.x = Math.cos(move) * 32; p.wave.y = Math.sin(move) * 16;
        const dx = p.x - mouse.sx, dy = p.y - mouse.sy, d = Math.hypot(dx, dy), l = Math.max(175, mouse.vs);
        if (d < l) { const s = 1 - d / l, f = Math.cos(d * .001) * s; p.cursor.vx += Math.cos(mouse.a) * f * l * mouse.vs * .00065; p.cursor.vy += Math.sin(mouse.a) * f * l * mouse.vs * .00065; }
        p.cursor.vx += (0 - p.cursor.x) * .005; p.cursor.vy += (0 - p.cursor.y) * .005; p.cursor.vx *= .925; p.cursor.vy *= .925; p.cursor.x += p.cursor.vx * 2; p.cursor.y += p.cursor.vy * 2; p.cursor.x = Math.min(100, Math.max(-100, p.cursor.x)); p.cursor.y = Math.min(100, Math.max(-100, p.cursor.y));
      }));
    }
    moved(point, withCursorForce = true) { return { x: Math.round((point.x + point.wave.x + (withCursorForce ? point.cursor.x : 0)) * 10) / 10, y: Math.round((point.y + point.wave.y + (withCursorForce ? point.cursor.y : 0)) * 10) / 10 }; }
    drawLines() {
      this.lines.forEach((points, lIndex) => { let p1 = this.moved(points[0], false), d = `M ${p1.x} ${p1.y}`; points.forEach((point, pIndex) => { const isLast = pIndex === points.length - 1; const a = this.moved(point, !isLast), b = this.moved(points[pIndex + 1] || points[points.length - 1], !isLast); d += `L ${a.x} ${a.y}`; void b; }); this.paths[lIndex].setAttribute('d', d); });
    }
    tick(time) {
      const { mouse } = this; mouse.sx += (mouse.x - mouse.sx) * .1; mouse.sy += (mouse.y - mouse.sy) * .1; const dx = mouse.x - mouse.lx, dy = mouse.y - mouse.ly; mouse.v = Math.hypot(dx, dy); mouse.vs += (mouse.v - mouse.vs) * .1; mouse.vs = Math.min(100, mouse.vs); mouse.lx = mouse.x; mouse.ly = mouse.y; mouse.a = Math.atan2(dy, dx); this.style.setProperty('--x', `${mouse.sx}px`); this.style.setProperty('--y', `${mouse.sy}px`); this.movePoints(time); this.drawLines(); if (!reducedMotion) requestAnimationFrame(this.tick.bind(this));
    }
  }
  customElements.define('a-waves', AWaves);

  class DataStrip extends HTMLElement {
    connectedCallback() {
      if (this.dataset.ready) return;
      const count = Math.max(1, Number.parseInt(this.dataset.segments || '4', 10));
      this.replaceChildren(...Array.from({ length: count }, () => document.createElement('span')));
      this.dataset.ready = 'true';
    }
  }
  customElements.define('data-strip', DataStrip);

  const workItems = [
    ['Generous-Slider.DCY9Q-MO.mp4', 'https://generousbranding.com/'],
    ['Hf-Navigation.Gkvt7Etn.mp4', '#'],
    ['Generous-Transition.Dysz98iA.mp4', 'https://generousbranding.com/'],
    ['Nod-Intro.DujLdLjK.mp4', 'https://nodcoding.com/'],
    ['Rudl-Transition.CcgAkF6S.mp4', 'https://www.rudlundschwarm.at/'],
    ['247-Foot.CfYyug9d.mp4', 'https://247artists.com/'],
    ['Nod-404.DvJptcy9.mp4', 'https://nodcoding.com/'],
    ['Duten-Shapes.DvaTdo7l.mp4', 'https://duten.com/']
  ];

  const memories = [
    ['art-1987.DuGYX_YQ_Zedl3o.webp', 'Generative art poster concept'],
    ['art-dtyw.BwdKK6hB_Z19TwfB.webp', 'Generative art poster concept'],
    ['art-lines.BXTmZZe3_Z1DHEgE.webp', 'Generative art poster concept'],
    ['first-fwa.LsgJSoFn_1VhWNL.webp', 'My first FOTD on FWA  ♥ (2012)'],
    ['gameboy.BbEYkrsC_RRGJe.webp', 'Young me discovering the beauty of Grand Canyon Tetris (1997)'],
    ['remote-2005.B2CSTJrO_1R04cN.webp', 'Me abusing of remote work (2005)'],
    ['roar.BvXyAVaL_1PKGBj.webp', 'Roaaaar!'],
    ['setup-2006.Op2RjVqP_ZjqlNh.webp', 'Early age (2006) desk setup'],
    ['setup-2016.DZszJSwz_10aiku.webp', '2016 desk setup'],
    ['setup-2020.DjuS52Ke_1lqvvK.webp', '2020 desk setup'],
    ['waaark.C5QpwSMH_Rq3S9.webp', 'Waaark Creative Robots'],
    ['portfolio-2011.DpFoQfUQ_ZXEwJ9.webp', '2011 portfolio'],
    ['portfolio-2014.ClRt5L9z_Xz3cl.webp', '2014 portfolio'],
    ['portfolio-2017.N-r3CKDK_iyXU7.webp', '2017 portfolio (never released)'],
    ['portfolio-2021.D5EtPDWp_Z1AfsSn.webp', '2021 portfolio'],
    ['legos.Bdikeciy_Z1pUyVv.webp', 'Legos ♥']
  ];
  const memoryAspectRatios = new Map([
    ['art-1987.DuGYX_YQ_Zedl3o.webp', 1], ['art-dtyw.BwdKK6hB_Z19TwfB.webp', .742],
    ['art-lines.BXTmZZe3_Z1DHEgE.webp', .783], ['first-fwa.LsgJSoFn_1VhWNL.webp', .75],
    ['gameboy.BbEYkrsC_RRGJe.webp', 1], ['remote-2005.B2CSTJrO_1R04cN.webp', .75],
    ['roar.BvXyAVaL_1PKGBj.webp', .563], ['setup-2006.Op2RjVqP_ZjqlNh.webp', 1.333],
    ['setup-2016.DZszJSwz_10aiku.webp', 1.778], ['setup-2020.DjuS52Ke_1lqvvK.webp', 1.778],
    ['waaark.C5QpwSMH_Rq3S9.webp', 1], ['portfolio-2011.DpFoQfUQ_ZXEwJ9.webp', 1.333],
    ['portfolio-2014.ClRt5L9z_Xz3cl.webp', 1.335], ['portfolio-2017.N-r3CKDK_iyXU7.webp', 1.333],
    ['portfolio-2021.D5EtPDWp_Z1AfsSn.webp', 1.333], ['legos.Bdikeciy_Z1pUyVv.webp', .75]
  ]);

  function seeded(index) {
    const x = Math.sin(index * 9283.13 + 77.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function initHeroLetterMotion() {
    const tracks = [...document.querySelectorAll('.hero-letter-track')];
    if (!tracks.length) return;
    tracks.forEach(track => {
      const cell = track.closest('.hero-letter-cell');
      if (/^[OSC]$/.test(cell?.querySelector('.hero-letter-sizer')?.textContent || '')) cell.classList.add('hero-letter-cell--round');
    });
    if (reducedMotion) return;
    let seed = 0x51f15e;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const states = tracks.map(element => {
      const instances = [...element.querySelectorAll('.hero-letter')];
      return { element, cell: element.closest('.hero-letter-cell'), sizer: element.parentElement.querySelector('.hero-letter-sizer'), primary: instances[0], secondary: instances[1], nextAt: 0, startedAt: 0, distance: 0, direction: [0, 0], active: false };
    });
    const firstDelay = () => 1000 + random() * 14000;
    const nextDelay = () => 6000 + random() * 9000;
    const measureDistance = state => {
      state.cell.style.width = '';
      const width = state.sizer.offsetWidth;
      const height = state.cell.offsetHeight;
      const gap = parseFloat(getComputedStyle(state.cell).getPropertyValue('--letter-gap')) || 5;
      state.cell.style.width = `${width}px`;
      state.cell.style.setProperty('--letter-width', `${width}px`);
      state.cell.style.setProperty('--letter-height', `${height}px`);
      state.distance = (state.direction[0] ? width : height) + gap;
    };
    const easeInOut = value => value < .5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
    const translate = (dx, dy, distance) => `${dx * distance}px ${dy * distance}px`;
    const parkSecondary = state => {
      const [dx, dy] = state.direction;
      state.element.style.translate = '';
      state.primary.style.translate = '';
      state.secondary.style.translate = translate(-dx, -dy, state.distance);
    };
    const applyMotion = (state, progress) => {
      const [dx, dy] = state.direction;
      state.element.style.translate = translate(dx, dy, state.distance * easeInOut(progress));
    };
    const settle = state => {
      const outgoing = state.primary;
      state.primary = state.secondary;
      state.secondary = outgoing;
      parkSecondary(state);
    };
    const remeasure = () => states.forEach(state => {
      measureDistance(state);
      if (!state.active) parkSecondary(state);
    });
    states.forEach(state => { state.direction = directions[0]; measureDistance(state); parkSecondary(state); state.nextAt = performance.now() + firstDelay(); });
    addEventListener('resize', remeasure, { passive: true });
    if (window.ResizeObserver) {
      const titleObserver = new ResizeObserver(() => { fitHeroTitle(); remeasure(); });
      titleObserver.observe($('.hero-title'));
    }
    if (document.fonts?.ready) document.fonts.ready.then(() => { fitHeroTitle(true); remeasure(); });
    const tick = time => {
      states.forEach(state => {
        if (!state.active && time >= state.nextAt) {
          state.active = true; state.startedAt = time; state.direction = directions[Math.floor(random() * directions.length)]; measureDistance(state); parkSecondary(state);
        }
        if (!state.active) return;
        const progress = Math.min(1, (time - state.startedAt) / 1000);
        applyMotion(state, progress);
        if (progress >= 1) { state.active = false; settle(state); state.nextAt = time + nextDelay(); }
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function buildData() {
    const statuses = [
      'PLEASE WAIT WHILE I OVERTHINK THIS',
      'FUSING DESIGN AND ANIMATION',
      'PREPARING FOR INEVITABLE DEBUGGING',
      'CALIBRATING… WHAT EXACTLY? GOOD QUESTION'
    ];
    let status = 0;
    if (!reducedMotion) setInterval(() => { status = (status + 1) % statuses.length; $('#loader-line').textContent = statuses[status]; }, 2500);

    const binaryRows = [...document.querySelectorAll('.data-strip')].map(row => ({
      segments: [...row.querySelectorAll('span')].map(span => ({ span, bits: [], separatorCount: 0 }))
    }));
    let binarySeed = 0x2e25da7a;
    const nextBinaryRandom = () => {
      binarySeed = (binarySeed * 1664525 + 1013904223) >>> 0;
      return binarySeed / 4294967296;
    };
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const getCharacterWidth = span => {
      const styles = getComputedStyle(span);
      if (context) {
        context.font = `${styles.fontStyle} ${styles.fontVariant} ${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
        const measured = context.measureText('0').width;
        if (measured > 0) return measured;
      }
      return parseFloat(styles.fontSize) * .6 || 4;
    };
    const renderSegment = segment => {
      const separator = '/'.repeat(segment.separatorCount);
      const split = Math.ceil(segment.bits.length / 2);
      const first = segment.bits.slice(0, split).join('');
      const second = segment.bits.slice(split).join('');
      segment.span.dataset.binary = `${first}   ${separator}   ${second}   ${separator}`;
    };
    const resizeBinaryRows = () => {
      binaryRows.forEach(row => row.segments.forEach(segment => {
        const width = segment.span.getBoundingClientRect().width;
        const characterWidth = getCharacterWidth(segment.span);
        const capacity = Math.max(1, Math.floor(width / characterWidth));
        const separatorCount = Math.max(1, Math.min(7, Math.floor(capacity * .12)));
        const bitCount = Math.max(1, capacity - separatorCount * 2 - 9);
        while (segment.bits.length < bitCount) segment.bits.push(nextBinaryRandom() < .5 ? '0' : '1');
        segment.bits.length = bitCount;
        segment.separatorCount = separatorCount;
        renderSegment(segment);
      }));
    };
    resizeBinaryRows();
    addEventListener('resize', resizeBinaryRows, { passive: true });
    if (document.fonts?.ready) document.fonts.ready.then(resizeBinaryRows);
    const updateBinary = () => {
      binaryRows.forEach(row => {
        const totalBits = row.segments.reduce((total, segment) => total + segment.bits.length, 0);
        const bitCount = Math.min(totalBits, 10);
        const positions = new Set();
        const dirtySegments = new Set();
        while (positions.size < bitCount) positions.add(Math.floor(nextBinaryRandom() * totalBits));
        positions.forEach(position => {
          let remaining = position;
          let segmentIndex = 0;
          while (segmentIndex < row.segments.length - 1 && remaining >= row.segments[segmentIndex].bits.length) {
            remaining -= row.segments[segmentIndex].bits.length;
            segmentIndex += 1;
          }
          const bitIndex = remaining;
          const segment = row.segments[segmentIndex];
          segment.bits[bitIndex] = segment.bits[bitIndex] === '0' ? '1' : '0';
          dirtySegments.add(segmentIndex);
        });
        dirtySegments.forEach(segmentIndex => renderSegment(row.segments[segmentIndex]));
      });
    };
    updateBinary();
    if (!reducedMotion) setInterval(updateBinary, 100);

  }

  function buildWork() {
    const host = $('#work-media');
    workItems.forEach(([file, href], index) => {
      const card = document.createElement('a');
      card.className = 'work-card'; card.href = href; card.target = href === '#' ? '_self' : '_blank'; card.rel = 'noreferrer';
      card.dataset.index = index; card.setAttribute('aria-hidden', 'true');
      card.innerHTML = `<div class="work-card-screen" aria-hidden="true"></div><footer><span>${file.split('.')[0]}</span><span>${String(index + 1).padStart(2, '0')}—${String(9321 + index * 137).slice(-6)}</span></footer>`;
      host.append(card);
    });
  }

  function getWorkSpreadCopies() {
    const copiesPerSide = Math.max(
      workSpreadMinimumCopiesPerSide,
      Math.ceil(state.width / workSpreadTargetColumnWidth)
    );
    return copiesPerSide * 2;
  }

  function buildWorkSpread() {
    const host = $('.work-spread');
    if (!host) return;
    const copyCount = getWorkSpreadCopies();
    const copiesPerSide = copyCount / 2;
    host.replaceChildren();
    ['W', 'O', 'R', 'K'].forEach((letter, rowIndex) => {
      const row = document.createElement('div');
      row.className = 'work-spread-row';
      row.dataset.row = String(rowIndex);
      for (let side = -copiesPerSide; side <= copiesPerSide; side += 1) {
        const clone = document.createElement('span');
        clone.className = 'work-spread-letter';
        clone.textContent = letter;
        clone.dataset.side = String(side);
        clone.setAttribute('aria-hidden', 'true');
        row.append(clone);
      }
      host.append(row);
    });
    workIntroState.cloneCount = copyCount;
  }

  function buildMemories() {
    const host = $('#memory-field');
    const section = $('.my-way');
    const smiley = $('.my-way-smiley');
    if (!host || !section || !smiley) return;
    memoryScene.host = host;
    memoryScene.section = section;
    memoryScene.smiley = smiley;
    // `perspective` on the scene creates a containing block for fixed children.
    // Portal the canvas to the document root so it can cover subsequent sections.
    document.body.append(host);
    host.replaceChildren();
    if (reducedMotion || !window.THREE) return;
    const T = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.className = 'memory-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.append(canvas);
    try {
      memoryScene.renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch {
      host.replaceChildren();
      return;
    }
    memoryScene.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    memoryScene.renderer.outputColorSpace = T.SRGBColorSpace;
    memoryScene.renderer.setClearColor(0x000000, 0);
    memoryScene.canvas = canvas;
    memoryScene.scene = new T.Scene();
    memoryScene.camera = new T.PerspectiveCamera(38, 1, 1, 2600);
    memoryScene.camera.position.z = 900;
    memoryScene.frustum = new T.Frustum();
    memoryScene.viewProjectionMatrix = new T.Matrix4();
    memoryScene.bounds = new T.Box3();
    memoryScene.raycaster = new T.Raycaster();
    memoryScene.pointerNdc = new T.Vector2();
    memoryScene.pointerWorld = new T.Vector3();
    memoryScene.scene.add(new T.HemisphereLight(0xfff2ed, 0x160000, 2.25));
    const keyLight = new T.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(-300, 420, 720);
    memoryScene.scene.add(keyLight);
    const rimLight = new T.PointLight(0xf40c3f, 22, 1500);
    rimLight.position.set(280, -120, 420);
    memoryScene.scene.add(rimLight);
    preloadMemoryTextures();
    memoryScene.slots = Array.from({ length: memoryMaximumSlots }, () => {
      return { phase: 'idle', startedAt: 0, flight: null, kind: null, file: null, model: null, grab: null, dissolveMotion: null, dissolveStartedAt: 0 };
    });
    bindMemoryInteraction();
    resizeMemoryScene();
    const setSmileyVisibility = visible => {
      memoryScene.smileyVisible = visible;
      if (visible && !memoryScene.nextSpawnAt) memoryScene.nextSpawnAt = performance.now() + 120;
      if (visible || memoryScene.slots.some(slot => slot.startedAt)) requestMemoryFrame();
    };
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        const entry = entries[0];
        setSmileyVisibility(Boolean(entry?.isIntersecting));
      }, { threshold: .12 });
      observer.observe(smiley);
    } else {
      setSmileyVisibility(true);
    }
  }

  function resizeMemoryScene() {
    const { host, renderer, camera } = memoryScene;
    if (!host || !renderer || !camera) return;
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    const area = width * height;
    memoryScene.size.width = width;
    memoryScene.size.height = height;
    memoryScene.capacity = clamp(
      Math.round(area / memoryDensityArea),
      memoryMinimumSlots,
      memoryMaximumSlots
    );
    memoryScene.spawnInterval = Math.round(clamp(
      memorySpawnIntervalMin * Math.sqrt(memorySpawnReferenceArea / Math.max(area, 1)),
      memorySpawnIntervalMin,
      memorySpawnIntervalMax
    ));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    memoryScene.worldPerPixel = 2 * camera.position.z * Math.tan(camera.fov * Math.PI / 360) / height;
    measureMemorySpawnOrigin();
    renderer.render(memoryScene.scene, camera);
  }

  function measureMemoryRays() {
    const { section, smiley } = memoryScene;
    if (!section || !smiley) return;
    const layer = $('.my-way-lines', section);
    if (!layer) return;
    const sectionRect = section.getBoundingClientRect();
    const smileyRect = smiley.getBoundingClientRect();
    const centerX = smileyRect.left + smileyRect.width / 2 - sectionRect.left;
    const centerY = smileyRect.top + smileyRect.height / 2 - sectionRect.top;
    const width = sectionRect.width;
    const height = sectionRect.height;
    const spacing = 96;
    const horizontalSteps = Math.max(2, Math.round(width / spacing));
    const verticalSteps = Math.max(2, Math.round(height / spacing));
    const segments = [];
    const addRay = (x, y) => segments.push(`M${centerX.toFixed(2)} ${centerY.toFixed(2)}L${x.toFixed(2)} ${y.toFixed(2)}`);
    for (let index = 0; index <= horizontalSteps; index += 1) {
      const x = width * index / horizontalSteps;
      addRay(x, 0);
      addRay(x, height);
    }
    for (let index = 1; index < verticalSteps; index += 1) {
      const y = height * index / verticalSteps;
      addRay(0, y);
      addRay(width, y);
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', segments.join(''));
    svg.append(path);
    layer.replaceChildren(svg);
  }

  function measureMemorySpawnOrigin() {
    const { canvas, smiley } = memoryScene;
    if (!canvas || !smiley) return;
    const smileyRect = memoryScene.smiley.getBoundingClientRect();
    memoryScene.smileyDocumentCenter.x = smileyRect.left + smileyRect.width / 2 + scrollX;
    memoryScene.smileyDocumentCenter.y = smileyRect.top + smileyRect.height / 2 + scrollY;
    updateMemorySpawnOrigin();
  }

  function updateMemorySpawnOrigin() {
    const { canvas, size, worldPerPixel, smileyDocumentCenter } = memoryScene;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const smileyCenterX = smileyDocumentCenter.x - scrollX - canvasRect.left;
    const smileyCenterY = smileyDocumentCenter.y - scrollY - canvasRect.top;
    memoryScene.spawnOrigin.x = (smileyCenterX - size.width / 2) * worldPerPixel;
    memoryScene.spawnOrigin.y = (size.height / 2 - smileyCenterY) * worldPerPixel;
  }

  function preloadMemoryTextures() {
    const T = window.THREE;
    const loader = new T.TextureLoader();
    memories.forEach(([file]) => {
      loader.load(`./assets/wodniack/images/${file}`, texture => {
        texture.colorSpace = T.SRGBColorSpace;
        texture.anisotropy = Math.min(4, memoryScene.renderer?.capabilities.getMaxAnisotropy() || 1);
        memoryScene.textures.set(file, texture);
        memoryScene.slots.forEach(slot => {
          if (slot.file !== file || !slot.model?.userData.photoMaterial) return;
          slot.model.userData.photoMaterial.map = texture;
          slot.model.userData.photoMaterial.needsUpdate = true;
        });
      });
    });
  }

  function getMemoryColors() {
    const style = getComputedStyle(memoryScene.section);
    return { paper: style.getPropertyValue('--paper').trim() || '#e1cab8', ink: style.getPropertyValue('--ink').trim() || '#160000' };
  }

  function makeMemoryGridTexture(paper, ink) {
    const T = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    context.fillStyle = paper;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = ink;
    context.lineWidth = 1;
    for (let value = 0; value <= 256; value += 32) {
      context.beginPath();
      context.moveTo(value + .5, 0);
      context.lineTo(value + .5, 256);
      context.moveTo(0, value + .5);
      context.lineTo(256, value + .5);
      context.stroke();
    }
    context.lineWidth = 2;
    context.strokeRect(1, 1, 254, 254);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.userData.memoryGrid = true;
    return texture;
  }

  function addMemoryDissolve(material, uniforms) {
    material.transparent = true;
    material.alphaTest = .001;
    material.customProgramCacheKey = () => 'memory-dissolve-v2';
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vMemoryPoint;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMemoryPoint = position.xy;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec2 vMemoryPoint;
uniform float uMemoryDissolve;
uniform float uMemoryNoiseScale;
uniform float uMemoryOpacity;
uniform float uMemorySeed;
uniform vec3 uMemoryEdgeColor;
float memoryHash(vec3 point) {
  point = fract(point * .1031);
  point += dot(point, point.yzx + 33.33);
  return fract((point.x + point.y) * point.z);
}
float memoryNoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  return mix(
    mix(mix(memoryHash(cell), memoryHash(cell + vec3(1.,0.,0.)), local.x), mix(memoryHash(cell + vec3(0.,1.,0.)), memoryHash(cell + vec3(1.,1.,0.)), local.x), local.y),
    mix(mix(memoryHash(cell + vec3(0.,0.,1.)), memoryHash(cell + vec3(1.,0.,1.)), local.x), mix(memoryHash(cell + vec3(0.,1.,1.)), memoryHash(cell + vec3(1.,1.,1.)), local.x), local.y),
    local.z
  );
}`)
        .replace('#include <dithering_fragment>', `
float memoryThreshold = uMemoryDissolve * 1.4 - .24;
float memoryGrain = memoryNoise(vec3(vMemoryPoint * uMemoryNoiseScale + uMemorySeed, uMemorySeed));
if (memoryGrain < memoryThreshold) discard;
float memoryEdge = 1.0 - smoothstep(memoryThreshold, memoryThreshold + .09, memoryGrain);
gl_FragColor.rgb = mix(gl_FragColor.rgb, uMemoryEdgeColor, memoryEdge * smoothstep(.02, .22, uMemoryDissolve));
gl_FragColor.a *= uMemoryOpacity;
if (gl_FragColor.a < .01) discard;
#include <dithering_fragment>`);
      material.userData.memoryShader = shader;
    };
    material.needsUpdate = true;
    return material;
  }

  function makeCaptionMesh(caption, width, pixelScale, ink, paper, offsetY, cardThickness, dissolveUniforms) {
    const T = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 84;
    const context = canvas.getContext('2d');
    context.fillStyle = ink;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = paper;
    context.font = '700 22px monospace';
    context.textBaseline = 'middle';
    const label = caption.toUpperCase();
    context.fillText(label.slice(0, 52), 20, canvas.height / 2 + 1);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.userData.memoryCaption = true;
    const captionHeight = 28 * pixelScale;
    const captionThickness = cardThickness;
    const edge = addMemoryDissolve(new T.MeshStandardMaterial({ color: ink, roughness: .48, metalness: .08 }), dissolveUniforms);
    const front = addMemoryDissolve(new T.MeshBasicMaterial({ map: texture }), dissolveUniforms);
    const mesh = new T.Mesh(
      new T.BoxGeometry(width, captionHeight, captionThickness),
      [edge, edge, edge, edge, front, edge]
    );
    mesh.position.set(0, -offsetY, 0);
    return { mesh, height: captionHeight };
  }

  function makeStarShape(radius, innerRadius) {
    const T = window.THREE;
    const shape = new T.Shape();
    for (let index = 0; index < 8; index += 1) {
      const angle = Math.PI / 2 + index * Math.PI / 4;
      const radiusAtPoint = index % 2 === 0 ? radius : innerRadius;
      const x = Math.cos(angle) * radiusAtPoint;
      const y = Math.sin(angle) * radiusAtPoint;
      if (!index) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
  }

  function makeMemoryModel(kind, file, caption) {
    const T = window.THREE;
    const { paper, ink } = getMemoryColors();
    const pixelScale = memoryScene.worldPerPixel;
    const root = new T.Group();
    root.userData.pixelScale = pixelScale;
    if (kind === 'star') {
      const geometry = new T.ExtrudeGeometry(makeStarShape(86 * pixelScale, 28 * pixelScale), {
        depth: 10 * pixelScale,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 1.5 * pixelScale,
        bevelThickness: 1.5 * pixelScale
      });
      geometry.center();
      root.add(new T.Mesh(geometry, new T.MeshBasicMaterial({ color: 0x000000 })));
      return root;
    }
    const texture = memoryScene.textures.get(file);
    const aspectRatio = texture?.image?.width && texture?.image?.height ? texture.image.width / texture.image.height : memoryAspectRatios.get(file) || 1;
    const width = 156 * pixelScale;
    const height = width / aspectRatio;
    const thickness = 10 * pixelScale;
    const sharedNoiseScale = { value: 1 / Math.max(18 * pixelScale, .001) };
    const sharedNoiseSeed = { value: seeded(memoryScene.serial + 910) * 8 };
    const sharedEdgeColor = { value: new T.Color(0x000000) };
    const dissolveUniforms = {
      uMemoryDissolve: { value: 0 },
      uMemoryNoiseScale: sharedNoiseScale,
      uMemoryOpacity: { value: 1 },
      uMemorySeed: sharedNoiseSeed,
      uMemoryEdgeColor: sharedEdgeColor
    };
    const gridDissolveUniforms = {
      uMemoryDissolve: { value: 0 },
      uMemoryNoiseScale: sharedNoiseScale,
      uMemoryOpacity: { value: 1 },
      uMemorySeed: sharedNoiseSeed,
      uMemoryEdgeColor: sharedEdgeColor
    };
    const edge = addMemoryDissolve(new T.MeshStandardMaterial({ color: ink, roughness: .5, metalness: .1 }), dissolveUniforms);
    const front = addMemoryDissolve(new T.MeshStandardMaterial({ color: texture ? 0xffffff : paper, map: texture || null, roughness: .72, metalness: 0 }), dissolveUniforms);
    const card = new T.Mesh(new T.BoxGeometry(width, height, thickness), [edge, edge, edge, edge, front, edge]);
    card.userData.memoryHitTarget = true;
    root.userData.photoMaterial = front;
    root.userData.dissolveUniforms = dissolveUniforms;
    root.userData.baseWidth = width;
    // Keep the complete card (image plus caption) centered on the group origin.
    // That origin is positioned at the smiley's exact center when the flight begins.
    card.position.y = 14 * pixelScale;
    root.add(card);
    const gridTexture = makeMemoryGridTexture(paper, ink);
    const gridMaterial = addMemoryDissolve(new T.MeshBasicMaterial({ map: gridTexture, transparent: true, depthWrite: false }), gridDissolveUniforms);
    const grid = new T.Mesh(new T.PlaneGeometry(width, height), gridMaterial);
    grid.position.set(0, card.position.y, thickness / 2 - .65 * pixelScale);
    grid.userData.memoryGrid = true;
    root.userData.gridMaterial = gridMaterial;
    root.userData.gridDissolveUniforms = gridDissolveUniforms;
    root.add(grid);
    const captionMesh = makeCaptionMesh(caption, width, pixelScale, ink, paper, height / 2, thickness, dissolveUniforms);
    root.add(captionMesh.mesh);
    return root;
  }

  function disposeMemoryModel(model) {
    if (!model) return;
    const disposedMaterials = new Set();
    const disposedGeometries = new Set();
    model.traverse(object => {
      if (!object.isMesh) return;
      if (object.geometry && !disposedGeometries.has(object.geometry)) {
        disposedGeometries.add(object.geometry);
        object.geometry.dispose();
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => {
        if (!material || disposedMaterials.has(material)) return;
        disposedMaterials.add(material);
        if (material?.map?.userData?.memoryCaption) material.map.dispose();
        if (material?.map?.userData?.memoryGrid) material.map.dispose();
        material?.dispose();
      });
    });
    memoryScene.scene.remove(model);
  }

  function resetMemorySlot(slot) {
    if (memoryScene.grabbedSlot === slot) memoryScene.grabbedSlot = null;
    if (memoryScene.hoveredSlot === slot) memoryScene.hoveredSlot = null;
    disposeMemoryModel(slot.model);
    slot.phase = 'idle';
    slot.startedAt = 0;
    slot.flight = null;
    slot.kind = null;
    slot.file = null;
    slot.model = null;
    slot.grab = null;
    slot.dissolveMotion = null;
    slot.dissolveStartedAt = 0;
  }

  function requestMemoryFrame() {
    if (!memoryScene.frame) memoryScene.frame = requestAnimationFrame(updateMemoryFlight);
  }

  function spawnMemory(slot, time) {
    const kind = memorySpawnSequence[memoryScene.sequenceIndex % memorySpawnSequence.length];
    memoryScene.sequenceIndex += 1;
    const serial = memoryScene.serial;
    memoryScene.serial += 1;
    let file = null;
    let caption = '';
    if (kind === 'star') {
    } else {
      [file, caption] = memories[memoryScene.photoIndex % memories.length];
      memoryScene.photoIndex += 1;
    }
    disposeMemoryModel(slot.model);
    slot.model = makeMemoryModel(kind, file, caption);
    memoryScene.scene.add(slot.model);
    slot.kind = kind;
    slot.file = file;
    slot.phase = 'flying';
    slot.grab = null;
    slot.dissolveMotion = null;
    slot.dissolveStartedAt = 0;
    const variation = seeded(serial + 500);
    const T = window.THREE;
    const spinAxis = new T.Vector3(
      seeded(serial + 560) * 2 - 1,
      seeded(serial + 580) * 2 - 1,
      seeded(serial + 600) * 2 - 1
    ).normalize();
    slot.flight = {
      angle: Math.random() * Math.PI * 2,
      duration: memoryLifetimeMin + seeded(serial + 620) * (memoryLifetimeMax - memoryLifetimeMin),
      distance: Math.hypot(state.width, state.height) * (1.13 + variation * .24),
      baseRotation: new T.Quaternion().setFromEuler(new T.Euler(
        seeded(serial + 540) * .72 - .36,
        seeded(serial + 550) * .72 - .36,
        seeded(serial + 555) * .72 - .36
      )),
      spinAxis,
      spinSpeed: (kind === 'star' ? 15 : 10) * (.72 + seeded(serial + 570) * .56),
      spinQuaternion: new T.Quaternion(),
      scale: kind === 'star' ? 3 + variation * 4 : 6 + variation * 3
    };
    slot.startedAt = time;
    paintMemory(slot, 0);
  }

  function memoryPointerToWorld(clientX, clientY, z = memoryGrabDepth) {
    const { canvas, camera, pointerNdc, pointerWorld } = memoryScene;
    if (!canvas || !camera || !pointerNdc || !pointerWorld) return null;
    const rect = canvas.getBoundingClientRect();
    pointerNdc.set(
      (clientX - rect.left) / Math.max(rect.width, 1) * 2 - 1,
      -((clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1
    );
    pointerWorld.set(pointerNdc.x, pointerNdc.y, .5).unproject(camera);
    pointerWorld.sub(camera.position).normalize();
    const distance = (z - camera.position.z) / pointerWorld.z;
    return pointerWorld.multiplyScalar(distance).add(camera.position);
  }

  function hitMemoryPhoto(clientX, clientY) {
    const { raycaster, camera, pointerNdc, canvas } = memoryScene;
    if (!raycaster || !camera || !pointerNdc || !canvas) return null;
    const candidates = memoryScene.slots.filter(slot => slot.phase === 'flying' && slot.kind === 'photo' && slot.model);
    if (!candidates.length) return null;
    const rect = canvas.getBoundingClientRect();
    pointerNdc.set(
      (clientX - rect.left) / Math.max(rect.width, 1) * 2 - 1,
      -((clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1
    );
    candidates.forEach(slot => slot.model.updateMatrixWorld(true));
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(candidates.map(slot => slot.model), true);
    for (const hit of hits) {
      if (hit.object.userData.memoryGrid) continue;
      const slot = candidates.find(candidate => {
        let object = hit.object;
        while (object) {
          if (object === candidate.model) return true;
          object = object.parent;
        }
        return false;
      });
      if (slot) return slot;
    }
    return null;
  }

  function setMemoryCursor(slot, grabbing = false) {
    memoryScene.hoveredSlot = slot;
    document.body.classList.toggle('memory-can-grab', Boolean(slot) && !grabbing);
    document.body.classList.toggle('memory-is-grabbing', grabbing);
  }

  function beginMemoryGrab(slot, event) {
    const T = window.THREE;
    const model = slot.model;
    if (!model || slot.phase !== 'flying') return;
    const depthScale = (memoryScene.camera.position.z - memoryGrabDepth) / memoryScene.camera.position.z;
    const targetScale = memoryGrabWidth * memoryScene.worldPerPixel * depthScale / model.userData.baseWidth;
    slot.phase = 'grabbed';
    slot.grab = {
      velocity: new T.Vector3(),
      scaleVelocity: 0,
      targetScale,
      targetQuaternion: new T.Quaternion(),
      tiltEuler: new T.Euler()
    };
    memoryScene.grabbedSlot = slot;
    memoryScene.pointer.id = event.pointerId;
    memoryScene.pointer.x = event.clientX;
    memoryScene.pointer.y = event.clientY;
    memoryScene.pointer.lastX = event.clientX;
    memoryScene.pointer.lastY = event.clientY;
    memoryScene.pointer.lastAt = performance.now();
    memoryScene.pointer.vx = 0;
    memoryScene.pointer.vy = 0;
    memoryScene.pointer.seen = true;
    memoryScene.suppressClickUntil = performance.now() + 700;
    setMemoryCursor(slot, true);
    requestMemoryFrame();
  }

  function releaseMemoryGrab(time = performance.now()) {
    const slot = memoryScene.grabbedSlot;
    if (!slot || slot.phase !== 'grabbed') return;
    const T = window.THREE;
    const depthScale = (memoryScene.camera.position.z - slot.model.position.z) / memoryScene.camera.position.z;
    const worldPerScreenPixel = memoryScene.worldPerPixel * depthScale;
    const pointerVelocity = new T.Vector3(
      memoryScene.pointer.vx * worldPerScreenPixel,
      -memoryScene.pointer.vy * worldPerScreenPixel,
      0
    );
    const outward = new T.Vector3(slot.model.position.x, slot.model.position.y, 0);
    if (outward.lengthSq() < .001) {
      outward.set(
        memoryScene.pointer.x - memoryScene.size.width / 2,
        memoryScene.size.height / 2 - memoryScene.pointer.y,
        0
      );
    }
    if (outward.lengthSq() < .001) outward.set(1, 0, 0);
    outward.normalize();
    const velocity = slot.grab.velocity.clone().multiplyScalar(.6).addScaledVector(pointerVelocity, .4);
    const minimumOutwardSpeed = 900 * worldPerScreenPixel;
    const outwardSpeed = velocity.dot(outward);
    if (outwardSpeed < minimumOutwardSpeed) velocity.addScaledVector(outward, minimumOutwardSpeed - outwardSpeed);
    const throwSpeedPixels = velocity.length() / Math.max(worldPerScreenPixel, .001);
    const travelPixels = Math.hypot(memoryScene.size.width, memoryScene.size.height) * .58 + Math.min(throwSpeedPixels * .12, 240);
    const direction = velocity.clone().normalize();
    const spinDirection = Math.abs(memoryScene.pointer.vx) > 12 ? -Math.sign(memoryScene.pointer.vx) : (outward.x >= 0 ? 1 : -1);
    slot.phase = 'dissolving';
    slot.dissolveStartedAt = time;
    slot.dissolveMotion = {
      startPosition: slot.model.position.clone(),
      direction,
      distance: travelPixels * worldPerScreenPixel,
      startQuaternion: slot.model.quaternion.clone(),
      spinAxis: new T.Vector3(-direction.y * .18, direction.x * .18, 1).normalize(),
      spinAngle: spinDirection * .3,
      spinQuaternion: new T.Quaternion()
    };
    slot.grab = null;
    memoryScene.grabbedSlot = null;
    memoryScene.pointer.id = null;
    memoryScene.suppressClickUntil = time + 500;
    setMemoryCursor(null, false);
    requestMemoryFrame();
  }

  function bindMemoryInteraction() {
    if (!matchMedia('(pointer:fine)').matches) return;
    addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' || event.button !== 0 || memoryScene.grabbedSlot) return;
      const slot = hitMemoryPhoto(event.clientX, event.clientY);
      if (!slot) return;
      event.preventDefault();
      event.stopPropagation();
      beginMemoryGrab(slot, event);
    }, { capture: true, passive: false });
    addEventListener('pointermove', event => {
      const pointer = memoryScene.pointer;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.seen = true;
      if (memoryScene.grabbedSlot && pointer.id === event.pointerId) {
        const now = performance.now();
        const elapsed = Math.max(now - pointer.lastAt, 8);
        const instantVx = (event.clientX - pointer.lastX) / elapsed * 1000;
        const instantVy = (event.clientY - pointer.lastY) / elapsed * 1000;
        pointer.vx += (instantVx - pointer.vx) * .3;
        pointer.vy += (instantVy - pointer.vy) * .3;
        pointer.lastX = event.clientX;
        pointer.lastY = event.clientY;
        pointer.lastAt = now;
        if (event.cancelable) event.preventDefault();
        requestMemoryFrame();
      }
    }, { passive: false });
    addEventListener('pointerup', event => {
      if (memoryScene.pointer.id !== event.pointerId) return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      releaseMemoryGrab();
    }, { capture: true });
    addEventListener('pointercancel', event => {
      if (memoryScene.pointer.id === event.pointerId) releaseMemoryGrab();
    }, { capture: true });
    addEventListener('blur', () => releaseMemoryGrab());
    addEventListener('click', event => {
      if (performance.now() >= memoryScene.suppressClickUntil) return;
      event.preventDefault();
      event.stopPropagation();
      memoryScene.suppressClickUntil = 0;
    }, { capture: true });
  }

  function paintMemory(slot, progress) {
    const { model, flight } = slot;
    if (!model || !flight) return;
    const approach = clamp(progress);
    // One continuous ease-in curve: slow at the vanishing point, faster as it exits.
    // It remains unbounded after progress 1 so off-screen models can finish leaving.
    const travel = Math.pow(Math.max(progress, 0), 1.8);
    const depth = approach * approach;
    const pixelScale = memoryScene.worldPerPixel;
    const z = -520 + depth * 810;
    const origin = memoryScene.spawnOrigin;
    const projectedX = origin.x + Math.cos(flight.angle) * flight.distance * travel * pixelScale;
    const projectedY = origin.y - Math.sin(flight.angle) * flight.distance * travel * pixelScale;
    // Convert the intended screen-space path back into world space at this depth.
    // This keeps progress 0 exactly on the radiating-lines intersection, rather
    // than letting a distant model visually drift toward the canvas center.
    const depthCompensation = (memoryScene.camera.position.z - z) / memoryScene.camera.position.z;
    const x = projectedX * depthCompensation;
    const y = projectedY * depthCompensation;
    const scale = (.055 + depth * flight.scale) * (pixelScale / model.userData.pixelScale);
    model.position.set(x, y, z);
    model.scale.setScalar(scale);
    flight.spinQuaternion.setFromAxisAngle(flight.spinAxis, progress * flight.spinSpeed);
    model.quaternion.copy(flight.baseRotation).multiply(flight.spinQuaternion);
  }

  function isMemoryVisible(model) {
    const { camera, frustum, viewProjectionMatrix, bounds } = memoryScene;
    if (!model || !camera || !frustum || !viewProjectionMatrix || !bounds) return false;
    model.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    viewProjectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjectionMatrix);
    bounds.setFromObject(model);
    return frustum.intersectsBox(bounds);
  }

  function updateGrabbedMemory(slot, delta) {
    const { model, grab } = slot;
    if (!model || !grab) return;
    const pointerTarget = memoryPointerToWorld(memoryScene.pointer.x, memoryScene.pointer.y);
    if (!pointerTarget) return;
    const stiffness = 168;
    const damping = Math.exp(-10.5 * delta);
    grab.velocity.addScaledVector(pointerTarget.sub(model.position), stiffness * delta).multiplyScalar(damping);
    model.position.addScaledVector(grab.velocity, delta);
    grab.scaleVelocity += (grab.targetScale - model.scale.x) * 145 * delta;
    grab.scaleVelocity *= Math.exp(-9.5 * delta);
    const nextScale = Math.max(.01, model.scale.x + grab.scaleVelocity * delta);
    model.scale.setScalar(nextScale);
    memoryScene.pointer.vx *= Math.exp(-7 * delta);
    memoryScene.pointer.vy *= Math.exp(-7 * delta);
    grab.tiltEuler.set(
      clamp(memoryScene.pointer.vy / 2200, -.1, .1),
      clamp(-memoryScene.pointer.vx / 2200, -.12, .12),
      clamp(-memoryScene.pointer.vx / 8500, -.035, .035)
    );
    grab.targetQuaternion.setFromEuler(grab.tiltEuler);
    model.quaternion.slerp(grab.targetQuaternion, 1 - Math.exp(-10 * delta));
  }

  function updateDissolvingMemory(slot, time) {
    const elapsed = time - slot.dissolveStartedAt;
    const progress = clamp(elapsed / memoryDissolveDuration);
    const travelProgress = clamp(elapsed / memoryExitDuration);
    const uniforms = slot.model?.userData.dissolveUniforms;
    const gridUniforms = slot.model?.userData.gridDissolveUniforms;
    if (slot.dissolveMotion && slot.model) {
      const easedTravel = travelProgress * travelProgress * travelProgress;
      slot.model.position.copy(slot.dissolveMotion.startPosition).addScaledVector(
        slot.dissolveMotion.direction,
        slot.dissolveMotion.distance * easedTravel
      );
      slot.dissolveMotion.spinQuaternion.setFromAxisAngle(
        slot.dissolveMotion.spinAxis,
        slot.dissolveMotion.spinAngle * easedTravel
      );
      slot.model.quaternion.copy(slot.dissolveMotion.startQuaternion).multiply(slot.dissolveMotion.spinQuaternion);
    }
    if (uniforms) {
      const photoProgress = clamp(progress / .76);
      uniforms.uMemoryDissolve.value = photoProgress * photoProgress * (3 - 2 * photoProgress);
    }
    if (gridUniforms) {
      const gridProgress = clamp((progress - .18) / .82);
      gridUniforms.uMemoryDissolve.value = gridProgress * gridProgress * (3 - 2 * gridProgress);
    }
    if (progress >= 1) resetMemorySlot(slot);
  }

  function updateMemoryFlight(time) {
    memoryScene.frame = 0;
    const delta = Math.min(Math.max((time - (memoryScene.lastFrameAt || time)) / 1000, 0), .032);
    memoryScene.lastFrameAt = time;
    // The overlay is fixed, but the flight paths live in the smiley's frame of reference.
    // Use document coordinates plus the current scroll position to avoid layout-read lag.
    updateMemorySpawnOrigin();
    if (memoryScene.smileyVisible && time >= memoryScene.nextSpawnAt) {
      const freeSlot = memoryScene.slots.slice(0, memoryScene.capacity).find(slot => !slot.startedAt);
      if (freeSlot) {
        spawnMemory(freeSlot, time);
        memoryScene.nextSpawnAt = time + memoryScene.spawnInterval;
      } else {
        memoryScene.nextSpawnAt = time + 100;
      }
    }
    let hasFlyingObjects = false;
    memoryScene.slots.forEach(slot => {
      if (!slot.startedAt) return;
      if (slot.phase === 'flying') {
        const progress = (time - slot.startedAt) / slot.flight.duration;
        paintMemory(slot, Math.max(progress, 0));
        if (!isMemoryVisible(slot.model)) {
          resetMemorySlot(slot);
          return;
        }
      } else if (slot.phase === 'grabbed') {
        updateGrabbedMemory(slot, delta);
      } else if (slot.phase === 'dissolving') {
        updateDissolvingMemory(slot, time);
        if (slot.phase === 'idle') return;
      }
      hasFlyingObjects = true;
    });
    if (!memoryScene.grabbedSlot && memoryScene.pointer.seen && matchMedia('(pointer:fine)').matches) {
      setMemoryCursor(hitMemoryPhoto(memoryScene.pointer.x, memoryScene.pointer.y), false);
    }
    memoryScene.renderer?.render(memoryScene.scene, memoryScene.camera);
    if (memoryScene.smileyVisible || hasFlyingObjects) requestMemoryFrame();
  }

  function gridPath(width, height, focalY = .36) {
    const cx = width / 2, cy = height * focalY, cols = Math.max(8, Math.round(width / 105)), rows = 12;
    let path = `M0 ${height}H${width}`;
    for (let i = 0; i <= cols; i += 1) {
      const x = i * width / cols; path += `M${x} 0L${cx} ${cy}M${x} ${height}L${cx} ${cy}`;
    }
    for (let i = 0; i <= rows; i += 1) {
      const y = i * height / rows; path += `M0 ${y}L${cx} ${cy}M${width} ${y}L${cx} ${cy}`;
    }
    return path;
  }

  function fitHeroTitle(force = false) {
    const title = $('.hero-title');
    if (!title) return;
    const fitKey = `${Math.round(title.clientWidth)}:${Math.round(title.clientHeight)}`;
    if (!force && title.dataset.fitKey === fitKey) return;
    title.dataset.fitKey = fitKey;
    title.style.fontSize = '';
    title.style.gap = '0px';
    const words = [...title.querySelectorAll('.hero-word')];
    const star = title.querySelector('.hero-star');
    if (words.length !== 2 || !star) return;
    star.style.transform = '';
    const baseSize = parseFloat(getComputedStyle(title).fontSize);
    const wordScaleX = 1.26;
    const wordWidth = words.reduce((sum, word) => sum + word.offsetWidth * wordScaleX, 0);
    const referenceLetters = [...words[0].querySelectorAll('.hero-letter-cell')].slice(0, 2);
    const twoLetterWidth = referenceLetters.reduce((sum, letter) => sum + letter.offsetWidth * wordScaleX, 0);
    const starWidth = star.offsetWidth;
    const styles = getComputedStyle(title);
    const padding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const available = Math.max(1, title.clientWidth - padding - starWidth);
    const scale = Math.min(1, available / Math.max(wordWidth + twoLetterWidth * 2, 1));
    title.style.fontSize = `${Math.max(1, baseSize * scale)}px`;
    title.style.gap = `${twoLetterWidth * scale}px`;
    const firstEnd = words[0].offsetLeft + words[0].offsetWidth;
    const secondStart = words[1].offsetLeft;
    const targetCenter = (firstEnd + secondStart) / 2;
    const starCenter = star.offsetLeft + star.offsetWidth / 2;
    star.style.transform = `translateX(${targetCenter - starCenter}px)`;
  }

  function resize() {
    state.width = innerWidth; state.height = innerHeight;
    fitHeroTitle();
    measureWorkIntro();
    measureWorkTimeline();
    const contact = $('.contact');
    $('.contact-grid').setAttribute('viewBox', `0 0 ${contact.clientWidth} ${contact.clientHeight}`);
    $('.contact-grid path').setAttribute('d', gridPath(contact.clientWidth, contact.clientHeight, .28));
    measureMemoryRays();
    resizeMemoryScene();
    updateScroll();
  }

  function measureWorkIntro() {
    const outer = $('.work-capsule--outer');
    const inner = $('.work-capsule--inner');
    const dotField = $('.work-dot-field');
    const title = $('.work-title');
    const typeLayer = $('.work-type-layer');
    const typeInnerMask = $('.work-type-inner-mask');
    const scene = $('.work-zoom-scene');
    const spread = $('.work-spread');
    if (!outer || !inner || !dotField || !title || !typeLayer || !typeInnerMask || !scene || !spread) return;
    workIntroState.outer = outer;
    workIntroState.inner = inner;
    workIntroState.dotField = dotField;
    workIntroState.title = title;
    workIntroState.typeLayer = typeLayer;
    workIntroState.typeInnerMask = typeInnerMask;
    workIntroState.scene = scene;
    workIntroState.spread = spread;
    workIntroState.measured = true;
    if (workIntroState.cloneCount !== getWorkSpreadCopies()) buildWorkSpread();
    const width = Math.max(inner.offsetWidth, 1);
    const height = Math.max(inner.offsetHeight, 1);
    const stage = $('.work-stage');
    workIntroState.coverScale = Math.max((stage?.clientWidth || state.width) * 1.04 / width, (stage?.clientHeight || state.height) * 1.04 / height);
    measureWorkAperture();
  }

  function measureWorkTimeline() {
    const section = $('.work');
    if (!section) return;
    workTimelineState.expansion = state.height * workExpansionScreens;
    workTimelineState.hold = state.height * workHoldScreens;
    workTimelineState.media = state.height * (workCardTravelScreens + (workItems.length - 1) * workCardStaggerScreens);
    workTimelineState.cardTail = state.height * workCardTailScreens;
    workTimelineState.collapse = state.height * workCollapseScreens;
    workTimelineState.total = workAnchorBuffer + workTimelineState.expansion + workTimelineState.hold + workTimelineState.media + workTimelineState.cardTail + workTimelineState.collapse;
    section.style.height = `${state.height + workTimelineState.total}px`;
  }

  function measureWorkAperture() {
    const stage = $('.work-stage');
    const aperture = $('.work-aperture');
    if (!stage || !aperture || !workIntroState.outer) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const targetCellSize = 64;
    const columns = Math.max(1, Math.round(width / targetCellSize));
    const rows = Math.max(1, Math.round(height / targetCellSize));
    aperture.setAttribute('viewBox', `0 0 ${width} ${height}`);
    ['.work-aperture-cover', '.work-aperture-paper', '.work-aperture-dot-field'].forEach(selector => {
      const rect = $(selector, aperture);
      rect.setAttribute('x', '0'); rect.setAttribute('y', '0');
      rect.setAttribute('width', String(width)); rect.setAttribute('height', String(height));
    });
    const path = [];
    for (let column = 0; column <= columns; column += 1) {
      const x = column * width / columns;
      path.push(`M${x} 0V${height}`);
    }
    for (let row = 0; row <= rows; row += 1) {
      const y = row * height / rows;
      path.push(`M0 ${y}H${width}`);
    }
    $('.work-aperture-lines', aperture).setAttribute('d', path.join(''));
    updateWorkAperture();
  }

  function updateWorkAperture() {
    const stage = $('.work-stage');
    const hole = $('.work-aperture-hole');
    const outer = workIntroState.outer;
    if (!stage || !hole || !outer) return;
    const width = outer.offsetWidth;
    const height = outer.offsetHeight;
    // Keep the mask in the unscaled scene coordinate system. The scene
    // transform then scales the grid and its aperture exactly once.
    hole.setAttribute('x', String((stage.clientWidth - width) / 2));
    hole.setAttribute('y', String((stage.clientHeight - height) / 2));
    hole.setAttribute('width', String(width));
    hole.setAttribute('height', String(height));
    hole.setAttribute('rx', String(width / 2));
    hole.setAttribute('ry', String(height / 2));
  }

  function updateWorkTypeClip() {
    const { typeLayer, typeInnerMask, outer, inner } = workIntroState;
    const stage = $('.work-stage');
    if (!typeLayer || !typeInnerMask || !outer || !inner || !stage) return;
    const stageRect = stage.getBoundingClientRect();
    const applyCapsuleClip = (element, capsule) => {
      const rect = capsule.getBoundingClientRect();
      const left = rect.left - stageRect.left;
      const right = stageRect.right - rect.right;
      const top = rect.top - stageRect.top;
      const bottom = stageRect.bottom - rect.bottom;
      if (left <= 0 && right <= 0 && top <= 0 && bottom <= 0) {
        element.style.clipPath = 'inset(0)';
        return;
      }
      const radius = Math.min(rect.width, rect.height) / 2;
      element.style.clipPath = `inset(${top.toFixed(3)}px ${right.toFixed(3)}px ${bottom.toFixed(3)}px ${left.toFixed(3)}px round ${radius.toFixed(3)}px)`;
    };
    applyCapsuleClip(typeLayer, outer);
    applyCapsuleClip(typeInnerMask, inner);
  }

  function updateWorkTypeMetrics(workScale, spreadProgress) {
    const { typeLayer } = workIntroState;
    const stage = $('.work-stage');
    if (!typeLayer) return 118;
    const baseSize = Math.min(150, Math.max(118, state.width * .104));
    const preferredSize = baseSize * workScale;
    const height = Math.max(stage?.clientHeight || state.height, 1);
    const gapRatio = workTitleGap / baseSize;
    const titleStack = workTitleLineHeight * 4 + gapRatio * 3;
    const edgeRowOffset = titleStack / 2 - workTitleLineHeight / 2;
    const edgeLetterHalfHeight = workTitleLineHeight / 2 * (1 + workSpreadEdgeGrowth * spreadProgress);
    const arcHeight = height * workOuterArcRatio * spreadProgress;
    const verticalGutter = clamp(height * .04, 20, 48);
    const availableHalfHeight = Math.max(0, height / 2 - verticalGutter - arcHeight);
    const maxSize = availableHalfHeight / Math.max(edgeRowOffset + edgeLetterHalfHeight, .001);
    const size = Math.max(40, Math.min(preferredSize, maxSize));
    typeLayer.style.setProperty('--work-type-size', `${size.toFixed(3)}px`);
    typeLayer.style.setProperty('--work-type-gap', `${(size * gapRatio).toFixed(3)}px`);
    return size;
  }

  function updateWorkTypeOffset(offset) {
    const { title, spread } = workIntroState;
    if (!title || !spread) return;
    const rounded = Math.round(offset);
    title.style.top = `${rounded}px`;
    title.style.bottom = `${-rounded}px`;
    spread.style.top = `${rounded}px`;
    spread.style.bottom = `${-rounded}px`;
  }

  function wrapWorkTrackPosition(position, period) {
    const wrapped = ((position % period) + period) % period;
    return wrapped >= period / 2 ? wrapped - period : wrapped;
  }

  function updateWorkSpread(progress, typeSize, loopDistance = 0, collapseProgress = 0) {
    const { spread, title } = workIntroState;
    if (!spread || !title) return;
    const titleLetters = document.querySelectorAll('.work-title span');
    const width = Math.max(spread.clientWidth, 1);
    const height = Math.max(spread.clientHeight, 1);
    const copyCount = Math.max(workIntroState.cloneCount, 2);
    const copiesPerSide = copyCount / 2;
    const step = width * 1.1 / copyCount;
    const cycle = step * (copyCount + 1);
    const offset = loopDistance * .5;
    const outerArc = height * workOuterArcRatio;
    const innerArc = height * workInnerArcRatio;
    const eased = progress * progress * (3 - 2 * progress);
    const easedCollapse = collapseProgress * collapseProgress * (3 - 2 * collapseProgress);
    const isCollapsing = collapseProgress > 0;
    const isLooping = loopDistance > 0 && progress >= 1 && !isCollapsing;
    spread.style.opacity = '1';
    title.style.opacity = isCollapsing ? easedCollapse.toFixed(3) : (isLooping ? '0' : '1');
    spread.querySelectorAll('.work-spread-row').forEach((row, rowIndex) => {
      const titleLetter = titleLetters[rowIndex];
      const baseY = titleLetter ? titleLetter.offsetTop + titleLetter.offsetHeight / 2 - title.clientHeight / 2 : 0;
      const arc = rowIndex === 0 || rowIndex === 3 ? outerArc : innerArc;
      const arcDirection = rowIndex < 2 ? -1 : 1;
      row.querySelectorAll('.work-spread-letter').forEach(clone => {
        const side = Number(clone.dataset.side);
        const spreadPosition = side * step * eased;
        const loopPosition = wrapWorkTrackPosition(side * step - offset, cycle);
        const x = isCollapsing ? loopPosition * eased : (isLooping ? loopPosition : spreadPosition);
        const distance = clamp(Math.abs(x) / Math.max(copiesPerSide * step, 1));
        const y = baseY + arcDirection * arc * distance * distance * eased;
        const scale = 1 + workSpreadEdgeGrowth * distance * distance * eased;
        const fontSize = typeSize * scale;
        clone.style.left = `${Math.round(width / 2 + x - fontSize * .325)}px`;
        clone.style.top = `${Math.round(height / 2 + y - fontSize * workTitleLineHeight / 2)}px`;
        clone.style.fontSize = `${fontSize.toFixed(3)}px`;
        clone.style.zIndex = String(Math.round((1 - distance) * 1000));
        clone.style.transform = 'none';
        clone.style.opacity = '1';
      });
    });
  }

  function updateWorkIntro(entryProgress, expansionProgress, postDistance, loopDistance = 0, collapseProgress = 0, exitProgress = 0) {
    if (!workIntroState.measured) measureWorkIntro();
    const { outer, inner, dotField, title, typeLayer, scene, spread } = workIntroState;
    if (!outer || !inner || !dotField || !title || !typeLayer || !scene || !spread) return;
    if (reducedMotion) {
      const sceneScale = workIntroState.coverScale;
      const workScale = 1 + (sceneScale - 1) * .1;
      const typeSize = updateWorkTypeMetrics(workScale, 1);
      outer.style.transform = 'translate3d(-50%,-50%,0)';
      inner.style.transform = 'translate3d(-50%,-50%,0)';
      dotField.style.transform = `translate3d(-50%,-50%,0) scale(${(1 / sceneScale).toFixed(4)})`;
      dotField.style.setProperty('--dot-radius', '1px');
      dotField.style.setProperty('--dot-spacing', `${(12 * (1 + (sceneScale - 1) * .2)).toFixed(3)}px`);
      dotField.style.backgroundPosition = 'center center';
      title.style.opacity = '1';
      scene.style.transform = `scale(${sceneScale})`;
      updateWorkTypeOffset(0);
      updateWorkTypeClip();
      updateWorkSpread(1, typeSize);
      updateWorkAperture();
      return;
    }
    const innerShift = exitProgress > 0
      ? state.height * (1 - workInnerSpeed) * exitProgress
      : (postDistance > 0 ? 0 : -state.height * (1 - workInnerSpeed) * (1 - entryProgress));
    const titleOuterShift = exitProgress > 0
      ? state.height * (1 - workTitleSpeed) * exitProgress
      : (postDistance > 0 ? 0 : -state.height * (1 - workTitleSpeed) * (1 - entryProgress));
    outer.style.transform = 'translate3d(-50%,-50%,0)';
    const easedExpansion = expansionProgress * expansionProgress * (3 - 2 * expansionProgress);
    const sceneScale = 1 + (workIntroState.coverScale - 1) * easedExpansion;
    const workScale = 1 + (sceneScale - 1) * .1;
    const typeSize = updateWorkTypeMetrics(workScale, easedExpansion);
    inner.style.transform = `translate3d(-50%,calc(-50% + ${innerShift}px),0)`;
    const dotGrowth = 1 + (sceneScale - 1) * .2;
    // Counter-scale the texture layer so the scene zoom does not shrink
    // points into sub-pixels. Only the spacing grows (20% of scene zoom),
    // while each point remains a stable 1px mark in the final image.
    const dotScale = 1 / sceneScale;
    const dotSpacing = 12 * dotGrowth;
    const expandedDotSpacing = 12 * (1 + (workIntroState.coverScale - 1) * .2);
    const expandedDotOffset = loopDistance * .25 % expandedDotSpacing;
    const dotOffset = expandedDotOffset * dotSpacing / expandedDotSpacing;
    dotField.style.setProperty('--dot-radius', '1px');
    dotField.style.setProperty('--dot-spacing', `${dotSpacing.toFixed(3)}px`);
    dotField.style.backgroundPosition = `calc(50% - ${dotOffset.toFixed(3)}px) center`;
    dotField.style.transform = `translate3d(-50%,-50%,0) scale(${dotScale.toFixed(4)})`;
    title.style.opacity = '1';
    scene.style.transform = `scale(${sceneScale})`;
    updateWorkTypeOffset(titleOuterShift);
    updateWorkTypeClip();
    updateWorkSpread(expansionProgress, typeSize, loopDistance, collapseProgress);
    updateWorkAperture();
  }

  function getWorkCardTravelProgress(progress) {
    const value = clamp(progress);
    const edge = workCardEdgeRatio;
    const middleEnd = edge + workCardMiddleRatio;
    const middleDistance = workCardMiddleRatio * workCardMiddleSpeed;
    const edgeDistance = (1 - middleDistance) / 2;
    if (value < edge) {
      const phase = value / edge;
      const phase3 = phase * phase * phase;
      const phase4 = phase3 * phase;
      const edgeSpeed = edgeDistance * 2 / edge - workCardMiddleSpeed;
      const speedBlendIntegral = phase3 - phase4 * .5;
      return edge * (edgeSpeed * phase + (workCardMiddleSpeed - edgeSpeed) * speedBlendIntegral);
    }
    if (value <= middleEnd) return edgeDistance + (value - edge) * workCardMiddleSpeed;
    return 1 - getWorkCardTravelProgress(1 - value);
  }

  function getWorkCardReveal(progress) {
    const enter = clamp(progress / workCardEdgeRatio);
    const exit = clamp((1 - progress) / workCardEdgeRatio);
    const smooth = value => value * value * (3 - 2 * value);
    return Math.min(smooth(enter), smooth(exit));
  }

  function updateWork() {
    const section = $('.work'); const rect = section.getBoundingClientRect();
    const entryProgress = clamp(1 - rect.top / Math.max(state.height, 1));
    const postDistance = Math.max(0, -rect.top - workAnchorBuffer);
    const expansionProgress = clamp(postDistance / Math.max(workTimelineState.expansion, 1));
    const mediaDistance = Math.max(0, postDistance - workTimelineState.expansion - workTimelineState.hold);
    const cardTailDistance = Math.max(0, mediaDistance - workTimelineState.media);
    const collapseDistance = Math.max(0, cardTailDistance - workTimelineState.cardTail);
    const collapseProgress = clamp(collapseDistance / Math.max(workTimelineState.collapse, 1));
    const visualExpansionProgress = expansionProgress * (1 - collapseProgress);
    const loopDistance = clamp(
      postDistance - workTimelineState.expansion,
      0,
      workTimelineState.hold + workTimelineState.media + workTimelineState.cardTail
    );
    const exitDistance = Math.max(0, postDistance - workTimelineState.total);
    const exitProgress = clamp(exitDistance / Math.max(state.height, 1));
    updateWorkIntro(entryProgress, visualExpansionProgress, postDistance, loopDistance, collapseProgress, exitProgress);
    const cardTravelDistance = Math.max(state.height * workCardTravelScreens, 1);
    const cardStaggerDistance = state.height * workCardStaggerScreens;
    const rowOffset = state.width <= 900 ? 14 : 21;
    const cardStates = [...document.querySelectorAll('.work-card')].map((card, index) => {
      const local = (mediaDistance - index * cardStaggerDistance) / cardTravelDistance;
      const visible = mediaDistance > 0 && local >= 0 && local < 1;
      const progress = clamp(local);
      const travel = getWorkCardTravelProgress(progress);
      const reveal = getWorkCardReveal(progress);
      const extent = 56 + card.offsetWidth / Math.max(state.width, 1) * 50;
      return {
        card,
        index,
        visible,
        reveal,
        extent,
        x: extent * (1 - travel * 2),
        y: index % 2 ? rowOffset : -rowOffset,
        scale: .9 + reveal * .1
      };
    });
    const visibleStates = cardStates.filter(cardState => cardState.visible);
    if (visibleStates.length === 2) {
      const [older, newer] = visibleStates;
      const minimumGap = Math.max(24, Math.max(older.card.offsetWidth, newer.card.offsetWidth) / Math.max(state.width, 1) * 60);
      const gap = newer.x - older.x;
      if (gap < minimumGap) {
        const correction = (minimumGap - gap) / 2;
        older.x -= correction;
        newer.x += correction;
      }
    }
    cardStates.forEach(({ card, index, visible, reveal, extent, x, y, scale }) => {
      const horizontalProgress = clamp(x / Math.max(extent, 1), -1, 1);
      const verticalProgress = clamp(y / Math.max(rowOffset, 1), -1, 1);
      const perspectiveStrength = horizontalProgress * horizontalProgress;
      const perspectiveRotateX = verticalProgress * perspectiveStrength * workCardPerspectiveDegrees;
      const perspectiveRotateY = -horizontalProgress * workCardPerspectiveDegrees;
      card.style.opacity = visible ? '1' : '0';
      card.style.zIndex = String(20 + Math.round(reveal * 50));
      card.style.transform = `translate3d(calc(-50% + ${x}vw),calc(-50% + ${y}vh),0) rotateY(${perspectiveRotateY}deg) rotateX(${perspectiveRotateX}deg) scale(${scale})`;
      card.setAttribute('aria-hidden', visible ? 'false' : 'true');
    });
  }

  function updateAboutBlock() {
    const section = $('.about');
    const block = $('.about-content-block');
    const upperStrip = $('.data-strip--bottom');
    const lowerStrip = $('.about-strip');
    const connectors = $('.about-connectors');
    if (!section || !block || !upperStrip || !lowerStrip) return;
    const gap = parseFloat(getComputedStyle(section).getPropertyValue('--about-block-gap')) || 64;
    const upperHeight = upperStrip.offsetHeight;
    const lowerHeight = lowerStrip.offsetHeight;
    const border = section.clientTop || 0;
    const sectionHeight = Math.max(
      block.offsetHeight + gap * 2 + lowerHeight + border,
      block.offsetHeight * 2 + gap * 4 + upperHeight + lowerHeight * 2 + border * 2 - state.height
    );
    if (Math.abs(section.offsetHeight - sectionHeight) > 0.5) section.style.height = `${sectionHeight}px`;
    if (reducedMotion) {
      block.style.transform = `translate3d(-50%,${gap}px,0)`;
      updateAboutConnectors(section, block, connectors);
      return;
    }
    const sectionRect = section.getBoundingClientRect();
    const upperRect = upperStrip.getBoundingClientRect();
    const lowerRect = lowerStrip.getBoundingClientRect();
    const lowerTop = lowerRect.top - sectionRect.top;
    const upperBottomDocument = state.scrollY + upperRect.bottom;
    const lowerTopDocument = state.scrollY + lowerRect.top;
    const middleDistance = Math.max(0, lowerTopDocument - upperBottomDocument);
    const startScroll = state.scrollY + upperRect.top;
    const endScroll = startScroll + middleDistance + upperRect.height + lowerRect.height - state.height;
    const range = Math.max(endScroll - startScroll, 1);
    const endOffset = Math.max(gap, lowerTop - block.offsetHeight - gap);
    // Keep the same 0.5x motion through the anchors, then continue the
    // slower drift so the frame can be collected by the lower strip.
    const rawProgress = (state.scrollY - startScroll) / range;
    const progress = clamp(rawProgress, -1, 1);
    const parallaxSpeed = .5;
    const afterAnchor = Math.max(0, state.scrollY - endScroll) * parallaxSpeed;
    const offset = gap + (endOffset - gap) * progress + afterAnchor;
    block.style.transform = `translate3d(-50%,${offset}px,0)`;
    updateAboutConnectors(section, block, connectors);
  }

  function updateAboutConnectors(section, block, connectors) {
    if (!connectors) return;
    const sectionRect = section.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    const left = blockRect.left - sectionRect.left;
    const right = blockRect.right - sectionRect.left;
    const top = blockRect.top - sectionRect.top;
    const bottom = blockRect.bottom - sectionRect.top;
    const width = section.clientWidth;
    const lowerStrip = $('.about-strip', section);
    const lowerRect = lowerStrip ? lowerStrip.getBoundingClientRect() : sectionRect;
    const lowerLeft = lowerRect.left - sectionRect.left;
    const lowerRight = lowerRect.right - sectionRect.left;
    const lowerTop = lowerRect.top - sectionRect.top;
    $('.about-outer', connectors).setAttribute('d', `M0 0H${width}V${lowerTop}H0Z`);
    const grid = [];
    // Keep the top and bottom perspective fans intentionally sparse: five
    // converging lines per edge (including both outer boundaries).
    const columns = 4;
    const rows = 10;
    for (let index = 0; index <= columns; index += 1) {
      const ratio = index / columns;
      const outerX = ratio * width;
      const innerX = left + ratio * (right - left);
      grid.push(`M${outerX} 0L${innerX} ${top}`);
      grid.push(`M${outerX} ${lowerTop}L${innerX} ${bottom}`);
    }
    for (let index = 1; index < rows; index += 1) {
      const ratio = index / rows;
      const outerY = ratio * lowerTop;
      const innerY = top + ratio * (bottom - top);
      grid.push(`M0 ${outerY}L${left} ${innerY}`);
      grid.push(`M${width} ${outerY}L${right} ${innerY}`);
    }
    const crossRows = 4;
    for (let index = 1; index < crossRows; index += 1) {
      const ratio = index / crossRows;
      const topY = ratio * top;
      const topLeft = ratio * left;
      const topRight = width - ratio * (width - right);
      grid.push(`M${topLeft} ${topY}L${topRight} ${topY}`);
      const bottomY = lowerTop + ratio * (bottom - lowerTop);
      const bottomLeft = ratio * left;
      const bottomRight = width - ratio * (width - right);
      grid.push(`M${bottomLeft} ${bottomY}L${bottomRight} ${bottomY}`);
    }
    const sideRows = 4;
    for (let index = 1; index < sideRows; index += 1) {
      const ratio = index / sideRows;
      const sideYTop = ratio * top;
      const sideYBottom = lowerTop + ratio * (bottom - lowerTop);
      const leftX = ratio * left;
      const rightX = width - ratio * (width - right);
      grid.push(`M${leftX} ${sideYTop}L${leftX} ${sideYBottom}`);
      grid.push(`M${rightX} ${sideYTop}L${rightX} ${sideYBottom}`);
    }
    $('.about-grid', connectors).setAttribute('d', grid.join(''));
    $('.about-link--tl', connectors).setAttribute('d', `M0 0L${left} ${top}`);
    $('.about-link--tr', connectors).setAttribute('d', `M${width} 0L${right} ${top}`);
    $('.about-link--bl', connectors).setAttribute('d', `M${lowerLeft} ${lowerTop}L${left} ${bottom}`);
    $('.about-link--br', connectors).setAttribute('d', `M${lowerRight} ${lowerTop}L${right} ${bottom}`);
  }

  function applyPaperTheme(index) {
    paperThemeIndex = ((index % paperPalette.length) + paperPalette.length) % paperPalette.length;
    const color = paperPalette[paperThemeIndex];
    document.body.style.setProperty('--paper', color);
    document.body.dataset.paperTheme = String(paperThemeIndex);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = color;
  }

  function updateScroll() {
    state.scrollY = scrollY; updateAboutBlock(); updateWork(); state.ticking = false;
  }

  function bind() {
    addEventListener('pointermove', event => { state.pointerX = event.clientX / innerWidth; state.pointerY = event.clientY / innerHeight; }, { passive: true });
    addEventListener('scroll', () => { if (!state.ticking) { state.ticking = true; requestAnimationFrame(updateScroll); } }, { passive: true });
    let resizeFrame = 0;
    const scheduleResize = () => {
      if (resizeFrame) return;
      resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; resize(); });
    };
    addEventListener('resize', scheduleResize, { passive: true });
    window.visualViewport?.addEventListener('resize', scheduleResize, { passive: true });
    if (window.ResizeObserver) {
      const shellObserver = new ResizeObserver(scheduleResize);
      shellObserver.observe($('.site-shell'));
    }
    if (document.fonts?.ready) document.fonts.ready.then(resize);
    const contrast = $('.contrast');
    applyPaperTheme(0);
    contrast.addEventListener('click', () => applyPaperTheme(paperThemeIndex + 1));
  }

  buildData(); buildWork(); buildMemories(); bind(); resize(); initHeroLetterMotion();
})();
