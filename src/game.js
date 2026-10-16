// 墨斗火柴人 · 游戏逻辑
// 结构：姿势 → 招式表 → 画布 → 音效 → 输入 → 骨骼 → 招式运行 → 命中 → 特效 → 操作 → 物理 → 气功波 → 电脑 AI → 主循环 → 绘制 → 界面
(() => {
'use strict';
// ================= constants =================
const W = 960, H = 540, GROUND = 468, GRAV = 2100;
const WALL_L = 34, WALL_R = W - 34;
const INK = '#1d1b19', SEAL = '#b3261e', GOLD = '#a87a1f', PAPER = '#ece3cf';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ================= poses =================
// angles in degrees, absolute: 0 = straight down, 90 = forward (facing side), 180 = up, -90 = backward.
// lean: torso tilt forward from upright. dy: lowers the hip.
const PZ = (lean, dy, aF0, aF1, aB0, aB1, lF0, lF1, lB0, lB1) => ({ lean, dy, aF0, aF1, aB0, aB1, lF0, lF1, lB0, lB1 });
const PKEYS = Object.keys(PZ(0,0,0,0,0,0,0,0,0,0));
const POSE = {
  idle:     PZ(6, 0,   40, 150,  25, 155,  18, 4,   -16, -4),
  crouch:   PZ(18, 16, 55, 160,  40, 165,  75, -5,  -20, -75),
  air:      PZ(0, -2,  60, 140, -30, 20,   55, -15, -15, -70),
  block:    PZ(-4, 2,  78, 168,  66, 172,  22, 6,   -20, -6),
  cblock:   PZ(10, 16, 78, 168,  66, 172,  75, -5,  -20, -75),
  jab:      PZ(12, 0,  88, 90,   35, 160,  26, 8,   -22, -6),
  cross:    PZ(24, 1,  45, 150,  90, 92,   30, 8,   -30, -8),
  upper:    PZ(-12, -4, 160, 175, 20, 140, 14, 0,   -26, -12),
  kChamber: PZ(-8, 0,  50, 130, -20, 40,  100, 15,  0, 0),
  kick:     PZ(-18, 0, 40, 110, -35, 10,   92, 92,  3, 0),
  hiKick:   PZ(-32, 0, 30, 90,  -40, 0,   125, 132, 6, 0),
  sweep:    PZ(42, 22, 15, 5,    5, 0,     88, 90, -25, -82),
  airPunch: PZ(18, -2, 62, 62,  -30, 20,   50, -20, -12, -65),
  flyKick:  PZ(-25, -4, 60, 150, -60, -20, 100, 100, -40, -100),
  stomp:    PZ(25, -6, 20, 40,  -15, 10,   12, 0,  -12, 0),
  charge:   PZ(40, 4,  70, 40,  -40, -20,  50, 0,  -45, -30),
  bCharge:  PZ(-10, 2, -40, -15, -55, -30, 25, 8,  -25, -8),
  bFire:    PZ(16, 2,  90, 90,   86, 88,   30, 8,  -32, -8),
  grab:     PZ(14, 2,  85, 80,   80, 86,   24, 6,  -24, -6),
  throwP:   PZ(-30, 0, 160, 172, 150, 170, 26, 10, -30, -10),
  hurt:     PZ(-22, 2, -20, -60, -40, -80, 25, 10, -12, 0),
  ahurt:    PZ(-45, 0, -60, -110, -85, -130, 50, 30, 20, 0),
  down:     PZ(-88, 36, -130, -150, -60, -80, 86, 92, 80, 88),
  getup:    PZ(30, 18, 30, 10,   10, 0,    70, -5, -30, -80),
  win:      PZ(-4, 0,  172, 178,  25, 150, 14, 2,  -14, -2),
  dash:     PZ(28, 6,  60, 150, -30, 30,   45, -5, -40, -40),
};
const lerpPose = (a, b, t) => { const o = {}; for (const k of PKEYS) o[k] = a[k] + (b[k] - a[k]) * t; return o; };
const ease = t => 1 - (1 - t) * (1 - t);

// ================= moves =================
const MOVES = {
  jab:   { anim: [['jab', .05], ['jab', .08], ['idle', .12]], lunge: [0, .08, 120],
           hits: [{ t0: .04, t1: .12, limb: 'hF', r: 13, dmg: 5, kb: [150, 0], stun: .32, hs: .05 }],
           chain: { punch: 'cross', kick: 'kick', dpunch: 'upper', dkick: 'sweep' }, cw: .06 },
  cross: { anim: [['cross', .06], ['cross', .08], ['idle', .14]], lunge: [0, .08, 160],
           hits: [{ t0: .05, t1: .13, limb: 'hB', r: 13, dmg: 6, kb: [190, 0], stun: .34, hs: .06 }],
           chain: { punch: 'upper', kick: 'kick', dkick: 'sweep' }, cw: .07 },
  upper: { anim: [['crouch', .06], ['upper', .08], ['upper', .1], ['idle', .2]], lunge: [.05, .14, 140],
           hits: [{ t0: .07, t1: .2, limb: 'hF', r: 16, dmg: 9, kb: [110, -640], stun: .5, hs: .09, type: 'launch' }],
           chain: {}, cw: .16, jumpCancel: true },
  kick:  { anim: [['kChamber', .07], ['kick', .06], ['kick', .07], ['idle', .16]],
           hits: [{ t0: .09, t1: .2, limb: 'fF', r: 15, dmg: 8, kb: [300, -40], stun: .36, hs: .07 }],
           chain: { kick: 'hiKick', punch: 'jab', dkick: 'sweep' }, cw: .12 },
  hiKick:{ anim: [['kChamber', .06], ['hiKick', .07], ['hiKick', .08], ['idle', .2]],
           hits: [{ t0: .09, t1: .21, limb: 'fF', r: 17, dmg: 11, kb: [420, -320], stun: .5, hs: .1, type: 'knock' }] },
  sweep: { anim: [['crouch', .05], ['sweep', .06], ['sweep', .1], ['crouch', .14]], end: 'crouch',
           hits: [{ t0: .07, t1: .2, limb: 'fF', r: 17, dmg: 8, kb: [180, -220], stun: .4, hs: .07, type: 'knock' }] },
  airPunch: { air: true, anim: [['airPunch', .04], ['airPunch', .12], ['air', .1]],
           hits: [{ t0: .03, t1: .16, limb: 'hF', r: 14, dmg: 6, kb: [200, -150], stun: .32, hs: .05 }],
           chain: { kick: 'flyKick', dkick: 'stomp' }, cw: .07 },
  flyKick: { air: true, anim: [['kChamber', .05], ['flyKick', .3], ['air', .1]],
           hits: [{ t0: .06, t1: .35, limb: 'fF', r: 17, dmg: 10, kb: [380, -180], stun: .42, hs: .08 }],
           onStart: f => { f.vx = f.face * Math.max(Math.abs(f.vx), 280); f.vy = Math.min(f.vy, -60); } },
  stomp: { air: true, anim: [['air', .06], ['stomp', 1.4]],
           hits: [{ t0: .06, t1: 1.46, limb: 'fF', r: 18, dmg: 9, kb: [160, -260], stun: .4, hs: .08, type: 'knock' }],
           onStart: f => { f.vy = -160; f.vx *= .3; }, update: (f, t) => { if (t > .06) f.vy = 1150; },
           onLand: f => { shockwave(f); startMove(f, 'stompLand'); } },
  stompLand: { anim: [['crouch', .05], ['crouch', .2]], end: 'idle' },
  charge:{ anim: [['charge', .3], ['idle', .16]],
           hits: [{ t0: .02, t1: .3, limb: 'sh', r: 22, dmg: 10, kb: [520, -240], stun: .5, hs: .1, type: 'knock' }],
           update: (f, t) => { if (t < .28) f.vx = f.face * 680; } },
  throw: { anim: [['grab', .09], ['grab', .09], ['idle', .18]], grab: { t0: .05, t1: .14, range: 62, into: 'throwHold' } },
  throwHold: { anim: [['grab', .16], ['throwP', .14], ['idle', .25]], hold: 'throw',
           auto: [{ t: .24, dmg: 12, kb: [-360, -640], hs: .12, type: 'knock', release: true }] },
  blast: { anim: [['bCharge', .16], ['bFire', .1], ['bFire', .12], ['idle', .12]], spawn: .16 },
  ultRush: { anim: [['charge', .34], ['idle', .26]], ult: true,
           hits: [{ t0: .02, t1: .32, limb: 'sh', r: 26, dmg: 4, kb: [0, 0], stun: 1, hs: .12, holdInto: 'ultCombo' }],
           update: (f, t) => { if (t < .32) f.vx = f.face * 860; } },
  ultCombo: { anim: [['jab', .07], ['cross', .07], ['jab', .07], ['cross', .07], ['jab', .07], ['cross', .07], ['upper', .11], ['hiKick', .15], ['idle', .3]], hold: 'ult',
           auto: [.05, .12, .19, .26, .33, .40].map(t => ({ t, dmg: 3.5, kb: [0, 0], hs: .04 }))
                 .concat([{ t: .5, dmg: 5, kb: [0, 0], hs: .07 }, { t: .62, dmg: 11, kb: [480, -540], hs: .2, type: 'knock', release: true }]) },
};
for (const m of Object.values(MOVES)) m.total = m.anim.reduce((s, a) => s + a[1], 0);

// ================= canvas =================
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const stage = document.getElementById('stage');
let cw = 0, ch = 0, dpr = 1, sc = 1, ox = 0, oy = 0;
function resize() {
  const r = stage.getBoundingClientRect();
  dpr = Math.min(devicePixelRatio || 1, 2); cw = r.width; ch = r.height;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  sc = Math.min(cw / W, ch / H); ox = (cw - W * sc) / 2; oy = (ch - H * sc) / 2;
}
new ResizeObserver(resize).observe(stage); resize();

// background, painted once
const bg = document.createElement('canvas');
function paintBg() {
  bg.width = W * 2; bg.height = H * 2; const g = bg.getContext('2d'); g.scale(2, 2);
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  // paper fibres
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(90,70,40,${rnd() * 0.05})`; g.fillRect(rnd() * W, rnd() * H, rnd() * 3 + 1, 1); }
  // seal-red sun
  g.fillStyle = 'rgba(179,38,30,0.16)'; g.beginPath(); g.arc(720, 150, 70, 0, 7); g.fill();
  // ink-wash mountains, three layers
  [[0.07, 300, 120], [0.11, 360, 90], [0.17, 410, 60]].forEach(([a, base, amp], li) => {
    g.fillStyle = `rgba(29,27,25,${a})`; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 12) {
      const y = base - amp * (0.5 + 0.5 * Math.sin(x / (140 + li * 40) + li * 2)) * (0.6 + 0.4 * Math.sin(x / 57 + li)) - rnd() * 6;
      g.lineTo(x, y);
    }
    g.lineTo(W, H); g.fill();
  });
  // ground brush stroke
  g.fillStyle = 'rgba(29,27,25,0.85)';
  g.beginPath(); g.moveTo(0, GROUND + 2);
  for (let x = 0; x <= W; x += 20) g.lineTo(x, GROUND + 1 + rnd() * 3);
  for (let x = W; x >= 0; x -= 20) g.lineTo(x, GROUND + 7 + rnd() * 5);
  g.fill();
  g.fillStyle = 'rgba(29,27,25,0.06)'; g.fillRect(0, GROUND + 10, W, H - GROUND);
  // bamboo at the edges
  g.strokeStyle = 'rgba(29,27,25,0.35)'; g.lineCap = 'round';
  for (const bx of [14, 30, 932, 948]) {
    g.lineWidth = 5; g.beginPath(); g.moveTo(bx, GROUND); g.lineTo(bx + 4, 40); g.stroke();
    g.lineWidth = 7; for (let y = 90; y < GROUND; y += 70) { g.beginPath(); g.moveTo(bx - 3, y); g.lineTo(bx + 6, y); g.stroke(); }
  }
}
paintBg();

// ================= audio =================
let sound = true, ac = null;
function tone(freq, dur, type = 'square', vol = .05, slide = .5) {
  if (!sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
  } catch (e) {}
}
function noise(dur, vol = .08, lp = 1800) {
  if (!sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'lowpass'; f.frequency.value = lp; g.gain.value = vol;
    s.buffer = buf; s.connect(f).connect(g).connect(ac.destination); s.start();
  } catch (e) {}
}
const sfx = {
  whoosh: () => noise(.08, .03, 3000),
  hit: heavy => { noise(heavy ? .16 : .09, heavy ? .14 : .09, heavy ? 1200 : 2200); tone(heavy ? 110 : 170, .12, 'sine', .12); },
  block: () => { tone(900, .05, 'square', .03, .9); noise(.04, .04, 5000); },
  parry: () => { tone(1300, .25, 'triangle', .07, 1.2); tone(650, .3, 'sine', .05, 1); },
  thud: () => { tone(70, .25, 'sine', .16, .6); noise(.12, .06, 600); },
  blast: () => { tone(300, .35, 'sawtooth', .04, 2); noise(.2, .04, 1500); },
  ult: () => { tone(200, .6, 'sawtooth', .05, 3); tone(400, .6, 'square', .03, 2); },
  ko: () => { tone(160, .9, 'sawtooth', .07, .3); noise(.5, .1, 900); },
  bell: () => tone(880, .5, 'sine', .06, 1),
};

// ================= input =================
const ACTIONS = ['left', 'right', 'up', 'down', 'punch', 'kick', 'block', 'throw', 'blast', 'ult', 'dash'];
function newInput() { return { held: {}, pressT: {}, dashDir: 0, lastDirT: { left: -9, right: -9 } }; }
const now = () => performance.now() / 1000;
function press(I, a) {
  const t = now();
  if ((a === 'left' || a === 'right') && !I.held[a]) {
    if (t - I.lastDirT[a] < .24) { I.pressT.dash = t; I.dashDir = a === 'left' ? -1 : 1; }
    I.lastDirT[a] = t;
  }
  if (a === 'dash') I.dashDir = 0;
  if (!I.held[a]) I.pressT[a] = t;
  I.held[a] = true;
}
function release(I, a) { I.held[a] = false; }
function pressed(I, a, buf = .14) { const t = I.pressT[a]; if (t != null && now() - t < buf) { I.pressT[a] = null; return true; } return false; }
function peek(I, a, buf = .14) { const t = I.pressT[a]; return t != null && now() - t < buf; }

const KEYMAP_1P = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyJ: 'punch', KeyK: 'kick', KeyL: 'block', KeyU: 'throw', KeyI: 'blast', KeyO: 'ult', Space: 'dash' };
const KEYMAP_2P_A = { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyF: 'punch', KeyG: 'kick', KeyH: 'block', KeyR: 'throw', KeyT: 'blast', KeyY: 'ult', ShiftLeft: 'dash' };
const KEYMAP_2P_B = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Comma: 'punch', Period: 'kick', Slash: 'block', KeyM: 'throw', KeyL: 'blast', Semicolon: 'ult', ShiftRight: 'dash' };

// ================= game state =================
const DIFF = {
  easy:   { think: .5,  react: .34, block: .15, combo: .3,  aggr: .45, parry: 0 },
  normal: { think: .3,  react: .22, block: .42, combo: .65, aggr: .7,  parry: .05 },
  hard:   { think: .15, react: .12, block: .7,  combo: .95, aggr: .9,  parry: .2 },
};
let diff = 'normal';
const G = { mode: 'demo', phase: 'fight', pt: 0, round: 1, wins: [0, 0], time: 60, paused: false, banner: null,
  hitstop: 0, slow: 0, shakeT: 0, shakeM: 0, superT: 0, superBy: null, dummy: 0 };
let F = [], projs = [], parts = [], texts = [], rings = [];

function makeFighter(i, cpu) {
  return {
    i, x: i ? 640 : 320, y: GROUND, vx: 0, vy: 0, face: i ? -1 : 1, hp: 100, hpShow: 100, en: 0,
    state: 'idle', st: 0, move: null, mname: '', mt: 0, mHit: false, hitIds: new Set(), autoDone: new Set(), startPose: null, spawned: false,
    pose: { ...POSE.idle }, onGround: true, jumps: 0, inv: 0, bst: 0, spin: 0, knock: false, grabbedBy: null, grabT: null,
    color: i ? SEAL : INK, input: newInput(), cpu, ai: { t: 0, walk: 0, blockT: 0, blockDelay: 0, reacted: false, queue: [], airPlan: null, projSeen: null },
    combo: 0, comboDmg: 0, comboShowT: 0, comboShow: 0, comboDmgShow: 0, trail: [], trailT: 0, walkPh: 0, blockPressT: -9,
    stats: { maxCombo: 0, dmg: 0, perfect: 0, ult: 0 },
  };
}
function setupMatch(mode) {
  G.mode = mode; G.round = 1; G.wins = [0, 0];
  F = [makeFighter(0, mode === 'demo'), makeFighter(1, mode !== 'pvp')];
  startRound();
}
function startRound() {
  for (const f of F) {
    const en = f.en;
    Object.assign(f, { x: f.i ? 640 : 320, y: GROUND, vx: 0, vy: 0, face: f.i ? -1 : 1, hp: 100, hpShow: 100, state: 'idle', st: 0, move: null,
      onGround: true, jumps: 0, inv: 0, bst: 0, spin: 0, knock: false, grabbedBy: null, combo: 0, pose: { ...POSE.idle } });
    f.en = G.round === 1 ? 0 : en;
    f.input = newInput();
  }
  projs = []; parts = []; texts = []; rings = [];
  G.time = 60; G.slow = 0;
  if (G.mode === 'train') { F[0].en = 100; G.phase = 'fight'; G.banner = { t: 1.2, big: '训练场', small: '按 T 切换木桩' }; return; }
  if (G.mode === 'demo') { G.phase = 'fight'; return; }
  G.phase = 'intro'; G.pt = 1.7;
  G.banner = { t: 1.7, big: `第 ${G.round} 回合`, small: '' };
  sfx.bell();
}

// ================= skeleton =================
function skel(f, pose = f.pose) {
  const fc = f.face, lr = pose.lean * Math.PI / 180;
  const hip = { x: f.x, y: f.y - 42 + pose.dy };
  const ux = Math.sin(lr) * fc, uy = -Math.cos(lr);
  const sh = { x: hip.x + ux * 34, y: hip.y + uy * 34 };
  const head = { x: hip.x + ux * 46, y: hip.y + uy * 46 };
  const seg = (p, a, L) => { const r = a * Math.PI / 180; return { x: p.x + Math.sin(r) * fc * L, y: p.y + Math.cos(r) * L }; };
  const eF = seg(sh, pose.aF0, 17), hF = seg(eF, pose.aF1, 17);
  const eB = seg(sh, pose.aB0, 17), hB = seg(eB, pose.aB1, 17);
  const kF = seg(hip, pose.lF0, 21), fF = seg(kF, pose.lF1, 21);
  const kB = seg(hip, pose.lB0, 21), fB = seg(kB, pose.lB1, 21);
  return { hip, sh, head, eF, hF, eB, hB, kF, fF, kB, fB };
}
function hurtbox(f) {
  const s = skel(f);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of [s.hip, s.sh, s.kF, s.fF, s.kB, s.fB]) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  x0 = Math.min(x0, s.head.x - 10); x1 = Math.max(x1, s.head.x + 10); y0 = Math.min(y0, s.head.y - 10); y1 = Math.max(y1, s.head.y + 10);
  return { x0: x0 - 5, y0: y0 - 4, x1: x1 + 5, y1: y1 + 2 };
}
const circRect = (cx, cy, r, b) => { const nx = Math.max(b.x0, Math.min(cx, b.x1)), ny = Math.max(b.y0, Math.min(cy, b.y1)); return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r; };
function limbPoint(f, limb) {
  const s = skel(f);
  if (limb === 'sh') return { x: s.sh.x + f.face * 10, y: s.sh.y + 6 };
  return s[limb];
}

// ================= moves runtime =================
function startMove(f, name) {
  const m = MOVES[name];
  f.state = 'attack'; f.move = m; f.mname = name; f.mt = 0; f.mHit = false; f.spawned = false;
  f.hitIds = new Set(); f.autoDone = new Set(); f.startPose = { ...f.pose };
  if (m.onStart) m.onStart(f);
  if (name !== 'stompLand' && name !== 'throwHold' && name !== 'ultCombo') sfx.whoosh();
}
function movePose(f) {
  const m = f.move; let t = f.mt, from = f.startPose;
  for (const [pn, d] of m.anim) {
    if (t <= d) return lerpPose(from, POSE[pn], ease(Math.min(1, t / d)));
    t -= d; from = POSE[pn];
  }
  return { ...POSE[m.anim[m.anim.length - 1][0]] };
}
function endMove(f) {
  const m = f.move; f.move = null;
  if (!f.onGround) { f.state = 'air'; return; }
  f.state = m.end || 'idle';
}

function updateMove(f, o, dt) {
  const m = f.move; f.mt += dt;
  f.pose = movePose(f);
  if (m.lunge && f.onGround && f.mt >= m.lunge[0] && f.mt < m.lunge[1]) f.vx = f.face * m.lunge[2];
  if (m.update) m.update(f, f.mt);
  // hit windows
  if (m.hits) m.hits.forEach((h, idx) => {
    if (f.hitIds.has(idx) || f.mt < h.t0 || f.mt > h.t1) return;
    const p = limbPoint(f, h.limb);
    if (o.inv > 0 || o.grabbedBy || ['down', 'getup', 'ko'].includes(o.state)) return;
    if (!circRect(p.x, p.y, h.r, hurtbox(o))) return;
    f.hitIds.add(idx);
    const res = applyHit(f, o, h, p);
    if (res === 'hit') {
      f.mHit = true;
      if (h.holdInto) { grabStart(f, o, h.holdInto); }
    }
  });
  // throw grab
  if (m.grab && !f.mHit && f.mt >= m.grab.t0 && f.mt <= m.grab.t1) {
    if (Math.abs(o.x - f.x) < m.grab.range && o.onGround && o.inv <= 0 && !['down', 'getup', 'ko', 'grabbed'].includes(o.state)) {
      f.mHit = true; grabStart(f, o, m.grab.into);
      return;
    }
  }
  // auto hits on a held opponent
  if (m.auto && f.grabT === o) {
    m.auto.forEach((h, idx) => {
      if (f.autoDone.has(idx) || f.mt < h.t) return;
      f.autoDone.add(idx);
      const p = limbPoint(f, m.hold === 'throw' ? 'hF' : (idx % 2 ? 'hB' : 'hF'));
      applyHit(f, o, { ...h, unblock: true, stun: .5 }, { x: (p.x + o.x) / 2, y: p.y });
      if (h.release || o.hp <= 0) releaseGrab(f, o, h);
    });
  }
  // projectile
  if (m.spawn && !f.spawned && f.mt >= m.spawn) {
    f.spawned = true; const p = limbPoint(f, 'hF');
    projs.push({ x: p.x + f.face * 10, y: p.y, vx: f.face * 560, owner: f, life: 1.8, r: 17, rot: 0 });
    sfx.blast();
  }
  if (f.move === m && f.mt >= m.total) endMove(f);
}
function grabStart(f, o, into) {
  startMove(f, into);
  f.grabT = o; o.grabbedBy = f; o.state = 'grabbed'; o.move = null; o.vx = o.vy = 0;
  if (into === 'ultCombo') { f.stats.ult++; G.superT = 0; banner('百裂拳', '', .9, SEAL); }
}
function releaseGrab(f, o, h) {
  f.grabT = null; o.grabbedBy = null;
  if (o.state === 'grabbed') { o.state = 'airhurt'; o.knock = true; o.vx = f.face * (h.kb ? h.kb[0] : 300); o.vy = h.kb ? h.kb[1] : -400; o.onGround = false; }
}

// ================= hits =================
function canBlock(d, att) {
  const front = Math.sign(att.x - d.x || att.face * -1) === d.face;
  return d.onGround && front && (d.state === 'block' || (d.input.held.block && ['idle', 'walk', 'crouch'].includes(d.state)));
}
function applyHit(a, d, h, p) {
  // perfect block: pressed block just before the hit
  if (!h.unblock && d.onGround && ['idle', 'walk', 'crouch', 'block'].includes(d.state) && now() - d.blockPressT < .16 && Math.sign(a.x - d.x || 1) === d.face) {
    d.state = 'block'; d.bst = .1; d.en = Math.min(100, d.en + 12); d.stats.perfect++;
    if (!h.proj) { a.state = 'hurt'; a.st = .62; a.move = null; a.vx = -a.face * 180; a.pose = { ...POSE.hurt }; }
    G.hitstop = .16; flashText(p.x, p.y - 30, '完美格挡！', GOLD, 30); ring(p.x, p.y, GOLD); sfx.parry(); shake(5, .15);
    return 'parry';
  }
  if (!h.unblock && canBlock(d, a)) {
    const chip = h.dmg * .1; d.hp = Math.max(1, d.hp - chip);
    d.state = 'block'; d.bst = .12 + (h.stun || .3) * .35; d.vx = a.face * (h.kb ? Math.abs(h.kb[0]) : 200) * .55;
    a.en = Math.min(100, a.en + 2); d.en = Math.min(100, d.en + 4);
    G.hitstop = .04; burst(p.x, p.y, '#7a7268', 5, 120); sfx.block();
    return 'block';
  }
  const stunned = ['hurt', 'airhurt', 'grabbed'].includes(d.state);
  a.combo = stunned ? a.combo + 1 : 1;
  const scale = Math.max(.42, 1 - .085 * (a.combo - 1));
  const dmg = h.dmg * scale;
  d.hp = Math.max(0, d.hp - dmg);
  a.comboDmg = a.combo === 1 ? dmg : a.comboDmg + dmg;
  a.stats.dmg += dmg; a.stats.maxCombo = Math.max(a.stats.maxCombo, a.combo);
  if (a.combo >= 2) { a.comboShow = a.combo; a.comboDmgShow = a.comboDmg; a.comboShowT = 1.3; }
  a.en = Math.min(100, a.en + h.dmg * .9); d.en = Math.min(100, d.en + h.dmg * .55);
  if (G.mode === 'train' && a === F[0]) a.en = 100;
  d.face = a.x < d.x ? -1 : 1;
  if (d.state !== 'grabbed') {
    d.move = null;
    const kx = (h.kb ? h.kb[0] : 200) * a.face, ky = h.kb ? h.kb[1] : 0;
    d.vx = kx;
    if (h.type === 'launch' || h.type === 'knock' || !d.onGround || d.hp <= 0) {
      d.state = 'airhurt'; d.knock = h.type === 'knock' || h.type === 'launch' || d.hp <= 0 || d.knock && !d.onGround;
      d.vy = ky || (d.onGround ? -260 : -220); if (d.hp <= 0) d.vy = Math.min(d.vy, -420);
      d.onGround = false; d.y = Math.min(d.y, GROUND - 1);
    } else { d.state = 'hurt'; d.st = h.stun || .3; }
  }
  const heavy = h.dmg >= 9;
  G.hitstop = Math.max(G.hitstop, h.hs || .06);
  shake(heavy ? 7 : 3, heavy ? .2 : .1);
  burst(p.x, p.y, d.color, heavy ? 16 : 9, heavy ? 340 : 240);
  slash(p.x, p.y, a.face, heavy);
  flashText(p.x + (Math.random() - .5) * 20, p.y - 20, Math.round(dmg).toString(), d.color === INK ? SEAL : INK, heavy ? 22 : 17);
  sfx.hit(heavy);
  if (d.hp <= 0) onKO(a, d);
  return 'hit';
}

function shockwave(f) {
  ring(f.x, GROUND, INK, 120); shake(9, .25); sfx.thud(); dust(f.x, 14);
  const o = F[1 - f.i];
  if (Math.abs(o.x - f.x) < 115 && o.onGround && o.inv <= 0 && !['down', 'getup', 'ko', 'grabbed'].includes(o.state))
    applyHit(f, o, { dmg: 8, kb: [200, -300], type: 'knock', hs: .1, unblock: false, stun: .4 }, { x: o.x, y: GROUND - 20 });
}

// ================= effects =================
function shake(m, t) { if (reduceMotion) return; G.shakeM = Math.max(G.shakeM, m); G.shakeT = Math.max(G.shakeT, t); }
function burst(x, y, color, n, sp) {
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = sp * (.3 + Math.random() * .7);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: .3 + Math.random() * .4, max: .7, r: 2 + Math.random() * 4.5, color, g: 900 }); }
}
function dust(x, n) { for (let i = 0; i < n; i++) parts.push({ x: x + (Math.random() - .5) * 30, y: GROUND - 2, vx: (Math.random() - .5) * 260, vy: -Math.random() * 120, life: .4, max: .4, r: 3 + Math.random() * 4, color: 'rgba(29,27,25,0.35)', g: 300 }); }
function slash(x, y, dir, heavy) { rings.push({ x, y, t: 0, max: .16, kind: 'slash', dir, heavy }); }
function ring(x, y, color, R = 60) { rings.push({ x, y, t: 0, max: .35, kind: 'ring', color, R }); }
function flashText(x, y, s, color, size) { texts.push({ x, y, s, color, size, t: 0, max: .8 }); }
function banner(big, small, t, color = INK) { G.banner = { big, small, t, color }; }

function onKO(a, d) {
  if (G.mode === 'train') { setTimeout(() => { d.hp = 100; }, 900); d.hp = 1; return; }
  if (G.mode === 'demo') { G.phase = 'ko'; G.pt = 2.2; G.slow = 1; return; }
  if (G.phase !== 'fight') return;
  G.phase = 'ko'; G.pt = 3; G.slow = 1.1; G.winner = a.i;
  G.wins[a.i]++;
  banner('K.O.', '', 2, SEAL); sfx.ko(); shake(12, .4);
}

// ================= control =================
function faceOpp(f, o) { if (Math.abs(o.x - f.x) > 4) f.face = o.x > f.x ? 1 : -1; }
function tryOffense(f, I) {
  if (pressed(I, 'ult') ) { if (f.en >= 100) { startUlt(f); return true; } }
  if (peek(I, 'blast') && f.en >= 25) { pressed(I, 'blast'); f.en -= 25; startMove(f, 'blast'); return true; }
  if (pressed(I, 'throw')) { startMove(f, 'throw'); return true; }
  if (pressed(I, 'punch')) { startMove(f, I.held.down ? 'upper' : 'jab'); return true; }
  if (pressed(I, 'kick')) { startMove(f, I.held.down ? 'sweep' : 'kick'); return true; }
  return false;
}
function startUlt(f) {
  f.en = 0; G.superT = .5; G.superBy = f; sfx.ult();
  banner('必杀', '', .6, SEAL); startMove(f, 'ultRush');
}
function jump(f, I) {
  const dir = (I.held.right ? 1 : 0) - (I.held.left ? 1 : 0);
  f.vy = -770; f.vx = dir * 230; f.jumps = 1; f.state = 'air'; f.onGround = false; dust(f.x, 5);
}

function control(f, o, dt) {
  const I = f.input;
  if (I.held.block && !f._blockWas) f.blockPressT = now();
  f._blockWas = !!I.held.block;
  switch (f.state) {
    case 'idle': case 'walk': case 'crouch': case 'block': {
      if (f.state === 'block' && f.bst > 0) { f.bst -= dt; f.pose = lerpPose(f.pose, POSE[I.held.down ? 'cblock' : 'block'], .5); break; }
      faceOpp(f, o);
      if (tryOffense(f, I)) break;
      if (pressed(I, 'up')) { jump(f, I); break; }
      if (pressed(I, 'dash', .12)) { f.state = 'dash'; f.st = .24; f.dashDir = I.dashDir || f.face; f.vx = f.dashDir * 600; dust(f.x, 6); sfx.whoosh(); break; }
      const dir = (I.held.right ? 1 : 0) - (I.held.left ? 1 : 0);
      if (I.held.block) { f.state = 'block'; f.vx *= .5; }
      else if (I.held.down) { f.state = 'crouch'; }
      else if (dir) { f.state = 'walk'; f.vx = dir * (dir === f.face ? 220 : 170); f.walkPh += dt * 12 * (dir === f.face ? 1 : -1); }
      else f.state = 'idle';
      break;
    }
    case 'air': {
      if (f.jumps < 2 && pressed(I, 'up')) { f.vy = -660; f.jumps = 2; f.spin = .4; const dir = (I.held.right ? 1 : 0) - (I.held.left ? 1 : 0); if (dir) f.vx = dir * 240; sfx.whoosh(); }
      else if (pressed(I, 'punch')) startMove(f, 'airPunch');
      else if (pressed(I, 'kick')) startMove(f, I.held.down ? 'stomp' : 'flyKick');
      else if (pressed(I, 'ult') && f.en >= 100) { /* ground only */ }
      const dir = (I.held.right ? 1 : 0) - (I.held.left ? 1 : 0);
      if (dir) f.vx = Math.max(-250, Math.min(250, f.vx + dir * 1300 * dt));
      break;
    }
    case 'dash':
      f.st -= dt; f.vx = f.dashDir * 600 * Math.max(.2, f.st / .24);
      if (pressed(I, 'punch') && f.dashDir === f.face) { startMove(f, 'charge'); break; }
      if (pressed(I, 'kick')) { startMove(f, 'kick'); break; }
      if (f.st <= 0) f.state = 'idle';
      break;
    case 'attack': {
      const m = f.move;
      // chains
      if (m.chain && f.mt >= m.cw) {
        const k = peek(I, 'punch') ? 'punch' : peek(I, 'kick') ? 'kick' : null;
        if (k) {
          const key = (I.held.down && m.chain['d' + k]) ? 'd' + k : k;
          if (m.chain[key]) { pressed(I, k); startMove(f, m.chain[key]); break; }
        }
      }
      // cancel into specials after a landed hit
      if (f.mHit && !m.ult && !m.hold && f.onGround) {
        if (peek(I, 'ult') && f.en >= 100) { pressed(I, 'ult'); startUlt(f); break; }
        if (peek(I, 'blast') && f.en >= 25 && f.mname !== 'blast') { pressed(I, 'blast'); f.en -= 25; startMove(f, 'blast'); break; }
      }
      if (m.jumpCancel && f.mHit && f.mt > .14 && pressed(I, 'up')) { jump(f, I); break; }
      updateMove(f, o, dt);
      break;
    }
    case 'hurt': f.st -= dt; if (f.st <= 0) f.state = 'idle'; break;
    case 'down':
      f.st -= dt;
      if (f.st <= 0) { if (f.hp <= 0) f.state = 'ko'; else { f.state = 'getup'; f.st = .32; f.inv = .5; } }
      break;
    case 'getup': f.st -= dt; if (f.st <= 0) { f.state = 'idle'; f.inv = .15; } break;
  }
  if (f.state !== 'attack' && f.move && f.state !== 'grabbed') f.move = null;
}

// target pose for non-attack states
function targetPose(f, t) {
  switch (f.state) {
    case 'idle': { const p = { ...POSE.idle }; const b = Math.sin(t * 3 + f.i) * 2; p.aF1 += b * 2; p.aB1 += b * 2; p.dy += Math.abs(b) * .6; return p; }
    case 'walk': { const p = { ...POSE.idle }; const s = Math.sin(f.walkPh); p.lF0 = 18 + s * 26; p.lF1 = p.lF0 - 8 - Math.max(0, -s) * 30; p.lB0 = -16 - s * 26; p.lB1 = p.lB0 - 8 - Math.max(0, s) * 30; p.dy = Math.abs(Math.cos(f.walkPh)) * 2; return p; }
    case 'crouch': return POSE.crouch;
    case 'block': return f.input.held.down ? POSE.cblock : POSE.block;
    case 'air': return POSE.air;
    case 'dash': return POSE.dash;
    case 'hurt': return POSE.hurt;
    case 'airhurt': return POSE.ahurt;
    case 'down': case 'ko': return POSE.down;
    case 'getup': return POSE.getup;
    case 'grabbed': return POSE.ahurt;
    case 'win': { const p = { ...POSE.win }; p.aF0 += Math.sin(t * 6) * 6; return p; }
    default: return POSE.idle;
  }
}

// ================= physics =================
function physics(f, o, dt) {
  f.inv = Math.max(0, f.inv - dt);
  if (f.state === 'grabbed' && f.grabbedBy) {
    const g = f.grabbedBy, m = g.move;
    if (m && m.hold === 'throw') { const p = Math.min(1, g.mt / .3); f.x = g.x + g.face * (34 - 64 * p); f.y = GROUND - 70 * Math.sin(p * Math.PI); }
    else { f.x = g.x + g.face * 44; f.y = GROUND; }
    f.face = -g.face;
    return;
  }
  const wasAir = !f.onGround;
  if (!f.onGround || f.vy < 0) {
    f.vy += GRAV * dt * (f.state === 'airhurt' && f.vy > 0 ? 1.1 : 1);
    f.onGround = false;
  }
  f.x += f.vx * dt; f.y += f.vy * dt;
  if (f.y >= GROUND) {
    f.y = GROUND;
    if (wasAir && f.vy >= 0) { f.vy = 0; f.onGround = true; land(f); }
    else if (f.vy > 0) f.vy = 0;
    f.onGround = true;
  }
  if (f.onGround && !['walk', 'dash'].includes(f.state) && !(f.state === 'attack' && (f.move.update || (f.move.lunge && f.mt < f.move.lunge[1]))))
    f.vx *= Math.exp(-13 * dt);
  // walls
  if (f.x < WALL_L || f.x > WALL_R) {
    f.x = Math.max(WALL_L, Math.min(WALL_R, f.x));
    if (f.state === 'airhurt' && Math.abs(f.vx) > 260) { f.vx = -f.vx * .45; f.vy = Math.min(f.vy, -160); burst(f.x, f.y - 40, f.color, 8, 200); sfx.thud(); shake(5, .15); }
    else f.vx = 0;
  }
  f.spin = Math.max(0, f.spin - dt);
}
function land(f) {
  f.jumps = 0;
  if (f.state === 'air') { f.state = 'idle'; dust(f.x, 4); }
  else if (f.state === 'attack' && f.move && f.move.air) {
    if (f.move.onLand) f.move.onLand(f); else { f.move = null; f.state = 'idle'; dust(f.x, 4); }
  } else if (f.state === 'airhurt') {
    if (f.knock || f.hp <= 0) {
      f.state = 'down'; f.st = f.hp <= 0 ? 99 : .7; f.inv = 1.2; f.knock = false; f.combo = 0;
      dust(f.x, 12); sfx.thud(); shake(5, .15);
      F[1 - f.i].combo = 0;
    } else { f.state = 'hurt'; f.st = .12; }
  }
}
function pushApart(a, b) {
  if (a.grabbedBy || b.grabbedBy || ['down', 'ko'].includes(a.state) || ['down', 'ko'].includes(b.state)) return;
  if (Math.abs(a.y - b.y) > 70) return;
  const dx = b.x - a.x, min = 34;
  if (Math.abs(dx) < min) { const push = (min - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1); a.x -= push; b.x += push; }
}

// ================= projectiles =================
function updateProjs(dt) {
  for (const p of projs) {
    p.x += p.vx * dt; p.life -= dt; p.rot += dt * 14;
    if (Math.random() < .7) parts.push({ x: p.x - Math.sign(p.vx) * 10, y: p.y + (Math.random() - .5) * 16, vx: -p.vx * .1, vy: (Math.random() - .5) * 40, life: .3, max: .3, r: 3 + Math.random() * 5, color: p.owner.color, g: 0 });
    const t = F[1 - p.owner.i];
    if (!p.dead && t.inv <= 0 && !['down', 'getup', 'ko', 'grabbed'].includes(t.state) && circRect(p.x, p.y, p.r, hurtbox(t))) {
      p.dead = true; applyHit(p.owner, t, { dmg: 10, kb: [280, -80], stun: .38, hs: .08, proj: true }, { x: p.x, y: p.y });
    }
    if (p.x < 0 || p.x > W || p.life <= 0) p.dead = true;
  }
  // clashes
  for (let i = 0; i < projs.length; i++) for (let j = i + 1; j < projs.length; j++) {
    const a = projs[i], b = projs[j];
    if (!a.dead && !b.dead && a.owner !== b.owner && Math.abs(a.x - b.x) < 30 && Math.abs(a.y - b.y) < 30) {
      a.dead = b.dead = true; ring((a.x + b.x) / 2, a.y, GOLD, 70); burst((a.x + b.x) / 2, a.y, INK, 14, 300); sfx.thud();
    }
  }
  projs = projs.filter(p => !p.dead);
}

// ================= AI =================
function ai(f, o, dt) {
  const A = f.ai, P = G.mode === 'train' ? DIFF.easy : (G.mode === 'demo' ? DIFF.normal : DIFF[diff]), I = f.input;
  const t = now(), dx = o.x - f.x, dist = Math.abs(dx);
  const toward = dx > 0 ? 'right' : 'left', away = dx > 0 ? 'left' : 'right';
  const hold = (k, v) => { I.held[k] = v; };
  const tap = k => { I.pressT[k] = t; };
  for (const k of ['left', 'right', 'down', 'block']) I.held[k] = false;

  if (G.mode === 'train') {
    if (G.dummy === 0) return;
    if (G.dummy === 1) { if (dist < 170) hold('block', true); return; }
  }
  A.t -= dt; A.blockT -= dt;

  // reactive defense against attacks and projectiles
  const threat = (o.state === 'attack' && dist < 160) || projs.some(p => p.owner === o && Math.sign(p.vx) === Math.sign(f.x - p.x) && Math.abs(p.x - f.x) < 240);
  if (threat && !A.reacted) {
    A.reacted = true;
    if (Math.random() < P.block) { A.blockDelay = P.react; A.blockT = P.react + .32; if (Math.random() < P.parry) A.blockT = P.react + .05; }
    else if (projs.some(p => p.owner === o) && Math.random() < P.aggr * .5 && f.onGround && f.state !== 'attack') { tap('up'); }
  }
  if (!threat) A.reacted = false;
  if (A.blockDelay > 0) A.blockDelay -= dt;
  else if (A.blockT > 0 && ['idle', 'walk', 'crouch', 'block'].includes(f.state)) { hold('block', true); if (o.mname === 'sweep') hold('down', true); return; }

  // continue combos
  if (f.state === 'attack' && f.move) {
    if (A.queue.length && f.move.chain && f.mt >= f.move.cw) {
      const k = A.queue.shift(); if (k === 'dkick' || k === 'dpunch') { hold('down', true); tap(k.slice(1)); } else tap(k);
    }
    if (f.mHit && f.en >= 100 && Math.random() < P.combo * .4) tap('ult');
    else if (f.mHit && f.en >= 25 && f.mname === 'hiKick' && Math.random() < P.combo * .3) tap('blast');
    if (f.mname === 'upper' && f.mHit && Math.random() < P.combo) { tap('up'); A.airPlan = 'chase'; }
    return;
  }
  // air plans
  if (f.state === 'air') {
    if (A.airPlan === 'chase' && dist < 90 && f.vy > -200) { tap(Math.random() < .5 ? 'punch' : 'kick'); A.airPlan = null; }
    else if (A.airPlan === 'kick' && dist < 150 && f.vy > -150) { tap('kick'); A.airPlan = null; }
    else if (A.airPlan === 'stomp' && dist < 70) { hold('down', true); tap('kick'); A.airPlan = null; }
    hold(toward, true);
    return;
  }
  if (!['idle', 'walk', 'crouch', 'block'].includes(f.state)) return;

  // juggle opportunity
  if (o.state === 'airhurt' && dist < 120 && o.y < GROUND - 30 && Math.random() < P.combo) { tap('up'); A.airPlan = 'chase'; return; }

  if (A.t > 0) { if (A.walk) hold(A.walk > 0 ? 'right' : 'left', true); return; }
  A.t = P.think * (.6 + Math.random() * .8); A.walk = 0;
  const r = Math.random();
  if (f.en >= 100 && dist < 320 && r < .55) { tap('ult'); return; }
  if (dist > 300) {
    if (f.en >= 25 && r < .35 * P.aggr) tap('blast');
    else if (r < .5) { tap('dash'); I.dashDir = Math.sign(dx); }
    else A.walk = Math.sign(dx);
  } else if (dist > 82) {
    if (r < .22 * P.aggr) { tap('up'); hold(toward, true); A.airPlan = Math.random() < .25 ? 'stomp' : 'kick'; }
    else if (r < .32 && f.en >= 25) tap('blast');
    else if (r < .45) { tap('dash'); I.dashDir = Math.sign(dx); if (Math.random() < .6) setTimeout(() => { I.pressT.punch = now(); }, 60); }
    else if (r < .55 && G.mode !== 'demo') A.walk = -Math.sign(dx);
    else A.walk = Math.sign(dx);
  } else {
    if (r > P.aggr) { A.walk = -Math.sign(dx); return; }
    const c = Math.random();
    const keep = n => Array.from({ length: n }).every(() => Math.random() < P.combo);
    if (o.state === 'block' && c < .55) tap('throw');
    else if (c < .32) { tap('punch'); A.queue = keep(1) ? (keep(1) ? ['punch', 'punch'] : ['punch']) : []; if (A.queue.length === 2 && Math.random() < .3) A.queue = ['punch', 'kick', 'kick']; }
    else if (c < .55) { tap('kick'); A.queue = keep(1) ? ['kick'] : []; }
    else if (c < .67) { hold('down', true); tap('kick'); }
    else if (c < .78) { hold('down', true); tap('punch'); }
    else if (c < .86) tap('throw');
    else { tap('up'); A.airPlan = 'kick'; }
  }
}

// ================= main update =================
let last = performance.now(), clock = 0;
function update(dt) {
  clock += dt;
  if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
  for (const f of F) { f.hpShow += (f.hp - f.hpShow) * (1 - Math.exp(-4 * dt)); f.comboShowT = Math.max(0, f.comboShowT - dt); }
  if (G.superT > 0) { G.superT -= dt; return; }
  if (G.hitstop > 0) { G.hitstop -= dt; G.shakeT -= dt; return; }
  if (G.slow > 0) { G.slow -= dt; dt *= .3; }
  G.shakeT = Math.max(0, G.shakeT - dt);

  // phases
  if (G.phase === 'intro') { G.pt -= dt; if (G.pt <= .5 && !G.fightSaid) { G.fightSaid = true; banner('开打！', '', .7, SEAL); } if (G.pt <= 0) { G.phase = 'fight'; G.fightSaid = false; } }
  else if (G.phase === 'fight' && G.mode !== 'train' && G.mode !== 'demo') {
    G.time -= dt;
    if (G.time <= 0) {
      G.time = 0; const w = F[0].hp === F[1].hp ? -1 : F[0].hp > F[1].hp ? 0 : 1;
      G.phase = 'ko'; G.pt = 2.6; G.winner = w; if (w >= 0) G.wins[w]++; banner('时间到', w < 0 ? '平局' : '', 2, INK); sfx.bell();
    }
  } else if (G.phase === 'ko') {
    G.pt -= dt;
    if (G.mode !== 'demo' && G.pt < 1.6 && G.winner >= 0) { const w = F[G.winner]; if (w.onGround && ['idle', 'walk', 'crouch', 'block'].includes(w.state)) w.state = 'win'; }
    if (G.pt <= 0) {
      if (G.mode === 'demo') { G.round++; startRound(); }
      else if (G.wins[0] >= 2 || G.wins[1] >= 2) endMatch();
      else { G.round++; startRound(); }
    }
  }

  const [a, b] = F;
  const active = G.phase === 'fight';
  for (const [f, o] of [[a, b], [b, a]]) {
    if (f.cpu && active) ai(f, o, dt);
    if (active || ['attack', 'hurt', 'airhurt', 'down', 'getup', 'grabbed'].includes(f.state)) {
      if (!active && f.state === 'attack') { updateMove(f, o, dt); } else if (active) control(f, o, dt);
      else if (f.state === 'down' || f.state === 'getup' || f.state === 'hurt') control(f, o, dt);
    }
    if (f.state !== 'attack') { const tp = targetPose(f, clock); f.pose = lerpPose(f.pose, tp, 1 - Math.exp(-22 * dt)); }
  }
  for (const [f, o] of [[a, b], [b, a]]) physics(f, o, dt);
  pushApart(a, b);
  updateProjs(dt);
  if (G.mode === 'train') { F[0].en = 100; for (const f of F) if (f.hp < 100 && ['idle', 'walk', 'block', 'crouch'].includes(f.state)) f.hp = Math.min(100, f.hp + dt * 25); }

  // trails for attacking limbs
  for (const f of F) {
    f.trailT -= dt;
    if (f.state === 'attack' || f.spin > 0) { if (f.trailT <= 0) { f.trail.push({ s: skel(f), life: .16, spin: f.spin }); f.trailT = .025; } }
    for (const tr of f.trail) tr.life -= dt;
    f.trail = f.trail.filter(tr => tr.life > 0);
  }
  for (const p of parts) { p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .96; p.life -= dt; }
  parts = parts.filter(p => p.life > 0);
  for (const t of texts) { t.t += dt; t.y -= 40 * dt; }
  texts = texts.filter(t => t.t < t.max);
  for (const r of rings) r.t += dt;
  rings = rings.filter(r => r.t < r.max);
}

// ================= drawing =================
function drawFighter(f, s, alpha = 1, ghost = false) {
  const col = f.color;
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (f.spin > 0 && !ghost) { const a = (1 - f.spin / .4) * Math.PI * 2 * -f.face; ctx.translate(s.hip.x, s.hip.y - 10); ctx.rotate(a); ctx.translate(-s.hip.x, -(s.hip.y - 10)); }
  const line = (pts, w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke(); };
  const back = ghost ? col : (f.i ? 'rgba(179,38,30,0.55)' : 'rgba(29,27,25,0.5)');
  line([s.hip, s.kB, s.fB], 6, back);
  line([s.sh, s.eB, s.hB], 5.5, back);
  line([s.hip, s.sh], 8, col);
  line([s.hip, s.kF, s.fF], 6.5, col);
  line([s.sh, s.eF, s.hF], 6, col);
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(s.head.x, s.head.y, 11, 0, 7); ctx.fill();
  if (!ghost) {
    // headband tail flowing behind, the one bit of costume
    const tail = f.i ? PAPER : SEAL;
    ctx.strokeStyle = tail; ctx.lineWidth = 3;
    const bx = s.head.x - f.face * 8, by = s.head.y - 3, wv = Math.sin(clock * 12 + f.i) * 4 - f.vx * .01;
    ctx.beginPath(); ctx.moveTo(s.head.x - f.face * 10, s.head.y - 4); ctx.quadraticCurveTo(bx - f.face * 12, by + wv, bx - f.face * 24, by + 6 + wv); ctx.stroke();
    if (f.inv > 0 && ['getup', 'idle'].includes(f.state) && Math.floor(clock * 20) % 2) { ctx.globalAlpha = .3; }
  }
  ctx.restore();
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, cw, ch);
  ctx.translate(ox, oy); ctx.scale(sc, sc);
  if (G.shakeT > 0) ctx.translate((Math.random() - .5) * G.shakeM, (Math.random() - .5) * G.shakeM);
  else G.shakeM = 0;
  ctx.drawImage(bg, 0, 0, W, H);

  // shadows
  for (const f of F) {
    const hgt = Math.max(0, GROUND - f.y), k = Math.max(.35, 1 - hgt / 300);
    ctx.fillStyle = `rgba(29,27,25,${.18 * k})`; ctx.beginPath(); ctx.ellipse(f.x, GROUND + 3, 26 * k, 5 * k, 0, 0, 7); ctx.fill();
  }
  // trails
  for (const f of F) for (const tr of f.trail) drawFighter(f, tr.s, tr.life / .16 * .18, true);
  // fighters: the attacker is drawn on top
  const order = [...F].sort((a, b) => (a.state === 'attack') - (b.state === 'attack'));
  for (const f of order) {
    const blink = f.inv > 0 && f.state !== 'down' && f.state !== 'ko' && Math.floor(clock * 22) % 2;
    drawFighter(f, skel(f), blink ? .45 : 1);
  }
  // projectiles: swirling ink balls
  for (const p of projs) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillStyle = p.owner.color; ctx.globalAlpha = .9; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, 7); ctx.fill();
    ctx.strokeStyle = PAPER; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, p.r * .55, 0, 4); ctx.stroke();
    ctx.restore();
  }
  // particles
  for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (.5 + .5 * p.life / p.max), 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  // rings and slashes
  for (const r of rings) {
    const k = r.t / r.max;
    if (r.kind === 'ring') { ctx.strokeStyle = r.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 6 * (1 - k) + 1; ctx.beginPath(); ctx.ellipse(r.x, r.y, r.R * k + 10, (r.R * k + 10) * (r.y >= GROUND - 2 ? .25 : 1), 0, 0, 7); ctx.stroke(); }
    else {
      ctx.strokeStyle = INK; ctx.globalAlpha = 1 - k; ctx.lineWidth = r.heavy ? 5 : 3; ctx.lineCap = 'round';
      for (let i = 0; i < (r.heavy ? 6 : 4); i++) { const a = i / (r.heavy ? 6 : 4) * 6.28 + .4, L1 = 10 + k * 20, L2 = L1 + (r.heavy ? 26 : 16) * (1 - k);
        ctx.beginPath(); ctx.moveTo(r.x + Math.cos(a) * L1, r.y + Math.sin(a) * L1); ctx.lineTo(r.x + Math.cos(a) * L2, r.y + Math.sin(a) * L2); ctx.stroke(); }
    }
  }
  ctx.globalAlpha = 1;
  // floating numbers
  ctx.textAlign = 'center';
  for (const t of texts) {
    ctx.globalAlpha = 1 - (t.t / t.max) ** 2; ctx.fillStyle = t.color;
    ctx.font = `900 ${t.size}px "Noto Sans SC", sans-serif`; ctx.fillText(t.s, t.x, t.y);
  }
  ctx.globalAlpha = 1;

  // super flash
  if (G.superT > 0) {
    ctx.fillStyle = `rgba(29,27,25,${Math.min(.55, G.superT * 2)})`; ctx.fillRect(-20, -20, W + 40, H + 40);
    const f = G.superBy; if (f) drawFighter(f, skel(f), 1);
    ctx.fillStyle = SEAL; ctx.globalAlpha = Math.min(1, G.superT * 4);
    ctx.save(); ctx.translate(W / 2, H / 2 - 30); ctx.rotate(-.06); ctx.fillRect(-W, -34, W * 2, 68); ctx.restore();
    ctx.fillStyle = PAPER; ctx.font = '80px "Ma Shan Zheng", serif'; ctx.fillText('必杀', W / 2, H / 2 - 4);
    ctx.globalAlpha = 1;
  }
  drawHUD();
}

function drawHUD() {
  if (G.mode === 'demo') return;
  const bw = 360, by = 22;
  for (const f of F) {
    const left = f.i === 0, x = left ? 28 : W - 28 - bw;
    // name
    ctx.font = '700 15px "Noto Sans SC", sans-serif'; ctx.fillStyle = f.color; ctx.textAlign = left ? 'left' : 'right';
    const name = G.mode === 'pvp' ? (left ? '1P · 墨' : '2P · 朱') : (left ? '你' : (G.mode === 'train' ? ['木桩 · 站着', '木桩 · 会格挡', '木桩 · 会还手'][G.dummy] : `电脑 · ${{ easy: '简单', normal: '普通', hard: '困难' }[diff]}`));
    ctx.fillText(name, left ? x : x + bw, by + 38);
    // hp
    ctx.fillStyle = 'rgba(29,27,25,0.12)'; ctx.fillRect(x, by, bw, 16);
    const w = bw * f.hp / 100, ws = bw * f.hpShow / 100;
    ctx.fillStyle = 'rgba(179,38,30,0.35)'; ctx.fillRect(left ? x + bw - ws : x, by, ws, 16);
    ctx.fillStyle = f.color; ctx.fillRect(left ? x + bw - w : x, by, w, 16);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(x, by, bw, 16);
    // energy, 4 segments of 25
    const ey = by + 46, ew = 200, ex = left ? x : x + bw - ew;
    ctx.fillStyle = 'rgba(29,27,25,0.1)'; ctx.fillRect(ex, ey, ew, 8);
    const full = f.en >= 100;
    ctx.fillStyle = full && Math.floor(clock * 6) % 2 ? SEAL : GOLD;
    const e = ew * f.en / 100; ctx.fillRect(left ? ex : ex + ew - e, ey, e, 8);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(ex, ey, ew, 8);
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(ex + ew * k / 4, ey); ctx.lineTo(ex + ew * k / 4, ey + 8); ctx.stroke(); }
    ctx.font = '700 11px "Noto Sans SC", sans-serif'; ctx.fillStyle = full ? SEAL : 'rgba(29,27,25,0.6)';
    ctx.textAlign = left ? 'left' : 'right';
    ctx.fillText(full ? '必杀就绪！' : `气 ${Math.floor(f.en)}`, left ? ex + ew + 8 : ex - 8, ey + 8);
    // round wins
    if (G.mode !== 'train') for (let k = 0; k < 2; k++) {
      const cx = left ? x + bw - 10 - k * 18 : x + 10 + k * 18;
      ctx.beginPath(); ctx.arc(cx, by + 33, 6, 0, 7); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
      if (G.wins[f.i] > k) { ctx.fillStyle = SEAL; ctx.fill(); }
    }
    // combo counter
    if (f.comboShowT > 0) {
      ctx.globalAlpha = Math.min(1, f.comboShowT * 2.5); ctx.textAlign = left ? 'left' : 'right';
      const cxp = left ? 30 : W - 30;
      ctx.fillStyle = f.color; ctx.font = '64px "Ma Shan Zheng", serif'; ctx.fillText(`${f.comboShow}`, cxp, 170);
      ctx.font = '900 18px "Noto Sans SC", sans-serif'; ctx.fillText(`连击  ${Math.round(f.comboDmgShow)} 伤害`, cxp, 194);
      ctx.globalAlpha = 1;
    }
  }
  // timer
  if (G.mode !== 'train') {
    ctx.textAlign = 'center'; ctx.fillStyle = G.time < 10 ? SEAL : INK; ctx.font = '46px "Ma Shan Zheng", serif';
    ctx.fillText(Math.ceil(G.time).toString(), W / 2, 62);
  }
  // banner
  if (G.banner) {
    const b = G.banner, k = Math.min(1, b.t * 4);
    ctx.globalAlpha = k; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(236,227,207,0.7)'; ctx.fillRect(0, H / 2 - 70, W, 110);
    ctx.fillStyle = b.color || INK; ctx.font = '86px "Ma Shan Zheng", serif'; ctx.fillText(b.big, W / 2, H / 2 + 10);
    if (b.small) { ctx.font = '700 16px "Noto Sans SC", sans-serif'; ctx.fillStyle = INK; ctx.fillText(b.small, W / 2, H / 2 + 34); }
    ctx.globalAlpha = 1;
  }
}

// ================= match flow & UI =================
const $ = id => document.getElementById(id);
const ov = { menu: $('ov-menu'), moves: $('ov-moves'), pause: $('ov-pause'), over: $('ov-over') };
let movesFrom = null;
function show(name) { for (const [k, el] of Object.entries(ov)) el.hidden = k !== name; }
function hideAll() { for (const el of Object.values(ov)) el.hidden = true; }
function startGame(mode) { setupMatch(mode); hideAll(); G.paused = false; tone(1, .001); }
function toMenu() { setupMatch('demo'); show('menu'); G.paused = false; }
function endMatch() {
  G.phase = 'over';
  const w = G.wins[0] >= 2 ? 0 : 1, me = F[0];
  $('over-title').textContent = G.mode === 'pvp' ? (w === 0 ? '1P 胜' : '2P 胜') : (w === 0 ? '胜' : '败');
  $('over-title').style.color = w === 0 ? INK : SEAL;
  $('over-sub').textContent = G.mode === 'pvp' ? `比分 ${G.wins[0]} : ${G.wins[1]}` : (w === 0 ? `你以 ${G.wins[0]} : ${G.wins[1]} 打赢了电脑（${{ easy: '简单', normal: '普通', hard: '困难' }[diff]}）。` : `电脑以 ${G.wins[1]} : ${G.wins[0]} 赢了。多用格挡和投技试试。`);
  const s = (G.mode === 'pvp' ? F[w] : me).stats;
  $('st-combo').textContent = s.maxCombo; $('st-dmg').textContent = Math.round(s.dmg); $('st-perfect').textContent = s.perfect; $('st-ult').textContent = s.ult;
  show('over');
}
function togglePause() {
  if (G.mode === 'demo' || G.phase === 'over') return;
  G.paused = !G.paused; if (G.paused) show('pause'); else hideAll();
}
function openMoves() { movesFrom = Object.entries(ov).find(([, el]) => !el.hidden)?.[0] || null; if (G.mode !== 'demo' && G.phase !== 'over') G.paused = true; show('moves'); }
function closeMoves() { if (movesFrom && movesFrom !== 'moves') show(movesFrom); else { hideAll(); G.paused = false; } if (movesFrom === 'pause') G.paused = true; }

for (const b of document.querySelectorAll('#diff button')) b.addEventListener('click', () => {
  diff = b.dataset.d; for (const x of document.querySelectorAll('#diff button')) x.setAttribute('aria-pressed', String(x === b));
});
$('go-cpu').onclick = () => startGame('cpu');
$('go-pvp').onclick = () => startGame('pvp');
$('go-train').onclick = () => startGame('train');
$('b-moves').onclick = () => (ov.moves.hidden ? openMoves() : closeMoves());
$('moves-close').onclick = closeMoves;
$('b-pause').onclick = togglePause;
$('p-resume').onclick = togglePause;
$('p-moves').onclick = openMoves;
$('p-menu').onclick = toMenu;
$('o-again').onclick = () => startGame(G.mode);
$('o-menu').onclick = toMenu;
$('b-sound').onclick = e => { sound = !sound; e.currentTarget.textContent = sound ? '声音：开' : '声音：关'; e.currentTarget.setAttribute('aria-pressed', String(sound)); };

function keyTarget(code) {
  if (G.mode === 'pvp') { if (KEYMAP_2P_A[code]) return [F[0], KEYMAP_2P_A[code]]; if (KEYMAP_2P_B[code]) return [F[1], KEYMAP_2P_B[code]]; return null; }
  if (G.mode === 'demo') return null;
  return KEYMAP_1P[code] ? [F[0], KEYMAP_1P[code]] : null;
}
addEventListener('keydown', e => {
  if (e.code === 'Tab') { e.preventDefault(); ov.moves.hidden ? openMoves() : closeMoves(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') { if (!ov.moves.hidden) closeMoves(); else togglePause(); return; }
  if (e.code === 'KeyT' && G.mode === 'train') { G.dummy = (G.dummy + 1) % 3; F[1].cpu = true; banner(['木桩 · 站着', '木桩 · 会格挡', '木桩 · 会还手'][G.dummy], '', 1); return; }
  const tgt = keyTarget(e.code);
  if (!tgt) return;
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  press(tgt[0].input, tgt[1]);
});
addEventListener('keyup', e => { const tgt = keyTarget(e.code); if (tgt) release(tgt[0].input, tgt[1]); });
addEventListener('blur', () => { for (const f of F) for (const a of ACTIONS) f.input.held[a] = false; if (G.mode !== 'demo' && !G.paused && G.phase !== 'over') togglePause(); });

// touch pad
for (const b of document.querySelectorAll('#touch button')) {
  const a = b.dataset.a;
  b.addEventListener('pointerdown', e => { e.preventDefault(); if (G.mode !== 'demo') press(F[0].input, a); b.style.background = 'rgba(29,27,25,0.2)'; });
  const up = () => { if (F[0]) release(F[0].input, a); b.style.background = ''; };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
}

// ================= loop =================
setupMatch('demo');
function frame(t) {
  const dt = Math.min(.033, (t - last) / 1000); last = t;
  if (!G.paused && G.phase !== 'over') update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
