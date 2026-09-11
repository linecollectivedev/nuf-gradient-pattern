const canvas = document.querySelector('#pattern-canvas');
const previewStage = document.querySelector('#preview-stage');
const statusEl = document.querySelector('#status');
const fpsEl = document.querySelector('#performance span');

const defaults = Object.freeze({
  mode: 0,
  density: 3,
  scale: 0.88,
  distortion: 0,
  swirl: 0.85,
  centerX: 0,
  centerY: 0,
  showBlobs: true,
  blobCount: 32,
  blobSize: 1.42,
  liquidTexture: 0.45,
  separation: 3,
  softness: 0.25,
  edgeWidth: 0.46,
  speed: 1.23,
  flow: 0.6,
  turbulence: 2,
  seed: 5,
  baseColor: '#5c0800',
  bodyColor: '#ffc46a',
  midColor: '#ff6a00',
  edgeColor: '#e01b00',
  showText: false,
  textContent: 'NUF\nPATTERN',
  fontFamily: 'Arial Black',
  textSize: 1.1,
  letterSpacing: -12,
  textSoftness: 0.035,
  textColor: '#ffffff',
  textBlend: 0,
  grain: 0.035,
  renderScale: 0.75,
  fps: 60,
  exportResolution: 1,
  canvasWidth: 1920,
  canvasHeight: 1080,
  aspectRatio: '16:9',
});

const state = { ...defaults };
let isAnimating = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let textDirty = true;
let toastTimer = 0;
let exportInProgress = false;

const vertexSource = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const fragmentSource = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uResolution;
uniform float uTime;
uniform float uMode;
uniform float uDensity;
uniform float uScale;
uniform float uDistortion;
uniform float uSwirl;
uniform vec2 uCenter;
uniform float uShowBlobs;
uniform float uBlobCount;
uniform vec2 uBlobCenters[32];
uniform float uBlobSize;
uniform float uLiquidTexture;
uniform float uSeparation;
uniform float uSoftness;
uniform float uEdgeWidth;
uniform float uFlow;
uniform float uTurbulence;
uniform float uSeed;
uniform vec3 uBaseColor;
uniform vec3 uBodyColor;
uniform vec3 uMidColor;
uniform vec3 uEdgeColor;
uniform float uGrain;
uniform float uShowText;
uniform sampler2D uTextTexture;
uniform float uTextSize;
uniform float uTextSoftness;
uniform vec3 uTextColor;
uniform float uTextBlend;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

mat2 rotate2d(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

// Simplex noise (Ashima Arts, MIT) - the same generator the Brik tool uses, so
// the domain warp and cluster modulation reproduce its liquid character.
vec4 permute(vec4 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}
vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - D.yyy;

  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 1.0 / 7.0;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1),
                                dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// Exponential metaball potential. Unlike a finite-support polynomial kernel this
// never terminates, so neighbouring centers fuse into continuous liquid masses
// instead of reading as overlapping circles.
float blobPotential(vec2 evalP) {
  float potential = 0.0;
  float radius = max(0.02, uBlobSize * 0.14);
  float invRadiusSq = 1.0 / (radius * radius);

  for (int i = 0; i < 32; i++) {
    if (float(i) >= uBlobCount) break;
    vec2 delta = evalP - uBlobCenters[i];
    potential += exp(-dot(delta, delta) * invRadiusSq);
  }

  return potential;
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 p = uv - 0.5;
  p.x *= aspect;
  p -= vec2(uCenter.x * aspect, uCenter.y) * 0.42;

  float t = uTime;
  float mode = floor(uMode + 0.5);
  // Brik drives both the warp frequency and the blob-space zoom from one scale.
  // Keeping it low is what yields broad continents rather than fine froth.
  float noiseScale = uScale * 1.3;

  // Swirl bends the whole domain before the field is evaluated, so the liquid
  // masses shear rather than rotate as rigid bodies.
  p = rotate2d(uSwirl * (0.13 + length(p) * 0.22)) * p;

  vec2 evalP = p * (noiseScale * 0.5);

  // Organic domain warp: two decorrelated simplex fields displace the sampling
  // position, which is what turns round metaballs into torn liquid continents.
  float deform = uLiquidTexture * 0.15;
  vec3 warpPos = vec3(p * noiseScale, t * 0.3);
  evalP.x += snoise(warpPos) * deform;
  evalP.y += snoise(warpPos + vec3(11.7, 43.1, 9.8)) * deform;

  // A second, finer warp octave adds the frayed capillary detail along edges.
  float detailAmount = deform * uTurbulence * 0.22;
  vec3 detailPos = vec3(p * noiseScale * (1.6 + uDensity * 0.45), t * 0.45);
  evalP.x += snoise(detailPos) * detailAmount;
  evalP.y += snoise(detailPos + vec3(31.4, 7.9, 22.6)) * detailAmount;

  float potential = blobPotential(evalP);

  // Flow modes reshape the same potential field instead of drawing a second
  // pattern underneath it.
  if (mode == 1.0) {
    float radius = length(p);
    float angle = atan(p.y, p.x);
    potential += sin((radius * uDensity + angle * uSwirl * 0.15 - t * uFlow) * 6.28318) * uDistortion * 0.12;
  } else if (mode == 2.0) {
    potential += sin((p.y * uDensity + p.x * uSwirl * 0.25 + t * uFlow) * 6.28318) * uDistortion * 0.12;
  } else if (mode == 3.0) {
    potential += sin((potential * uDensity * 1.7 - t * uFlow * 0.35) * 6.28318) * uDistortion * 0.1;
  }

  // Brik's contour metric: distance is zero deep inside the mass and grows
  // outward, which is what produces the characteristic thin bright rim.
  float threshold = mix(0.4, 2.0, clamp(uSeparation / 4.0, 0.0, 1.0));
  // Signed rather than clamped at zero: the interior keeps a depth gradient, so
  // masses read as molten volume instead of a flat fill.
  float dist = threshold - potential;

  // Low-frequency cluster noise modulates rim thickness so edges breathe
  // instead of staying a uniform offset from the mass.
  vec3 clusterPos = vec3(p * noiseScale, t * 0.5);
  float clusterNoise = fbm(clusterPos * 1.8 + vec3(12.3, 45.6, 78.9), 2);
  float clusterMod = mix(1.0, smoothstep(-0.4, 0.4, clusterNoise) * 1.8 + 0.2, clamp(uDistortion * 0.4, 0.0, 1.0));

  // Body colour saturates this far below the contour; the mid and edge bands sit
  // above it, so the thin outer band is the bright rim that defines the liquid.
  float coreDepth = uEdgeWidth * 4.5 * clusterMod;
  float innerWidth = uEdgeWidth * 1.05 * clusterMod;
  float outerWidth = uEdgeWidth * 0.34 * clusterMod;
  float totalWidth = innerWidth + outerWidth;
  float softness = max(0.002, uSoftness * 0.4);

  float shapeMask = 1.0 - smoothstep(totalWidth - softness, totalWidth + softness, dist);

  // Three-tone ramp across the signed contour distance: body -> mid -> edge.
  vec3 shapeColor;
  if (dist < 0.0) {
    shapeColor = mix(uBodyColor, uMidColor, smoothstep(0.0, 1.0, 1.0 + dist / max(coreDepth, 0.001)));
  } else if (dist < innerWidth) {
    shapeColor = mix(uMidColor, uEdgeColor, smoothstep(0.0, 1.0, dist / max(innerWidth, 0.001)));
  } else {
    shapeColor = uEdgeColor;
  }

  vec3 scene = mix(uBaseColor, shapeColor, shapeMask * uShowBlobs);

  if (uShowText > 0.5) {
    vec2 textUv = uv - 0.5;
    textUv.x *= aspect;
    textUv /= max(0.01, uTextSize);
    textUv.x /= max(1.0, aspect);
    textUv += 0.5;
    float alpha = texture(uTextTexture, textUv).a;
    float textMask = smoothstep(0.42 - uTextSoftness, 0.42 + uTextSoftness, alpha);
    if (textUv.x < 0.0 || textUv.x > 1.0 || textUv.y < 0.0 || textUv.y > 1.0) textMask = 0.0;
    vec3 target = uTextColor;
    if (uTextBlend > 0.5 && uTextBlend < 1.5) target = vec3(1.0) - scene;
    if (uTextBlend > 1.5) target = abs(scene - uTextColor);
    scene = mix(scene, target, textMask);
  }

  float grain = hash21(gl_FragCoord.xy + vec2(fract(t) * 937.0, uSeed));
  scene += (grain - 0.5) * uGrain;
  scene = clamp(scene, 0.0, 1.0);
  fragColor = vec4(scene, 1.0);
}`;

const gl = canvas.getContext('webgl2', {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
});

if (!gl) {
  document.body.classList.add('no-webgl');
  showStatus('WebGL2 is required for the pattern studio.');
  throw new Error('WebGL2 is not supported');
}

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message || 'Shader compilation failed');
  }
  return shader;
}

function createProgram() {
  const program = gl.createProgram();
  const vertex = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'Program linking failed');
  }
  return program;
}

const program = createProgram();
gl.useProgram(program);

const vao = gl.createVertexArray();
const positionBuffer = gl.createBuffer();
gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const positionLocation = gl.getAttribLocation(program, 'aPosition');
gl.enableVertexAttribArray(positionLocation);
gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

const uniformNames = [
  'uResolution', 'uTime', 'uMode', 'uDensity', 'uScale', 'uDistortion', 'uSwirl', 'uCenter',
  'uShowBlobs', 'uBlobCount', 'uBlobSize', 'uLiquidTexture', 'uSeparation', 'uSoftness', 'uEdgeWidth', 'uFlow',
  'uTurbulence', 'uSeed', 'uBaseColor', 'uBodyColor', 'uMidColor', 'uEdgeColor', 'uGrain',
  'uShowText', 'uTextTexture', 'uTextSize', 'uTextSoftness', 'uTextColor', 'uTextBlend',
];
const uniforms = Object.fromEntries(uniformNames.map((name) => [name, gl.getUniformLocation(program, name)]));
uniforms.uBlobCenters = gl.getUniformLocation(program, 'uBlobCenters[0]');

const MAX_BLOBS = 32;
const blobCenters = new Float32Array(MAX_BLOBS * 2);

// Ashima 3D simplex noise, ported to JS. Brik drifts every blob with this
// generator; because the offsets depend only on the blob index and time, they
// are evaluated once per frame here rather than once per pixel in the shader.
const SIMPLEX_GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);
const SIMPLEX_PERM = new Uint8Array(512);
{
  const source = new Uint8Array(256);
  for (let index = 0; index < 256; index += 1) source[index] = index;
  let shuffleState = 1013904223;
  for (let index = 255; index > 0; index -= 1) {
    shuffleState = (Math.imul(shuffleState, 1664525) + 1013904223) >>> 0;
    const swap = shuffleState % (index + 1);
    const temp = source[index];
    source[index] = source[swap];
    source[swap] = temp;
  }
  for (let index = 0; index < 512; index += 1) SIMPLEX_PERM[index] = source[index & 255];
}

function simplexDot(gradIndex, x, y, z) {
  const base = gradIndex * 3;
  return SIMPLEX_GRAD3[base] * x + SIMPLEX_GRAD3[base + 1] * y + SIMPLEX_GRAD3[base + 2] * z;
}

function snoise3(x, y, z) {
  const F3 = 1 / 3;
  const G3 = 1 / 6;
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);
  const t = (i + j + k) * G3;
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const z0 = z - (k - t);

  let i1;
  let j1;
  let k1;
  let i2;
  let j2;
  let k2;
  if (x0 >= y0) {
    if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
    else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
  } else if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
  else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
  else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }

  const x1 = x0 - i1 + G3;
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2 * G3;
  const y2 = y0 - j2 + 2 * G3;
  const z2 = z0 - k2 + 2 * G3;
  const x3 = x0 - 1 + 3 * G3;
  const y3 = y0 - 1 + 3 * G3;
  const z3 = z0 - 1 + 3 * G3;

  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;
  const gi0 = SIMPLEX_PERM[ii + SIMPLEX_PERM[jj + SIMPLEX_PERM[kk]]] % 12;
  const gi1 = SIMPLEX_PERM[ii + i1 + SIMPLEX_PERM[jj + j1 + SIMPLEX_PERM[kk + k1]]] % 12;
  const gi2 = SIMPLEX_PERM[ii + i2 + SIMPLEX_PERM[jj + j2 + SIMPLEX_PERM[kk + k2]]] % 12;
  const gi3 = SIMPLEX_PERM[ii + 1 + SIMPLEX_PERM[jj + 1 + SIMPLEX_PERM[kk + 1]]] % 12;

  let total = 0;
  let contribution = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (contribution > 0) { contribution *= contribution; total += contribution * contribution * simplexDot(gi0, x0, y0, z0); }
  contribution = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (contribution > 0) { contribution *= contribution; total += contribution * contribution * simplexDot(gi1, x1, y1, z1); }
  contribution = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (contribution > 0) { contribution *= contribution; total += contribution * contribution * simplexDot(gi2, x2, y2, z2); }
  contribution = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (contribution > 0) { contribution *= contribution; total += contribution * contribution * simplexDot(gi3, x3, y3, z3); }
  return 32 * total;
}

const GOLDEN_ANGLE = 2.39996;

// Brik seeds its blobs along a golden spiral and lets each one wander on its own
// smooth simplex track. The spiral keeps the cluster evenly packed at any count,
// and the noise drift is what makes the mass breathe rather than orbit.
function updateBlobCenters() {
  const seed = Number(state.seed);
  const driftTime = elapsed * (0.12 + Number(state.flow) * 0.2);
  const driftAmount = 0.55 * (0.5 + Number(state.turbulence) * 0.25);

  for (let index = 0; index < MAX_BLOBS; index += 1) {
    const fi = index;
    const dx = snoise3(fi * 13.54 + 2.1 + seed * 7.13, 4.3, driftTime * 0.6) * driftAmount;
    const dy = snoise3(fi * 27.81 + 9.7 + seed * 3.71, 15.4, driftTime * 0.6) * driftAmount;
    const theta = fi * GOLDEN_ANGLE + seed * 0.37;
    const spreadFactor = 0.18 * Math.sqrt(fi + 1);
    blobCenters[index * 2] = Math.cos(theta) * spreadFactor + dx;
    blobCenters[index * 2 + 1] = Math.sin(theta) * spreadFactor + dy;
  }

  return blobCenters;
}

const textCanvas = document.createElement('canvas');
textCanvas.width = 1024;
textCanvas.height = 1024;
const textContext = textCanvas.getContext('2d');
const textTexture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, textTexture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);


function drawTrackedText(context, text, x, y, spacing) {
  if (!spacing) {
    context.fillText(text, x, y);
    return;
  }
  const glyphs = [...text];
  const widths = glyphs.map((glyph) => context.measureText(glyph).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + spacing * Math.max(0, glyphs.length - 1);
  let cursor = x - total / 2;
  context.textAlign = 'left';
  glyphs.forEach((glyph, index) => {
    context.fillText(glyph, cursor, y);
    cursor += widths[index] + spacing;
  });
  context.textAlign = 'center';
}

function updateTextTexture() {
  textDirty = false;
  const ctx = textContext;
  ctx.clearRect(0, 0, textCanvas.width, textCanvas.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 174px "${state.fontFamily}", sans-serif`;
  const lines = state.textContent.replace(/\\n/g, '\n').split('\n').slice(0, 5);
  const lineHeight = 166;
  const firstY = textCanvas.height / 2 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, index) => drawTrackedText(ctx, line, textCanvas.width / 2, firstY + index * lineHeight, state.letterSpacing));
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
}

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function setColor(location, hex) {
  const [r, g, b] = hexToRgb(hex);
  gl.uniform3f(location, r, g, b);
}

function layoutPreviewCanvas() {
  const bounds = previewStage.getBoundingClientRect();
  const aspect = Number(state.canvasWidth) / Math.max(1, Number(state.canvasHeight));
  let width = Math.max(1, bounds.width);
  let height = width / aspect;

  if (height > bounds.height) {
    height = Math.max(1, bounds.height);
    width = height * aspect;
  }

  canvas.style.width = `${Math.floor(width)}px`;
  canvas.style.height = `${Math.floor(height)}px`;
}

function resizeCanvas(force = false, targetSize = null) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25) * Number(state.renderScale);
  const width = targetSize?.width ?? Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
  const height = targetSize?.height ?? Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
  if (force || canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  }
}

let elapsed = 0;
let previousTime = performance.now();
let previousFrame = 0;
let frameCounter = 0;
let fpsWindowStart = performance.now();

function render(now = performance.now(), force = false, targetSize = null) {
  if (exportInProgress && !targetSize) return;
  const minFrameTime = 1000 / Number(state.fps);
  if (!force && now - previousFrame < minFrameTime - 1) return;
  previousFrame = now;
  const delta = Math.min(0.1, (now - previousTime) / 1000);
  previousTime = now;
  if (isAnimating) elapsed += delta * Number(state.speed);

  resizeCanvas(Boolean(targetSize), targetSize);
  if (textDirty) updateTextTexture();
  gl.useProgram(program);
  gl.bindVertexArray(vao);
  gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
  gl.uniform1f(uniforms.uTime, elapsed);
  gl.uniform1f(uniforms.uMode, Number(state.mode));
  gl.uniform1f(uniforms.uDensity, Number(state.density));
  gl.uniform1f(uniforms.uScale, Number(state.scale));
  gl.uniform1f(uniforms.uDistortion, Number(state.distortion));
  gl.uniform1f(uniforms.uSwirl, Number(state.swirl));
  gl.uniform2f(uniforms.uCenter, Number(state.centerX), Number(state.centerY));
  gl.uniform1f(uniforms.uShowBlobs, state.showBlobs ? 1 : 0);
  gl.uniform1f(uniforms.uBlobCount, Number(state.blobCount));
  gl.uniform2fv(uniforms.uBlobCenters, updateBlobCenters());
  gl.uniform1f(uniforms.uBlobSize, Number(state.blobSize));
  gl.uniform1f(uniforms.uLiquidTexture, Number(state.liquidTexture));
  gl.uniform1f(uniforms.uSeparation, Number(state.separation));
  gl.uniform1f(uniforms.uSoftness, Number(state.softness));
  gl.uniform1f(uniforms.uEdgeWidth, Number(state.edgeWidth));
  gl.uniform1f(uniforms.uFlow, Number(state.flow));
  gl.uniform1f(uniforms.uTurbulence, Number(state.turbulence));
  gl.uniform1f(uniforms.uSeed, Number(state.seed));
  setColor(uniforms.uBaseColor, state.baseColor);
  setColor(uniforms.uBodyColor, state.bodyColor);
  setColor(uniforms.uMidColor, state.midColor);
  setColor(uniforms.uEdgeColor, state.edgeColor);
  gl.uniform1f(uniforms.uGrain, Number(state.grain));
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textTexture);
  gl.uniform1i(uniforms.uTextTexture, 0);
  gl.uniform1f(uniforms.uShowText, state.showText ? 1 : 0);
  gl.uniform1f(uniforms.uTextSize, Number(state.textSize));
  gl.uniform1f(uniforms.uTextSoftness, Number(state.textSoftness));
  setColor(uniforms.uTextColor, state.textColor);
  gl.uniform1f(uniforms.uTextBlend, Number(state.textBlend));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  frameCounter += 1;
  if (now - fpsWindowStart > 1000) {
    fpsEl.textContent = `${Math.round(frameCounter * 1000 / (now - fpsWindowStart))} fps`;
    frameCounter = 0;
    fpsWindowStart = now;
  }
}

function animationLoop(now) {
  if (!exportInProgress) render(now);
  requestAnimationFrame(animationLoop);
}

function formatValue(key, value) {
  if (key === 'blobCount' || key === 'seed' || key === 'letterSpacing') return Math.round(value).toString();
  return Number(value).toFixed(2).replace(/\.00$/, '');
}

function paintRange(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  input.style.setProperty('--fill', `${((value - min) / (max - min)) * 100}%`);
}

function syncControls() {
  document.querySelectorAll('[data-key]').forEach((input) => {
    const key = input.dataset.key;
    if (input.type === 'checkbox') input.checked = Boolean(state[key]);
    else input.value = state[key];
    if (input.type === 'range') paintRange(input);
  });
  document.querySelectorAll('[data-output]').forEach((output) => {
    const key = output.dataset.output;
    output.value = formatValue(key, state[key]);
  });
}

const aspectPresets = Object.freeze({
  '16:9': [1920, 1080],
  '4:3': [1600, 1200],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
  '9:16': [1080, 1920],
});

function syncDimensionControls() {
  document.querySelectorAll('[data-key="canvasWidth"]').forEach((input) => { input.value = state.canvasWidth; });
  document.querySelectorAll('[data-key="canvasHeight"]').forEach((input) => { input.value = state.canvasHeight; });
  document.querySelectorAll('[data-key="aspectRatio"]').forEach((input) => { input.value = state.aspectRatio; });
}

function refreshPreviewLayout() {
  layoutPreviewCanvas();
  resizeCanvas(true);
  render(performance.now(), true);
}

const textKeys = new Set(['textContent', 'fontFamily', 'letterSpacing']);
document.querySelectorAll('[data-key]').forEach((input) => {
  const onValueChange = () => {
    const key = input.dataset.key;
    let previewLayoutChanged = false;
    if (input.type === 'checkbox') state[key] = input.checked;
    else if (typeof defaults[key] === 'number') {
      const nextValue = Number(input.value);
      if (!Number.isFinite(nextValue)) return;
      state[key] = nextValue;
    }
    else state[key] = input.value;

    if (key === 'aspectRatio' && aspectPresets[state.aspectRatio]) {
      [state.canvasWidth, state.canvasHeight] = aspectPresets[state.aspectRatio];
      syncDimensionControls();
      previewLayoutChanged = true;
    } else if (key === 'canvasWidth' || key === 'canvasHeight') {
      state[key] = Math.min(8192, Math.max(320, Math.round(state[key])));
      state.aspectRatio = 'custom';
      syncDimensionControls();
      previewLayoutChanged = true;
    }

    if (textKeys.has(key)) textDirty = true;
    if (input.type === 'range') {
      paintRange(input);
      const output = document.querySelector(`[data-output="${key}"]`);
      if (output) output.value = formatValue(key, state[key]);
    }
    if (key === 'renderScale') resizeCanvas(true);
    if (key === 'exportResolution') {
      document.querySelectorAll('[data-key="exportResolution"]').forEach((el) => {
        if (el !== input) el.value = state.exportResolution;
      });
    }
    updateFavoriteIndicator();
    if (previewLayoutChanged) refreshPreviewLayout();
    else render(performance.now(), true);
  };
  input.addEventListener('input', onValueChange);
  input.addEventListener('change', onValueChange);
});

document.querySelectorAll('.section-title').forEach((button) => {
  button.addEventListener('click', () => {
    const section = button.closest('.control-section');
    section.toggleAttribute('open');
    button.setAttribute('aria-expanded', section.hasAttribute('open'));
  });
});

function showStatus(message, duration = 2200) {
  window.clearTimeout(toastTimer);
  statusEl.textContent = message;
  statusEl.classList.add('show');
  toastTimer = window.setTimeout(() => statusEl.classList.remove('show'), duration);
}

function setPanel(open) {
  document.querySelector('#control-panel').classList.toggle('closed', !open);
  document.querySelector('#panel-toggle').setAttribute('aria-expanded', String(open));
  document.querySelector('#open-panel').classList.toggle('visible', !open);
  document.body.classList.toggle('panel-hidden', !open);
  window.requestAnimationFrame(refreshPreviewLayout);
  window.setTimeout(refreshPreviewLayout, 360);
}

document.querySelector('#panel-toggle').addEventListener('click', () => setPanel(false));
document.querySelector('#open-panel').addEventListener('click', () => setPanel(true));

const controlPanel = document.querySelector('#control-panel');
const advancedToggle = document.querySelector('#advanced-toggle');
advancedToggle.addEventListener('click', () => {
  const isOpen = controlPanel.classList.toggle('advanced-open');
  advancedToggle.setAttribute('aria-expanded', String(isOpen));
  advancedToggle.querySelector('i').textContent = isOpen ? '−' : '+';
  showStatus(isOpen ? 'Advanced controls shown' : 'Basic controls shown');
});

document.querySelector('#toggle-motion').addEventListener('click', (event) => {
  isAnimating = !isAnimating;
  event.currentTarget.textContent = isAnimating ? 'Pause' : 'Play';
  previousTime = performance.now();
  showStatus(isAnimating ? 'Motion resumed' : 'Motion paused');
});

const palettes = [
  ['#650000', '#fff7ce', '#ff5909', '#f54a00'],
  ['#0a1642', '#627bff', '#ff4fb8', '#c5d4ff'],
  ['#10281e', '#b0d633', '#29a870', '#e3ff78'],
  ['#21102f', '#ff773d', '#a23bff', '#ffca6e'],
  ['#e9ddd0', '#1f1d1a', '#ca3d2a', '#ff8b55'],
];

const FAVORITES_KEY = 'nuf-pattern-favorites-v1';
const favoriteList = document.querySelector('#favorite-list');
const favoriteNameInput = document.querySelector('#favorite-name');
const saveFavoriteButton = document.querySelector('#save-favorite');
const loadFavoriteButton = document.querySelector('#load-favorite');
const renameFavoriteButton = document.querySelector('#rename-favorite');
const deleteFavoriteButton = document.querySelector('#delete-favorite');
const downloadPresetButton = document.querySelector('#download-preset');
const uploadPresetButton = document.querySelector('#upload-preset-btn');
const presetFileInput = document.querySelector('#preset-file-input');

function readFavorites() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let favorites = readFavorites();

function currentPresetState() {
  return Object.fromEntries(Object.keys(defaults).map((key) => [key, state[key]]));
}

function writeFavorites() {
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    return true;
  } catch {
    showStatus('This browser could not save the favorite');
    return false;
  }
}

function refreshFavoriteList(selectedId = favoriteList.value) {
  favoriteList.replaceChildren();
  if (!favorites.length) {
    const option = new Option('No saved favorites', '');
    favoriteList.add(option);
  } else {
    favorites.forEach((favorite) => favoriteList.add(new Option(favorite.name, favorite.id)));
    favoriteList.value = favorites.some(({ id }) => id === selectedId) ? selectedId : favorites[0].id;
  }
  const hasFavorite = Boolean(favoriteList.value);
  const selectedFavorite = favorites.find(({ id }) => id === favoriteList.value);
  favoriteNameInput.value = selectedFavorite?.name || '';
  favoriteNameInput.disabled = !hasFavorite;
  favoriteNameInput.placeholder = hasFavorite ? 'Preset name' : 'Choose a favorite first';
  loadFavoriteButton.disabled = !hasFavorite;
  renameFavoriteButton.disabled = !hasFavorite;
  deleteFavoriteButton.disabled = !hasFavorite;
}

function updateFavoriteIndicator() {
  const serialized = JSON.stringify(currentPresetState());
  const matchesFavorite = favorites.some(({ preset }) => JSON.stringify(preset) === serialized);
  saveFavoriteButton.classList.toggle('saved', matchesFavorite);
  saveFavoriteButton.textContent = matchesFavorite ? '★' : '☆';
}

saveFavoriteButton.addEventListener('click', () => {
  const now = new Date();
  const favorite = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    name: `Favorite ${favorites.length + 1} · ${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
    preset: currentPresetState(),
  };
  favorites = [favorite, ...favorites].slice(0, 20);
  if (!writeFavorites()) return;
  refreshFavoriteList(favorite.id);
  updateFavoriteIndicator();
  showStatus('Preset saved to favorites');
});

favoriteList.addEventListener('change', () => refreshFavoriteList(favoriteList.value));

function renameSelectedFavorite() {
  const favorite = favorites.find(({ id }) => id === favoriteList.value);
  if (!favorite) return;
  const nextName = favoriteNameInput.value.trim();
  if (!nextName) {
    showStatus('Preset name cannot be empty');
    favoriteNameInput.focus();
    return;
  }
  favorite.name = nextName.slice(0, 48);
  if (!writeFavorites()) return;
  refreshFavoriteList(favorite.id);
  showStatus('Favorite renamed');
}

renameFavoriteButton.addEventListener('click', renameSelectedFavorite);
favoriteNameInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  renameSelectedFavorite();
});

function applyPresetValues(presetValues) {
  if (!presetValues || typeof presetValues !== 'object') return 0;
  let matched = 0;
  Object.keys(defaults).forEach((key) => {
    const value = presetValues[key];
    if (value !== undefined && typeof value === typeof defaults[key]) {
      state[key] = value;
      matched++;
    }
  });
  return matched;
}

loadFavoriteButton.addEventListener('click', () => {
  const favorite = favorites.find(({ id }) => id === favoriteList.value);
  if (!favorite) return;
  applyPresetValues(favorite.preset);
  textDirty = true;
  syncControls();
  syncDimensionControls();
  refreshPreviewLayout();
  updateFavoriteIndicator();
  render(performance.now(), true);
  showStatus(`${favorite.name} loaded`);
});

deleteFavoriteButton.addEventListener('click', () => {
  const selectedId = favoriteList.value;
  if (!selectedId) return;
  favorites = favorites.filter(({ id }) => id !== selectedId);
  if (!writeFavorites()) return;
  refreshFavoriteList();
  updateFavoriteIndicator();
  showStatus('Favorite deleted');
});

function handlePresetDownload() {
  const selectedFavorite = favorites.find(({ id }) => id === favoriteList.value);
  const activeName = favoriteNameInput.value.trim() || selectedFavorite?.name || 'NUF Pattern Preset';
  const safeSlug = activeName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'nuf-preset';
  const data = {
    app: 'NUF Pattern Studio',
    version: 1,
    name: activeName,
    exportedAt: new Date().toISOString(),
    preset: currentPresetState(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${safeSlug}.json`);
  showStatus(`Preset "${activeName}" downloaded as JSON`);
}

async function handlePresetFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') {
      showStatus('Invalid JSON format');
      return;
    }
    const presetData = (parsed.preset && typeof parsed.preset === 'object') ? parsed.preset : parsed;
    const matchedCount = applyPresetValues(presetData);
    if (matchedCount === 0) {
      showStatus('No valid preset parameters found in file');
      return;
    }
    const rawName = (typeof parsed.name === 'string' && parsed.name.trim())
      ? parsed.name.trim()
      : file.name.replace(/\.json$/i, '').trim();
    const presetName = (rawName || 'Imported preset').slice(0, 48);

    textDirty = true;
    syncControls();
    syncDimensionControls();
    refreshPreviewLayout();
    render(performance.now(), true);

    const now = new Date();
    const importedFavorite = {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
      name: presetName,
      preset: currentPresetState(),
    };
    favorites = [importedFavorite, ...favorites.filter((f) => f.name !== presetName)].slice(0, 25);
    writeFavorites();
    refreshFavoriteList(importedFavorite.id);
    updateFavoriteIndicator();
    showStatus(`Preset "${presetName}" loaded & saved`);
  } catch {
    showStatus('Could not read or parse JSON file');
  }
}

downloadPresetButton?.addEventListener('click', handlePresetDownload);
uploadPresetButton?.addEventListener('click', () => presetFileInput?.click());
presetFileInput?.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (file) handlePresetFile(file);
  event.target.value = '';
});

window.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
});

window.addEventListener('drop', (event) => {
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (file && (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json')) {
    handlePresetFile(file);
  }
});

document.querySelector('#randomize').addEventListener('click', () => {
  const palette = palettes[Math.floor(Math.random() * palettes.length)];
  [state.baseColor, state.bodyColor, state.midColor, state.edgeColor] = palette;
  state.seed = Math.floor(Math.random() * 13);
  state.density = Number((1.4 + Math.random() * 2.6).toFixed(1));
  state.distortion = Number((0.45 + Math.random() * 1.7).toFixed(2));
  state.swirl = Number((-2 + Math.random() * 4).toFixed(2));
  state.blobCount = Math.floor(4 + Math.random() * 9);
  state.blobSize = Number((0.7 + Math.random() * 1.3).toFixed(2));
  syncControls();
  updateFavoriteIndicator();
  render(performance.now(), true);
  showStatus('New pattern generated');
});

document.querySelector('#reset-controls').addEventListener('click', () => {
  Object.assign(state, defaults);
  controlPanel.classList.remove('advanced-open');
  advancedToggle.setAttribute('aria-expanded', 'false');
  advancedToggle.querySelector('i').textContent = '+';
  textDirty = true;
  syncControls();
  syncDimensionControls();
  refreshPreviewLayout();
  updateFavoriteIndicator();
  showStatus('Controls reset');
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.querySelector('#export-png').addEventListener('click', () => {
  if (exportInProgress) return;
  const multiplier = Number(state.exportResolution);
  const exportLabel = multiplier === 4 ? '8K' : multiplier === 2 ? '4K' : '2K';
  const exportSize = {
    width: Math.round(Number(state.canvasWidth) * multiplier),
    height: Math.round(Number(state.canvasHeight) * multiplier),
  };
  const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  const maxDimension = Math.min(maxViewport[0], maxViewport[1], gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));

  if (exportSize.width > maxDimension || exportSize.height > maxDimension) {
    showStatus(`${exportLabel} export is not supported by this GPU`);
    return;
  }

  exportInProgress = true;
  showStatus(`Rendering ${exportLabel} · ${exportSize.width}×${exportSize.height}…`, 8000);
  requestAnimationFrame(() => {
    render(performance.now(), true, exportSize);
    gl.finish();
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `nuf-pattern-${exportLabel.toLowerCase()}-${exportSize.width}x${exportSize.height}-${Date.now()}.png`);
      exportInProgress = false;
      resizeCanvas(true);
      render(performance.now(), true);
      showStatus(blob ? `${exportLabel} PNG exported` : 'PNG export failed');
    }, 'image/png');
  });
});

let recorder = null;
let recordTimer = 0;
document.querySelector('#record-video').addEventListener('click', (event) => {
  if (recorder?.state === 'recording') {
    recorder.stop();
    return;
  }
  if (!window.MediaRecorder) {
    showStatus('Video recording is not supported in this browser');
    return;
  }
  const chunks = [];
  const stream = canvas.captureStream(Math.min(30, Number(state.fps)));
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  recorder.ondataavailable = ({ data }) => data.size && chunks.push(data);
  recorder.onstop = () => {
    window.clearTimeout(recordTimer);
    downloadBlob(new Blob(chunks, { type: mimeType }), `nuf-pattern-${Date.now()}.webm`);
    event.currentTarget.textContent = 'Record 6s video';
    showStatus('Video exported');
  };
  recorder.start(100);
  event.currentTarget.textContent = 'Stop recording';
  showStatus('Recording 6 seconds…');
  recordTimer = window.setTimeout(() => recorder?.state === 'recording' && recorder.stop(), 6000);
});

window.addEventListener('resize', refreshPreviewLayout, { passive: true });
document.addEventListener('visibilitychange', () => { previousTime = performance.now(); });
document.fonts?.ready.then(() => { textDirty = true; });

syncControls();
syncDimensionControls();
refreshFavoriteList();
updateFavoriteIndicator();
layoutPreviewCanvas();
resizeCanvas(true);
requestAnimationFrame(animationLoop);
