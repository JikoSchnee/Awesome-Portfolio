(() => {
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { width: innerWidth, height: innerHeight, pointerX: .5, pointerY: .5, scrollY: 0, ticking: false };
  const webgl = { renderer: null, scene: null, camera: null, meshes: [] };
  const paperPalette = ['#e1cab8', '#f40c3f', '#fff2ed'];
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
    ['Duten-Shapes.DvaTdo7l.mp4', 'https://duten.com/'],
    ['Vanguart-Scroll-3.BwmkFszE.mp4', 'https://vanguart.com/'],
    ['Generous-Scroll1.0UenKQ_7.mp4', 'https://generousbranding.com/'],
    ['Nod-Transition.Cgjsr7Jp.mp4', 'https://nodcoding.com/'],
    ['Pantoufle-Clip.BfFhcegb.mp4', 'https://www.pantoufle-hotels.fr/en/'],
    ['Vanguart-Scroll-2.DRw1ZqR4.mp4', 'https://vanguart.com/'],
    ['247-Scroll-1.BpbKKJ7S.mp4', 'https://247artists.com/'],
    ['Rudl-Scroll.DmL08CDl.mp4', 'https://www.rudlundschwarm.at/'],
    ['Vanguart-Scroll-1.kd442gP8.mp4', 'https://vanguart.com/'],
    ['Pen-4.BOCLYASq.mp4', 'https://codepen.io/wodniack'],
    ['Duten-3D.CnijAj5p.mp4', 'https://duten.com/'],
    ['247-Hero.DKz-ABVC.mp4', 'https://247artists.com/'],
    ['Duten-Fluid.t8C3AKXP.mp4', 'https://duten.com/'],
    ['Vanguart-360.DXA8KizZ.mp4', 'https://vanguart.com/'],
    ['247-Scroll-2.eL-R-Y1L.mp4', 'https://247artists.com/'],
    ['Qbit-Shape.BySbOvpY.mp4', 'https://qbitcapital.xyz/'],
    ['Tissot-360.qz0Gq5Ys.mp4', '#'],
    ['Duten-Products.D0b17Eb7.mp4', 'https://duten.com/'],
    ['Pantoufle-Transition.CpZVk1ej.mp4', 'https://www.pantoufle-hotels.fr/en/'],
    ['Pantoufle-Button.B5UTdu2U.mp4', 'https://www.pantoufle-hotels.fr/en/'],
    ['Deside-Site.CmhdHL0t.mp4', 'https://www.desiderecrutement.com/en/'],
    ['Qbit-Menu.DQBETGn4.mp4', 'https://qbitcapital.xyz/'],
    ['Nod-Links.De8GBDpL.mp4', 'https://nodcoding.com/'],
    ['HS-Site.Br4spn2E.mp4', 'https://honorsociety.tv/'],
    ['Nod-Flower.VBa6NQlZ.mp4', 'https://nodcoding.com/'],
    ['Duten-Intro.CP3CW1O6.mp4', 'https://duten.com/'],
    ['Pen-6.CMyHVvwm.mp4', 'https://codepen.io/wodniack']
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

    const wall = $('.work-wall');
    'WORK'.repeat(11).split('').forEach(letter => {
      const span = document.createElement('span'); span.textContent = letter; wall.append(span);
    });

  }

  function buildWork() {
    const host = $('#work-media');
    workItems.forEach(([file, href], index) => {
      const card = document.createElement('a');
      card.className = 'work-card'; card.href = href; card.target = href === '#' ? '_self' : '_blank'; card.rel = 'noreferrer';
      card.dataset.index = index; card.setAttribute('aria-hidden', 'true');
      card.innerHTML = `<video data-src="./assets/wodniack/videos/${file}" width="1082" height="636" muted loop playsinline preload="none"></video><footer><span>${file.split('.')[0]}</span><span>${String(index + 1).padStart(2, '0')}—${String(9321 + index * 137).slice(-6)}</span></footer>`;
      host.append(card);
    });
  }

  function initWorkWebGL() {
    if (!window.THREE) return;
    try {
      webgl.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
      webgl.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      webgl.renderer.domElement.className = 'work-webgl';
      $('.work-stage').insertBefore(webgl.renderer.domElement, $('.work-media'));
      webgl.scene = new THREE.Scene();
      webgl.camera = new THREE.OrthographicCamera(-state.width / 2, state.width / 2, state.height / 2, -state.height / 2, .1, 1000);
      webgl.camera.position.z = 100;
      document.querySelectorAll('.work-card').forEach(card => {
        const material = new THREE.MeshBasicMaterial({ color: 0x241d24, transparent: true });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
        mesh.visible = false; mesh.renderOrder = Number(card.dataset.index);
        webgl.scene.add(mesh); webgl.meshes.push(mesh); card._mesh = mesh;
      });
      document.body.classList.add('has-webgl');
    } catch (error) {
      webgl.renderer = null;
    }
  }

  function buildMemories() {
    const host = $('#memory-field');
    memories.forEach(([file, caption], index) => {
      const item = document.createElement('figure'); item.className = 'memory'; item.dataset.index = index;
      item.innerHTML = `<img src="./assets/wodniack/images/${file}" alt="${caption.replaceAll('"', '&quot;')}" loading="lazy" decoding="async"><figcaption>${caption}</figcaption>`;
      host.append(item);
    });
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
    if (webgl.renderer) {
      webgl.renderer.setSize(state.width, state.height, false);
      Object.assign(webgl.camera, { left: -state.width / 2, right: state.width / 2, top: state.height / 2, bottom: -state.height / 2 });
      webgl.camera.updateProjectionMatrix();
    }
    const contact = $('.contact');
    $('.contact-grid').setAttribute('viewBox', `0 0 ${contact.clientWidth} ${contact.clientHeight}`);
    $('.contact-grid path').setAttribute('d', gridPath(contact.clientWidth, contact.clientHeight, .28));
    updateScroll();
  }

  function ensureVideo(card) {
    const video = $('video', card);
    if (!video.src) { video.src = video.dataset.src; video.load(); }
    if (card._mesh && !card._mesh.userData.videoTexture) {
      const texture = new THREE.VideoTexture(video);
      texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
      card._mesh.material.map = texture; card._mesh.material.color.set(0xffffff); card._mesh.material.needsUpdate = true;
      card._mesh.userData.videoTexture = texture;
    }
    if (reducedMotion) { video.pause(); return; }
    const promise = video.play(); if (promise) promise.catch(() => {});
  }

  function updateWork() {
    const section = $('.work'); const rect = section.getBoundingClientRect();
    const total = section.offsetHeight - state.height; const progress = clamp(-rect.top / Math.max(total, 1));
    const intro = clamp(1 - progress / .065); $('.work-stage').style.setProperty('--intro', intro.toFixed(3));
    $('.work-title').style.opacity = clamp(1 - progress / .08).toFixed(3);
    $('.work-wall').style.transform = `translate3d(${Math.sin(progress * Math.PI * 4) * -4}vw,${progress * -7}vh,0) scale(${1 + progress * .13})`;
    document.querySelectorAll('.work-card').forEach((card, index) => {
      const center = .075 + index * (.86 / (workItems.length - 1));
      const local = (progress - center) / .045; const visible = Math.abs(local) < 2.05;
      if (visible) ensureVideo(card);
      const direction = index % 2 ? 1 : -1;
      const seedX = seeded(index + 10) * 62 - 31; const seedY = seeded(index + 70) * 48 - 24;
      const x = seedX + local * direction * (28 + seeded(index + 90) * 19);
      const y = seedY + Math.sin(local * 1.6 + index) * 8;
      const scale = .54 + clamp(1 - Math.abs(local) / 2.05) * (.34 + seeded(index + 120) * .25);
      const rotate = (seeded(index + 150) * 10 - 5) + local * direction * 2.2;
      card.style.opacity = visible ? clamp(1.25 - Math.abs(local) / 1.65).toFixed(3) : '0';
      card.style.zIndex = String(20 + Math.round((1 - Math.abs(local) / 2) * 50));
      card.style.transform = `translate3d(calc(-50% + ${x}vw),calc(-50% + ${y}vh),0) rotate(${rotate}deg) scale(${scale})`;
      card.setAttribute('aria-hidden', visible ? 'false' : 'true');
      if (card._mesh) {
        const width = card.offsetWidth - 12, height = width * 636 / 1082;
        card._mesh.visible = visible; card._mesh.position.set(x * state.width / 100, -y * state.height / 100 + 12 * scale, index / 100);
        card._mesh.rotation.z = -rotate * Math.PI / 180; card._mesh.scale.set(width * scale, height * scale, 1);
        card._mesh.material.opacity = visible ? Number(card.style.opacity) : 0;
      }
    });
    if (webgl.renderer && reducedMotion) webgl.renderer.render(webgl.scene, webgl.camera);
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

  function updateMemories() {
    const section = $('.my-way'); const rect = section.getBoundingClientRect();
    const progress = clamp((state.height - rect.top) / (state.height + section.offsetHeight));
    document.querySelectorAll('.memory').forEach((item, index) => {
      const angle = index / memories.length * Math.PI * 2 + seeded(index + 200) * .8;
      const radius = (1 - progress) * Math.max(state.width, state.height) * .78 + 80 + seeded(index + 230) * 220;
      const x = Math.cos(angle) * radius + (seeded(index + 260) - .5) * state.width * .2;
      const y = Math.sin(angle) * radius * .58 + (seeded(index + 290) - .5) * state.height * .18;
      const z = -380 + progress * 590 + seeded(index + 320) * 180;
      const rotate = (seeded(index + 350) * 40 - 20) + progress * (index % 2 ? 18 : -18);
      item.style.opacity = clamp(progress * 2.2 - seeded(index + 380) * .5).toFixed(3);
      item.style.transform = `translate3d(calc(-50% + ${x}px),calc(-50% + ${y}px),${z}px) rotate(${rotate}deg)`;
    });
    $('.my-way-smiley').style.transform = `translate(-50%,-50%) rotate(${progress * 280}deg) scale(${.7 + progress * .6})`;
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
    state.scrollY = scrollY; updateAboutBlock(); updateWork(); updateMemories(); state.ticking = false;
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
    const contrast = $('.contrast');
    applyPaperTheme(0);
    contrast.addEventListener('click', () => applyPaperTheme(paperThemeIndex + 1));
  }

  buildData(); buildWork(); initWorkWebGL(); buildMemories(); bind(); resize(); initHeroLetterMotion();
})();
