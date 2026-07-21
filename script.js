const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const playArea = document.getElementById('playArea');
let W, H;

function resize() {
  const rect = playArea.getBoundingClientRect();
  W = canvas.width = rect.width;
  H = canvas.height = rect.height;
}
window.addEventListener('resize', resize);
resize();

// ---------- Physics core (Verlet integration) ----------
const GROUND_Y = () => H - 40;
const CEIL_Y = () => 12;
let gravity = 0.6;
let gravityDir = 1;
let windForce = 0;
const FRICTION = 0.99;
const GROUND_FRICTION = 0.85;
const CONSTRAINT_ITERATIONS = 5;

class Point {
  constructor(x, y, pinned = false) {
    this.x = x; this.y = y;
    this.oldx = x; this.oldy = y;
    this.pinned = pinned;
    this.radius = 12;
    this.flash = 0;
  }
  update() {
    if (this.pinned) return;
    let vx = (this.x - this.oldx) * FRICTION;
    let vy = (this.y - this.oldy) * FRICTION;
    this.oldx = this.x;
    this.oldy = this.y;
    this.x += vx + windForce;
    this.y += vy + gravity * gravityDir;
    if (this.flash > 0) this.flash -= 1;
  }
  constrainToBounds() {
    const groundY = GROUND_Y();
    const ceilY = CEIL_Y();
    if (this.y > groundY - this.radius) {
      let vx = (this.x - this.oldx) * GROUND_FRICTION;
      this.y = groundY - this.radius;
      this.oldy = this.y + Math.abs(this.y - this.oldy) * 0.35;
      this.oldx = this.x - vx;
    }
    if (this.y < ceilY + this.radius) {
      this.y = ceilY + this.radius;
      this.oldy = this.y;
    }
    if (this.x < this.radius) { this.x = this.radius; this.oldx = this.x; }
    if (this.x > W - this.radius) { this.x = W - this.radius; this.oldx = this.x; }
  }
  applyImpulse(ix, iy) {
    if (this.pinned) return;
    this.oldx -= ix;
    this.oldy -= iy;
    this.flash = 10;
  }
}

class Stick {
  constructor(p1, p2, stiffness = 1, part = null) {
    this.p1 = p1; this.p2 = p2;
    this.length = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    this.stiffness = stiffness;
    this.part = part;
  }
  update() {
    const dx = this.p2.x - this.p1.x;
    const dy = this.p2.y - this.p1.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const diff = (this.length - dist) / dist * this.stiffness;
    const offx = dx * diff * 0.5;
    const offy = dy * diff * 0.5;
    if (!this.p1.pinned) { this.p1.x -= offx; this.p1.y -= offy; }
    if (!this.p2.pinned) { this.p2.x += offx; this.p2.y += offy; }
  }
}

// ---------- Ragdoll construction ----------
const colors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a29bfe', '#fd79a8', '#55efc4', '#fab1a0'];

class Ragdoll {
  constructor(x, y) {
    this.color = colors[Math.floor(Math.random() * colors.length)];
    const s = 42;

    this.head      = new Point(x, y);
    this.neck      = new Point(x, y + s);
    // বডি চিকন করার জন্য কাঁধ ও কোমর সংকুচিত করা হয়েছে
    this.shoulderL = new Point(x - s * 0.55, y + s + 4);
    this.shoulderR = new Point(x + s * 0.55, y + s + 4);
    this.elbowL    = new Point(x - s * 1.3, y + s * 2.2);
    this.elbowR    = new Point(x + s * 1.3, y + s * 2.2);
    this.handL     = new Point(x - s * 1.5, y + s * 3.4);
    this.handR     = new Point(x + s * 1.5, y + s * 3.4);
    this.hip       = new Point(x, y + s * 3);
    this.hipL      = new Point(x - s * 0.4, y + s * 3);
    this.hipR      = new Point(x + s * 0.4, y + s * 3);
    this.kneeL     = new Point(x - s * 0.5, y + s * 4.6);
    this.kneeR     = new Point(x + s * 0.5, y + s * 4.6);
    this.footL     = new Point(x - s * 0.6, y + s * 6);
    this.footR     = new Point(x + s * 0.6, y + s * 6);

    this.points = [
      this.head, this.neck, this.shoulderL, this.shoulderR,
      this.elbowL, this.elbowR, this.handL, this.handR,
      this.hip, this.hipL, this.hipR,
      this.kneeL, this.kneeR, this.footL, this.footR
    ];

    this.points.forEach(p => {
      p.oldx += (Math.random() - 0.5) * 4;
      p.oldy += (Math.random() - 0.5) * 2;
    });

    this.sticks = [
      new Stick(this.head, this.neck, 1, 'head'),
      new Stick(this.neck, this.shoulderL, 1, 'body'),
      new Stick(this.neck, this.shoulderR, 1, 'body'),
      new Stick(this.shoulderL, this.shoulderR, 1, 'body'),
      new Stick(this.shoulderL, this.elbowL, 1, 'leftHand'),
      new Stick(this.elbowL, this.handL, 1, 'leftHand'),
      new Stick(this.shoulderR, this.elbowR, 1, 'rightHand'),
      new Stick(this.elbowR, this.handR, 1, 'rightHand'),
      new Stick(this.neck, this.hip, 1, 'body'),
      new Stick(this.shoulderL, this.hip, 0.9, 'body'),
      new Stick(this.shoulderR, this.hip, 0.9, 'body'),
      new Stick(this.hip, this.hipL, 1, 'body'),
      new Stick(this.hip, this.hipR, 1, 'body'),
      new Stick(this.hipL, this.hipR, 1, 'body'),
      new Stick(this.hipL, this.kneeL, 1, 'leftLeg'),
      new Stick(this.kneeL, this.footL, 1, 'leftLeg'),
      new Stick(this.hipR, this.kneeR, 1, 'rightLeg'),
      new Stick(this.kneeR, this.footR, 1, 'rightLeg'),
    ];

    this.softSticks = [
      new Stick(this.head, this.shoulderL, 0.15),
      new Stick(this.head, this.shoulderR, 0.15),
      new Stick(this.footL, this.footR, 0.05),
    ];
  }

  update() {
    this.points.forEach(p => p.update());
    for (let i = 0; i < CONSTRAINT_ITERATIONS; i++) {
      this.sticks.forEach(s => s.update());
      this.softSticks.forEach(s => s.update());
      this.points.forEach(p => p.constrainToBounds());
    }
  }

  draw(ctx) {
    const partHidden = (part) => !!(part && customImages[part]);

    // হাত ও পা-কে ফিল্টার করে পেছনে রাখা
    const legAndHandSticks = this.sticks.filter(s => s.part && (s.part.includes('Leg') || s.part.includes('Hand')));
    const bodySticks = this.sticks.filter(s => !s.part || s.part === 'body' || s.part === 'head');

    ctx.lineCap = 'round';

    // ১. প্রথমে হাত ও পা আঁকা হবে (যাতে এগুলো পেছনে থাকে)
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 10;
    legAndHandSticks.forEach(s => {
      if (partHidden(s.part)) return;
      ctx.beginPath();
      ctx.moveTo(s.p1.x, s.p1.y);
      ctx.lineTo(s.p2.x, s.p2.y);
      ctx.stroke();
    });

    // ২. এবার বডি আঁকা হবে (হাত-পায়ের উপরে)
    ctx.lineWidth = 14; 
    bodySticks.forEach(s => {
      if (partHidden(s.part)) return;
      ctx.beginPath();
      ctx.moveTo(s.p1.x, s.p1.y);
      ctx.lineTo(s.p2.x, s.p2.y);
      ctx.stroke();
    });

    // ৩. জয়েন্ট ডট আঁকা
    const visible = new Set();
    this.sticks.forEach(s => {
      if (!partHidden(s.part)) { visible.add(s.p1); visible.add(s.p2); }
    });
    ctx.fillStyle = '#22242f';
    this.points.forEach(p => {
      if (!visible.has(p)) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
    });

    // ৪. সবার উপরে মাথা এবং ফেস ড্রয়িং
    if (!partHidden('head')) {
      const headRadius = 28;

      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.head.x, this.head.y, headRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#22242f';
      ctx.lineWidth = 3;
      ctx.stroke();

      if (this.head.flash > 0) {
        ctx.save();
        ctx.globalAlpha = this.head.flash / 10;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(this.head.x, this.head.y, 32, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const angle = Math.atan2(this.head.y - this.neck.y, this.head.x - this.neck.x);
      
      ctx.save();
      ctx.translate(this.head.x, this.head.y);
      ctx.rotate(angle - Math.PI / 2);

      // চোখ
      ctx.fillStyle = '#22242f';
      ctx.beginPath();
      ctx.arc(-9, -4, 4, 0, Math.PI * 2);
      ctx.arc(9, -4, 4, 0, Math.PI * 2);
      ctx.fill();

      // হাঁসি মুখ
      ctx.beginPath();
      ctx.arc(0, 4, 11, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#22242f';
      ctx.stroke();

      ctx.restore();
    }
  }

  nearestPoint(x, y, maxDist = 38) {
    let best = null, bestDist = maxDist;
    this.points.forEach(p => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestDist) { bestDist = d; best = p; }
    });
    return best;
  }
}

// ---------- Custom part images ----------
const PART_IMAGE_URLS = {
  head: 'assets/head.png',
  body: 'assets/body.png',
  leftHand: 'assets/left_hand.png',
  rightHand: 'assets/right_hand.png',
  leftLeg: 'assets/left_leg.png',
  rightLeg: 'assets/right_leg.png'
};

const customImages = {
  head: null, body: null,
  leftHand: null, rightHand: null,
  leftLeg: null, rightLeg: null
};
Object.keys(PART_IMAGE_URLS).forEach(part => {
  const url = PART_IMAGE_URLS[part];
  if (!url) return;
  const img = new Image();
  img.onload = () => { customImages[part] = img; };
  img.src = url;
});

function drawLimbImage(ctx, img, pA, pB, thickness = 35, lengthPad = 1.2) {
  if (!img || !img.complete || !img.naturalWidth) return;
  const dx = pB.x - pA.x, dy = pB.y - pA.y;
  const len = Math.hypot(dx, dy) * lengthPad;
  const angle = Math.atan2(dy, dx);
  const midx = (pA.x + pB.x) / 2, midy = (pA.y + pB.y) / 2;
  ctx.save();
  ctx.translate(midx, midy);
  ctx.rotate(angle);
  ctx.drawImage(img, -len / 2, -thickness / 2, len, thickness);
  ctx.restore();
}

function drawHeadImage(ctx, img, headPoint, neckPoint, size = 70) {
  if (!img || !img.complete || !img.naturalWidth) return;
  const angle = Math.atan2(headPoint.y - neckPoint.y, headPoint.x - neckPoint.x) + Math.PI / 2;
  ctx.save();
  ctx.translate(headPoint.x, headPoint.y);
  ctx.rotate(angle);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawBodyImage(ctx, img, neck, hip, shoulderL, shoulderR) {
  if (!img || !img.complete || !img.naturalWidth) return;
  const dx = hip.x - neck.x, dy = hip.y - neck.y;
  const len = Math.hypot(dx, dy) * 1.2;
  const angle = Math.atan2(dy, dx) - Math.PI / 2;
  const width = Math.hypot(shoulderR.x - shoulderL.x, shoulderR.y - shoulderL.y) * 1.4;
  const midx = (neck.x + hip.x) / 2, midy = (neck.y + hip.y) / 2;
  ctx.save();
  ctx.translate(midx, midy);
  ctx.rotate(angle);
  ctx.drawImage(img, -width / 2, -len / 2, width, len);
  ctx.restore();
}

function drawCustomOverlays(r, ctx) {
  // কাস্টম ছবির ক্ষেত্রেও হাত ও পা আগে এঁকে পেছনে রাখা হচ্ছে
  if (customImages.leftHand) drawLimbImage(ctx, customImages.leftHand, r.shoulderL, r.handL);
  if (customImages.rightHand) drawLimbImage(ctx, customImages.rightHand, r.shoulderR, r.handR);
  if (customImages.leftLeg) drawLimbImage(ctx, customImages.leftLeg, r.hipL, r.footL);
  if (customImages.rightLeg) drawLimbImage(ctx, customImages.rightLeg, r.hipR, r.footR);

  if (customImages.body) drawBodyImage(ctx, customImages.body, r.neck, r.hip, r.shoulderL, r.shoulderR);
  if (customImages.head) drawHeadImage(ctx, customImages.head, r.head, r.neck);
}

// ---------- Particles ----------
let particles = [];
function spawnParticles(x, y, count, colorList, speedMin, speedMax, lifeMin, lifeMax, sizeMin, sizeMax) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: lifeMin + Math.random() * (lifeMax - lifeMin),
      maxLife: lifeMax,
      size: sizeMin + Math.random() * (sizeMax - sizeMin),
      color: colorList[Math.floor(Math.random() * colorList.length)]
    });
  }
}
function updateParticles() {
  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.vx *= 0.97;
    p.life -= 1;
  });
  particles = particles.filter(p => p.life > 0);
}
function drawParticles(ctx) {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ---------- Explosion physics ----------
function applyExplosion(x, y, radius, strength) {
  ragdolls.forEach(r => {
    r.points.forEach(p => {
      const dx = p.x - x, dy = p.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist < radius && dist > 0.001) {
        const falloff = 1 - dist / radius;
        const force = strength * falloff;
        p.applyImpulse((dx / dist) * force, (dy / dist) * force - force * 0.3);
      }
    });
  });
  bombs.forEach(b => {
    const dx = b.x - x, dy = b.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist < radius && dist > 0.001) {
      const force = strength * (1 - dist / radius);
      b.vx += (dx / dist) * force * 0.5;
      b.vy += (dy / dist) * force * 0.5 - force * 0.2;
    }
  });
}

// ---------- Weapons ----------
let bombs = [];
let bullets = [];
let laserActive = false;
let laserTarget = { x: 0, y: 0 };
const TURRET = () => ({ x: W / 2, y: H - 34 });

function placeBomb(x, y) {
  bombs.push({ x, y, vx: 0, vy: 0, fuse: 90, radius: 14 });
}

function fireBullet(targetX, targetY, type) {
  const origin = TURRET();
  const dx = targetX - origin.x, dy = targetY - origin.y;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = type === 'bazooka' ? 14 : 26;
  bullets.push({
    x: origin.x, y: origin.y,
    vx: (dx / dist) * speed, vy: (dy / dist) * speed,
    type,
    radius: type === 'bazooka' ? 9 : 4,
    power: type === 'bazooka' ? 30 : 16,
    trail: []
  });
}

function updateWeapons() {
  const groundY = GROUND_Y();
  const ceilY = CEIL_Y();
  bombs.forEach(b => {
    b.vy += gravity * gravityDir;
    b.x += b.vx;
    b.y += b.vy;

    if (b.y > groundY - b.radius) {
      b.y = groundY - b.radius;
      b.vy *= -0.42;
      b.vx *= 0.8;
      if (Math.abs(b.vy) < 0.6) b.vy = 0;
    }
    if (b.y < ceilY + b.radius) {
      b.y = ceilY + b.radius;
      b.vy *= -0.42;
    }
    if (b.x < b.radius) { b.x = b.radius; b.vx *= -0.5; }
    if (b.x > W - b.radius) { b.x = W - b.radius; b.vx *= -0.5; }

    b.fuse -= 1;
  });
  bombs.filter(b => b.fuse <= 0).forEach(b => {
    applyExplosion(b.x, b.y, 180, 40);
    spawnParticles(b.x, b.y, 40, ['#ff9f43', '#ff6b6b', '#feca57', '#ffffff'], 2, 9, 20, 40, 2, 6);
  });
  bombs = bombs.filter(b => b.fuse > 0);

  bullets.forEach(bl => {
    bl.trail.push({ x: bl.x, y: bl.y });
    if (bl.trail.length > 6) bl.trail.shift();
    bl.x += bl.vx;
    bl.y += bl.vy;
  });
  bullets = bullets.filter(bl => {
    if (bl.x < -50 || bl.x > W + 50 || bl.y < -50 || bl.y > H + 50) return false;
    for (const r of ragdolls) {
      for (const p of r.points) {
        const d = Math.hypot(p.x - bl.x, p.y - bl.y);
        if (d < p.radius + bl.radius + 4) {
          const mag = Math.hypot(bl.vx, bl.vy) || 1;
          const dirx = bl.vx / mag, diry = bl.vy / mag;
          if (bl.type === 'bazooka') {
            applyExplosion(bl.x, bl.y, 140, 35);
            spawnParticles(bl.x, bl.y, 34, ['#ff9f43', '#ff6b6b', '#feca57'], 2, 8, 18, 34, 2, 5);
          } else {
            p.applyImpulse(dirx * bl.power, diry * bl.power);
            spawnParticles(bl.x, bl.y, 8, ['#fdcb6e', '#ffeaa7', '#ffffff'], 1, 4, 8, 16, 1, 3);
          }
          return false;
        }
      }
    }
    return true;
  });

  if (laserActive) {
    const origin = TURRET();
    const dx = laserTarget.x - origin.x, dy = laserTarget.y - origin.y;
    const len = Math.hypot(dx, dy) || 1;
    const dirx = dx / len, diry = dy / len;
    const beamLen = 2200;
    const ex = origin.x + dirx * beamLen, ey = origin.y + diry * beamLen;
    ragdolls.forEach(r => {
      r.points.forEach(p => {
        const segx = ex - origin.x, segy = ey - origin.y;
        const t = Math.max(0, Math.min(1, ((p.x - origin.x) * segx + (p.y - origin.y) * segy) / (segx * segx + segy * segy)));
        const closeX = origin.x + segx * t, closeY = origin.y + segy * t;
        const d = Math.hypot(p.x - closeX, p.y - closeY);
        if (d < 24) {
          const perpx = -diry, perpy = dirx;
          const side = ((p.x - closeX) * perpx + (p.y - closeY) * perpy) >= 0 ? 1 : -1;
          p.applyImpulse(perpx * side * 2.2 + dirx * 0.4, perpy * side * 2.2 + diry * 0.4);
        }
      });
    });
    if (Math.random() < 0.6) {
      spawnParticles(origin.x + dirx * Math.random() * len, origin.y + diry * Math.random() * len, 1, ['#00fff0', '#ff2e63'], 0.3, 1, 6, 12, 1, 2);
    }
  }
}

function drawWeapons(ctx) {
  bombs.forEach(b => {
    const pulse = Math.abs(Math.sin(b.fuse * 0.4));
    ctx.fillStyle = '#22242f';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pulse > 0.5 ? '#ff4757' : '#576574';
    ctx.beginPath();
    ctx.arc(b.x, b.y - b.radius - 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#dfe6e9';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(b.fuse / 60 * 10) / 10 + 's', b.x, b.y - b.radius - 14);
  });

  bullets.forEach(bl => {
    bl.trail.forEach((t, i) => {
      ctx.save();
      ctx.globalAlpha = (i / bl.trail.length) * 0.5;
      ctx.fillStyle = bl.type === 'bazooka' ? '#ff7f50' : '#ffeaa7';
      ctx.beginPath();
      ctx.arc(t.x, t.y, bl.radius * (i / bl.trail.length), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    ctx.fillStyle = bl.type === 'bazooka' ? '#e17055' : '#fdcb6e';
    ctx.beginPath();
    ctx.arc(bl.x, bl.y, bl.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  if (laserActive) {
    const origin = TURRET();
    ctx.save();
    ctx.strokeStyle = '#00fff0';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#00fff0';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    const dx = laserTarget.x - origin.x, dy = laserTarget.y - origin.y;
    const len = Math.hypot(dx, dy) || 1;
    ctx.lineTo(origin.x + (dx / len) * 2200, origin.y + (dy / len) * 2200);
    ctx.stroke();
    ctx.restore();
  }

  const origin = TURRET();
  let angle = -Math.PI / 2;
  if (laserActive) angle = Math.atan2(laserTarget.y - origin.y, laserTarget.x - origin.x);
  ctx.save();
  ctx.translate(origin.x, origin.y);
  ctx.rotate(angle);
  ctx.fillStyle = '#576574';
  ctx.fillRect(-6, -6, 34, 12);
  ctx.restore();
  ctx.fillStyle = '#2d3436';
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, 12, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- World ----------
let ragdolls = [];
const countLabel = document.getElementById('countLabel');

function addRagdoll(x, y) {
  ragdolls.push(new Ragdoll(x ?? (100 + Math.random() * (W - 200)), y ?? (CEIL_Y() + 60)));
  countLabel.textContent = `Ragdolls: ${ragdolls.length}`;
}
function clearAll() {
  ragdolls = [];
  bombs = [];
  bullets = [];
  particles = [];
  countLabel.textContent = `Ragdolls: 0`;
}

addRagdoll(W * 0.35, CEIL_Y() + 40);
addRagdoll(W * 0.65, CEIL_Y() + 90);

// ---------- Weapon mode selection ----------
let mode = 'drag';
const modeButtons = {
  drag: document.getElementById('w-drag'),
  bomb: document.getElementById('w-bomb'),
  gun: document.getElementById('w-gun'),
  bazooka: document.getElementById('w-bazooka'),
  laser: document.getElementById('w-laser'),
};
function setMode(m) {
  mode = m;
  Object.entries(modeButtons).forEach(([k, btn]) => btn.classList.toggle('active', k === m));
  if (m !== 'laser') laserActive = false;
}
Object.entries(modeButtons).forEach(([k, btn]) => btn.addEventListener('click', () => setMode(k)));

// ---------- Interaction ----------
let dragging = null;

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const touch = (e.touches && e.touches.length > 0) ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
  return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
}

function findJointNear(pos) {
  let best = null, bestDist = 38;
  ragdolls.forEach(r => {
    const p = r.nearestPoint(pos.x, pos.y, bestDist);
    if (p) { best = p; bestDist = Math.hypot(p.x - pos.x, p.y - pos.y); }
  });
  return best;
}

function pointerDown(e) {
  const pos = getPos(e);

  if (mode === 'drag' || mode === 'bomb') {
    const joint = findJointNear(pos);
    if (joint) {
      dragging = joint;
      dragging.pinned = true;
      e.preventDefault && e.preventDefault();
      return;
    }
  }

  if (mode === 'drag') {
    addRagdoll(pos.x, pos.y - 120);
  } else if (mode === 'bomb') {
    placeBomb(pos.x, pos.y);
  } else if (mode === 'gun' || mode === 'bazooka') {
    fireBullet(pos.x, pos.y, mode);
  } else if (mode === 'laser') {
    laserActive = true;
    laserTarget = pos;
  }
  e.preventDefault && e.preventDefault();
}

function pointerMove(e) {
  const pos = getPos(e);
  if (dragging) {
    dragging.x = pos.x; dragging.y = pos.y;
    dragging.oldx = pos.x; dragging.oldy = pos.y;
  } else if (mode === 'laser' && laserActive) {
    laserTarget = pos;
  }
  e.preventDefault && e.preventDefault();
}

function pointerUp() {
  if (dragging) { dragging.pinned = false; dragging = null; }
  laserActive = false;
}

canvas.addEventListener('mousedown', pointerDown);
canvas.addEventListener('mousemove', pointerMove);
window.addEventListener('mouseup', pointerUp);
canvas.addEventListener('touchstart', pointerDown, { passive: false });
canvas.addEventListener('touchmove', pointerMove, { passive: false });
window.addEventListener('touchend', pointerUp);

document.getElementById('addBtn').addEventListener('click', () => addRagdoll());
document.getElementById('clearBtn').addEventListener('click', clearAll);
document.getElementById('gravityBtn').addEventListener('click', () => { gravityDir *= -1; });
document.getElementById('windBtn').addEventListener('click', () => {
  windForce = (Math.random() > 0.5 ? 1 : -1) * (6 + Math.random() * 6);
  setTimeout(() => { windForce = 0; }, 300);
});

// ---------- Render loop ----------
function drawGround() {
  const groundY = GROUND_Y();
  ctx.fillStyle = '#12162b';
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.strokeStyle = '#3d4270';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(W, groundY);
  ctx.stroke();
}

function loop() {
  ctx.clearRect(0, 0, W, H);
  drawGround();
  updateWeapons();
  updateParticles();
  ragdolls.forEach(r => { r.update(); r.draw(ctx); drawCustomOverlays(r, ctx); });
  drawParticles(ctx);
  drawWeapons(ctx);
  requestAnimationFrame(loop);
}
loop();