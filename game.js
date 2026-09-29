'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};

window.addEventListener('keydown', e => {
  justPressed[e.code] = !keys[e.code];
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
    e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap  = (v, max) => ((v % max) + max) % max;
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Fondo dinámico (espacio estrellado) ───────────────────────────────────────
// Fondo realista: nebulosa muy lejana +3 capas de estrellas en paralaje.
// Las estrellas derivan despacio y reaccionan a la velocidad de la nave, así el
// fondo nunca está quieto y da sensación de desplazarse por el espacio.

const SPECTRA = [
  ['#a9c1ff', 0.10],  // azul (tipo O/B)
  ['#cfd9ff', 0.16],  // azul-blanco (tipo A)
  ['#ffffff', 0.30],  // blanco (tipo F)
  ['#fff2d4', 0.22],  // amarillo (tipo G)
  ['#ffd9a8', 0.16],  // naranja (tipo K)
  ['#ff9d76', 0.06],  // rojo (tipo M)
];

// Colores según distribución espectral real (predominan las blanco-amarillas)
function pickSpectrum() {
  let r = Math.random();
  for (const [color, w] of SPECTRA) {
    r -= w;
    if (r <= 0) return color;
  }
  return '#ffffff';
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// Halo de la estrella pre-renderizado por color: pintarlo con drawImage es
// mucho más barato que crear un degradado radial en cada frame.
function makeGlowSprite(color) {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0,    hexToRgba(color, 0.85));
  grad.addColorStop(0.14, hexToRgba(color, 0.32));
  grad.addColorStop(0.38, hexToRgba(color, 0.09));
  grad.addColorStop(1,    hexToRgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return c;
}

// Capas: depth gobierna deriva y paralaje (las de atrás se mueven menos)
const STAR_LAYERS = [
  { depth: 0.30, count: 115, rMin: 0.35, rMax: 0.85, aMin: 0.22, aMax: 0.55, twinkle: 0.10 },
  { depth: 0.60, count: 70,  rMin: 0.60, rMax: 1.30, aMin: 0.45, aMax: 0.85, twinkle: 0.18 },
  { depth: 1.00, count: 34,  rMin: 1.00, rMax: 1.90, aMin: 0.70, aMax: 1.00, twinkle: 0.26 },
];

class Starfield {
  constructor() {
    this.t  = 0;
    this.nx = 0;   // desplazamiento de la nebulosa
    this.ny = 0;
    this.drift = { x: -12, y: -5 };   // deriva base del campo (px/s a depth 1)

    this.sprites = {};
    for (const [color] of SPECTRA) this.sprites[color] = makeGlowSprite(color);

    this.stars = [];
    for (const layer of STAR_LAYERS) {
      for (let i = 0; i < layer.count; i++) {
        const star = {
          x: rand(0, W),
          y: rand(0, H),
          depth: layer.depth,
          r: rand(layer.rMin, layer.rMax),
          alpha: rand(layer.aMin, layer.aMax),
          color: pickSpectrum(),
          // Titileo: velocidad y amplitud independientes por estrella
          twSpeed: rand(0.5, 1.8),
          twAmp: layer.twinkle * rand(0.5, 1.4),
          phase: rand(0, Math.PI * 2),
        };
        // Las más brillantes lucen destellos en cruz (como en fotos reales)
        star.spike = star.r >= 1.35 && Math.random() < 0.6;
        this.stars.push(star);
      }
    }

    // Fondo: negro azulado con viñeta, más realista que negro puro
    const bg = ctx.createRadialGradient(W * 0.5, H * 0.38, 60, W * 0.5, H * 0.38, H);
    bg.addColorStop(0,    '#070c1a');
    bg.addColorStop(0.55, '#03050f');
    bg.addColorStop(1,    '#000105');
    this.bg = bg;

    this.nebula = this.renderNebula();
  }

  // Nubes de gas muy tenues, pre-renderizadas y con costuras invisibles:
  // cada mancha se pinta también en las posiciones ±W/±H para que al envolver
  // el desplazamiento no se note el corte.
  renderNebula() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');

    const patch = (x, y, r, rgb, max) => {
      for (const dx of [-W, 0, W]) {
        for (const dy of [-H, 0, H]) {
          const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          grad.addColorStop(0,    `rgba(${rgb}, ${max})`);
          grad.addColorStop(0.45, `rgba(${rgb}, ${max * 0.38})`);
          grad.addColorStop(1,    `rgba(${rgb}, 0)`);
          g.fillStyle = grad;
          g.fillRect(0, 0, W, H);
        }
      }
    };

    patch(W * 0.22, H * 0.28, 330, '56, 44, 120', 0.22);   // índigo
    patch(W * 0.76, H * 0.74, 300, '20, 76, 100', 0.17);   // cian profundo
    patch(W * 0.58, H * 0.16, 250, '108, 44, 86', 0.13);   // magenta tenue
    patch(W * 0.10, H * 0.88, 270, '38, 52, 116', 0.15);   // azul de fondo
    return c;
  }

  update(dt) {
    this.t += dt;

    // La nave "arrastra" la mirada: al acelerar, las estrellas se retrasan
    // (paralaje). Capas lejanas se mueven menos que las cercanas.
    // Si la nave está muerta no hay paralaje: la velocidad quedó congelada.
    const pvx = ship.dead ? 0 : -ship.vx * 0.07;
    const pvy = ship.dead ? 0 : -ship.vy * 0.07;

    for (const s of this.stars) {
      s.x = wrap(s.x + (this.drift.x * s.depth + pvx * s.depth) * dt, W);
      s.y = wrap(s.y + (this.drift.y * s.depth + pvy * s.depth) * dt, H);
    }

    // La nebulosa está mucho más lejos: apenas se mueve
    this.nx = wrap(this.nx + (this.drift.x * 0.15 + pvx * 0.15) * dt, W);
    this.ny = wrap(this.ny + (this.drift.y * 0.15 + pvy * 0.15) * dt, H);
  }

  drawStar(s, dx, dy) {
    const x = s.x + dx;
    const y = s.y + dy;

    // Titileo (scintilación): nunca apaga del todo la estrella
    const k = 1 - s.twAmp * (0.5 + 0.5 * Math.sin(this.t * s.twSpeed + s.phase));
    const r = s.r * (0.92 + 0.08 * k);

    // Halo
    const size = s.r * 9;
    ctx.globalAlpha = Math.min(1, s.alpha * k * 0.9);
    ctx.drawImage(this.sprites[s.color], x - size / 2, y - size / 2, size, size);

    // Núcleo
    ctx.globalAlpha = Math.min(1, s.alpha * k);
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Destellos en cruz de las estrellas más brillantes
    if (s.spike) {
      const L = s.r * 6;
      ctx.globalAlpha = s.alpha * k * 0.4;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x - L, y);
      ctx.lineTo(x + L, y);
      ctx.moveTo(x, y - L);
      ctx.lineTo(x, y + L);
      ctx.stroke();
    }
  }

  draw() {
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, W, H);

    // Nebulosa envolvente (4 copias para cubrir los bordes al desplazarse)
    ctx.drawImage(this.nebula, -this.nx,        -this.ny);
    ctx.drawImage(this.nebula,  W - this.nx,    -this.ny);
    ctx.drawImage(this.nebula, -this.nx,        H - this.ny);
    ctx.drawImage(this.nebula,  W - this.nx,    H - this.ny);

    // Estrellas cerca de un borde se pintan también en el opuesto, para que
    // el halo y los destellos no se corten al envolver
    const PAD = 24;
    for (const s of this.stars) {
      const xs = [0];
      const ys = [0];
      if (s.x < PAD) xs.push(W); else if (s.x > W - PAD) xs.push(-W);
      if (s.y < PAD) ys.push(H); else if (s.y > H - PAD) ys.push(-H);
      for (const dx of xs)
        for (const dy of ys)
          this.drawStar(s, dx, dy);
    }
    ctx.globalAlpha = 1;
  }
}

const starfield = new Starfield();

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 1.1;
    this.radius = 2;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII  = [0, 16, 30, 50];   // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32];   // velocidad base por tamaño
const POINTS = [0, 100, 50, 20];  // puntos por tamaño

// Paletas rocosas tipo planeta (luz, medio, sombra)
const ASTEROID_PALETTES = [
  ['#a89684', '#6b5a49', '#332920'], // marrón rocoso
  ['#9a9aa0', '#61616a', '#2c2c32'], // gris ceniza / luna
  ['#af8a63', '#7a5636', '#3c2618'], // óxido / marte
];

class Asteroid {
  constructor(x, y, size = 3) {
    this.x    = x;
    this.y    = y;
    this.size = size;
    this.radius = RADII[size];
    this.dead = false;

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    // Silueta rocosa (más redondeada que antes para leer bien el relieve)
    const n = randInt(10, 15);
    this.verts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.radius * rand(0.82, 1.0);
      this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }

    this.palette = ASTEROID_PALETTES[randInt(0, ASTEROID_PALETTES.length - 1)];

    // Cráteres: posición, radio dentro del disco
    const craterCount = size === 3 ? randInt(4, 6) : size === 2 ? randInt(2, 4) : randInt(1, 2);
    this.craters = [];
    for (let i = 0; i < craterCount; i++) {
      const ca = rand(0, Math.PI * 2);
      const cd = rand(0, this.radius * 0.55);
      this.craters.push({
        x: Math.cos(ca) * cd,
        y: Math.sin(ca) * cd,
        r: this.radius * rand(0.14, 0.32),
      });
    }
  }

  update(dt) {
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
  }

  split() {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);

    const [light, mid, dark] = this.palette;

    // Rotamos los puntos a mano (no ctx.rotate) para que la iluminación
    // quede fija en pantalla y el relieve se lea como una esfera real.
    const cos = Math.cos(this.rot), sin = Math.sin(this.rot);
    const pts = this.verts.map(([vx, vy]) => [vx * cos - vy * sin, vx * sin + vy * cos]);

    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();

    // Sombreado esférico: luz arriba-izquierda, oscurece hacia el borde
    const lightOffset = -this.radius * 0.35;
    const grad = ctx.createRadialGradient(
      lightOffset, lightOffset, this.radius * 0.1,
      0, 0, this.radius * 1.05
    );
    grad.addColorStop(0, light);
    grad.addColorStop(0.55, mid);
    grad.addColorStop(1, dark);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineJoin = 'round';
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Recorta para que los cráteres no se salgan de la silueta
    ctx.clip();

    for (const c of this.craters) {
      const cx = c.x * cos - c.y * sin;
      const cy = c.x * sin + c.y * cos;
      const cr = c.r;

      const craterGrad = ctx.createRadialGradient(
        cx - cr * 0.25, cy - cr * 0.25, cr * 0.1,
        cx, cy, cr
      );
      craterGrad.addColorStop(0, dark);
      craterGrad.addColorStop(1, mid);
      ctx.fillStyle = craterGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();

      // Borde iluminado del cráter (rim light), lado opuesto a la sombra
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = light;
      ctx.lineWidth = Math.max(1, cr * 0.18);
      ctx.beginPath();
      ctx.arc(cx + cr * 0.15, cy + cr * 0.15, cr * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }
}

// ── Estrella fugaz ────────────────────────────────────────────────────────────
const STAR_POINTS = 250;  // puntos bonus al destruirla

class ShootingStar {
  constructor() {
    this.radius = 10;
    this.dead   = false;

    // Aparece desde un borde aleatorio, cruzando el mapa en línea recta
    const SPEED = rand(260, 320);
    const side  = randInt(0, 3);
    if (side === 0)      { this.x = 0;   this.y = rand(0, H); }
    else if (side === 1) { this.x = W;   this.y = rand(0, H); }
    else if (side === 2) { this.x = rand(0, W); this.y = 0; }
    else                 { this.x = rand(0, W); this.y = H; }

    const angle = Math.atan2(H / 2 - this.y, W / 2 - this.x) + rand(-0.5, 0.5);
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;

    this.life  = rand(4, 6);   // duración total en segundos
    this.ttl   = this.life;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    // Fade progresivo durante el último 25% de su vida útil
    const fadeStart = this.life * 0.25;
    const alpha = this.ttl < fadeStart ? Math.max(0, this.ttl / fadeStart) : 1;

    ctx.strokeStyle = `rgba(255, 233, 168, ${alpha.toFixed(2)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.06, this.y - this.vy * 0.06);
    ctx.stroke();

    ctx.fillStyle = `rgba(255, 245, 220, ${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  constructor() { this.reset(); }

  reset() {
    this.x      = W / 2;
    this.y      = H / 2;
    this.angle  = -Math.PI / 2;
    this.vx     = 0;
    this.vy     = 0;
    this.radius = 12;
    this.thrusting     = false;
    this.invincible    = 3;
    this.shootCooldown = 0;
    this.velocityTime  = 0;   // segundos restantes de Velocity (doble empuje)
    this.dead          = false;
  }

  // Activa Velocity: 5 s de empuje x2. Reinicia el contador si ya estaba activo.
  activateVelocity() {
    this.velocityTime = 5;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible    > 0) this.invincible    -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.velocityTime  > 0) this.velocityTime   = Math.max(0, this.velocityTime - dt);

    const ROT   = 3.5;   // rad/s
    const THRUST = 260 * (this.velocityTime > 0 ? 2 : 1);  // px/s² (x2 con Velocity)
    const DRAG   = 0.987;

    if (keys['ArrowLeft'])  this.angle -= ROT * dt;
    if (keys['ArrowRight']) this.angle += ROT * dt;

    this.thrusting = !!keys['ArrowUp'];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * dt;
      this.vy += Math.sin(this.angle) * THRUST * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    return [new Bullet(ox, oy, this.angle)];
  }

  draw() {
    if (this.dead) return;
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    // Velocity activo: la nave se pinta en cian
    const boosting = this.velocityTime > 0;
    ctx.strokeStyle = boosting ? '#4dd8ff' : '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';

    // Silueta clásica: triángulo con muesca trasera
    ctx.beginPath();
    ctx.moveTo( 20,  0);   // nariz
    ctx.lineTo(-12, -9);   // ala izquierda
    ctx.lineTo( -7,  0);   // muesca trasera
    ctx.lineTo(-12,  9);   // ala derecha
    ctx.closePath();
    ctx.stroke();

    // Llama del propulsor
    if (this.thrusting && Math.random() > 0.35) {
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - rand(6, 14), 0);
      ctx.lineTo(-8,  4);
      ctx.strokeStyle = boosting ? 'rgba(80, 220, 255, 0.9)' : 'rgba(255, 130, 0, 0.85)';
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y) {
    this.x  = x;
    this.y  = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx   = Math.cos(angle) * speed;
    this.vy   = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl  = this.life;
    this.dead = false;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles, shootingStars;
let score, lives, level;
let state;      // 'playing' | 'dead' | 'gameover'
let deadTimer;
let nextStarTimer;

function spawnAsteroids(count) {
  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    asteroids.push(new Asteroid(x, y, 3));
  }
}

function initGame() {
  ship          = new Ship();
  bullets   = [];
  asteroids = [];
  particles = [];
  shootingStars = [];
  score  = 0;
  lives  = 3;
  level  = 1;
  state  = 'playing';
  nextStarTimer = rand(8, 15);
  spawnAsteroids(4);
}

function nextLevel() {
  level++;
  bullets   = [];
  particles = [];
  ship.reset();
  spawnAsteroids(3 + level);
}

function explode(x, y, count = 8) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
}

function killShip() {
  explode(ship.x, ship.y, 14);
  ship.dead = true;
  lives--;
  if (lives <= 0) {
    state = 'gameover';
  } else {
    state     = 'dead';
    deadTimer = 2;
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  // El fondo se mueve siempre, también al morir o en el game over
  starfield.update(dt);

  if (state === 'gameover') {
    if (pressed('Space')) initGame();
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    return;
  }

  if (state === 'dead') {
    deadTimer -= dt;
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    asteroids.forEach(a => a.update(dt));
    shootingStars.forEach(s => s.update(dt));
    shootingStars = shootingStars.filter(s => !s.dead);
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  // Velocity: doble empuje durante 5 s
  if (pressed('ShiftLeft') || pressed('ShiftRight')) ship.activateVelocity();

  // Disparar
  if (pressed('Space')) {
    bullets.push(...ship.tryShoot());
  }

  // Aparición periódica de estrellas fugaces
  nextStarTimer -= dt;
  if (nextStarTimer <= 0) {
    shootingStars.push(new ShootingStar());
    nextStarTimer = rand(8, 15);
  }

  ship.update(dt);
  bullets.forEach(b => b.update(dt));
  asteroids.forEach(a => a.update(dt));
  particles.forEach(p => p.update(dt));
  shootingStars.forEach(s => s.update(dt));

  bullets   = bullets.filter(b => !b.dead);
  particles = particles.filter(p => !p.dead);
  shootingStars = shootingStars.filter(s => !s.dead);

  // Bala vs asteroide
  const newAsteroids = [];
  for (const b of bullets) {
    for (const a of asteroids) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        a.dead = true;
        score += POINTS[a.size];
        explode(a.x, a.y, a.size * 5);
        newAsteroids.push(...a.split());
      }
    }
  }
  asteroids = asteroids.filter(a => !a.dead).concat(newAsteroids);
  bullets   = bullets.filter(b => !b.dead);

  // Bala vs estrella fugaz
  for (const b of bullets) {
    for (const s of shootingStars) {
      if (!s.dead && !b.dead && dist(b, s) < s.radius) {
        b.dead = true;
        s.dead = true;
        score += STAR_POINTS;
        explode(s.x, s.y, 10);
      }
    }
  }
  shootingStars = shootingStars.filter(s => !s.dead);
  bullets       = bullets.filter(b => !b.dead);

  // Nave vs asteroide
  if (ship.invincible <= 0) {
    for (const a of asteroids) {
      if (dist(ship, a) < ship.radius + a.radius * 0.82) {
        killShip();
        break;
      }
    }
  }

  // Nave vs estrella fugaz
  if (ship.invincible <= 0 && !ship.dead) {
    for (const s of shootingStars) {
      if (dist(ship, s) < ship.radius + s.radius * 0.82) {
        killShip();
        break;
      }
    }
  }

  // Nivel completado
  if (asteroids.length === 0) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawLifeIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 1.2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo( 9,  0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3,  0);
  ctx.lineTo(-6,  5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  // Contador de Velocity
  if (state === 'playing' && ship.velocityTime > 0) {
    ctx.fillStyle = '#4dd8ff';
    ctx.fillText(`VELOCITY ${ship.velocityTime.toFixed(1)}`, W / 2, 46);
    ctx.fillStyle = '#fff';
  }

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 16 - i * 22, 18);

}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = 'rgba(255,255,255,0.65)';
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function draw() {
  starfield.draw();

  particles.forEach(p => p.draw());
  asteroids.forEach(a => a.draw());
  shootingStars.forEach(s => s.draw());
  bullets.forEach(b => b.draw());
  ship.draw();

  drawHUD();

  if (state === 'gameover')
    drawOverlay('GAME OVER', `PUNTAJE: ${score}   —   ESPACIO PARA REINICIAR`);
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

initGame();
requestAnimationFrame(loop);
