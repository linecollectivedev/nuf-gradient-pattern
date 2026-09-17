const canvas = document.querySelector('#pattern-canvas');
const previewStage = document.querySelector('#preview-stage');
const topbar = document.querySelector('.topbar');
const statusEl = document.querySelector('#status');

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
  float density = max(0.75, uDensity);
  float noiseScale = uScale * 1.3;
  float threshold = mix(0.4, 2.0, clamp(uSeparation / 4.0, 0.0, 1.0));
  float dist;

  if (mode < 0.5) {
    // Liquid Voronoi: independently drifting metaballs fuse into broad organic
    // continents. Swirl bends the field without making it rotate as one piece.
    vec2 liquidP = rotate2d(uSwirl * (0.13 + length(p) * 0.22)) * p;
    vec2 evalP = liquidP * (noiseScale * 0.5);
    float deform = uLiquidTexture * 0.15;
    vec3 warpPos = vec3(liquidP * noiseScale, t * 0.3);
    evalP.x += snoise(warpPos) * deform;
    evalP.y += snoise(warpPos + vec3(11.7, 43.1, 9.8)) * deform;
    float detailAmount = deform * uTurbulence * 0.22;
    vec3 detailPos = vec3(liquidP * noiseScale * (1.6 + density * 0.45), t * 0.45);
    evalP.x += snoise(detailPos) * detailAmount;
    evalP.y += snoise(detailPos + vec3(31.4, 7.9, 22.6)) * detailAmount;
    dist = threshold - blobPotential(evalP);
  } else if (mode < 1.5) {
    // Radial flow: rotating spiral bands pulse out from the chosen centre.
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float radialWarp = fbm(vec3(p * (1.6 + noiseScale), t * 0.14 + uSeed), 3);
    float spiral = radius * (10.0 + density * 2.5) * max(0.45, noiseScale)
      + sin(angle * 2.0 + t * 0.38) * (0.7 + uSwirl * 1.15)
      - t * (1.0 + uFlow * 1.7)
      + radialWarp * (1.3 + uTurbulence * 0.35);
    float spokes = sin(radius * (19.0 + density * 2.0) + angle * 3.0 + t * 0.45);
    float radialField = sin(spiral) * 0.82 + spokes * 0.18;
    dist = 0.34 - radialField * (0.54 + uDistortion * 0.08);
  } else if (mode < 2.5) {
    // Falling flow: long, bending ribbons descend at different apparent speeds.
    vec2 fallingP = p;
    fallingP.y += t * (0.12 + uFlow * 0.3);
    float sideDrift = snoise(vec3(fallingP.y * 1.15, p.x * 1.7, t * 0.18 + uSeed))
      * (0.22 + uTurbulence * 0.055);
    float columnPhase = (p.x + sideDrift) * (8.0 + density * 2.1) * max(0.5, noiseScale);
    float stream = cos(columnPhase + sin(fallingP.y * 3.2) * (0.7 + uSwirl * 0.45));
    float droplets = cos(fallingP.y * (7.0 + density) - t * (0.8 + uFlow)
      + sin(columnPhase) * 1.35);
    float fallingField = stream * 0.74 + droplets * 0.26;
    dist = 0.31 - fallingField * (0.56 + uDistortion * 0.08);
  } else {
    // Field contours: animated topographic isolines cross a slowly evolving
    // terrain field. Unlike the filled flow modes, negative distance exists
    // only close to a contour, producing a clearly line-based pattern.
    vec2 contourP = rotate2d(uSwirl * 0.18) * p;
    float terrain = fbm(vec3(contourP * (1.1 + density * 0.16) * max(0.55, noiseScale), t * 0.08 + uSeed), 4);
    terrain += snoise(vec3(contourP * 0.55 + 7.4, t * 0.045)) * (0.18 + uTurbulence * 0.02);
    float contourBands = 3.0 + density * 0.55;
    float contourDistance = abs(fract(terrain * contourBands + t * uFlow * 0.035) - 0.5);
    float contourWidth = 0.075 + uLiquidTexture * 0.035 + uDistortion * 0.012;
    dist = (contourDistance - contourWidth) * (4.2 + uEdgeWidth * 1.8);
  }

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

  const canvasBounds = canvas.getBoundingClientRect();
  const topbarBounds = topbar.getBoundingClientRect();
  topbar.style.setProperty('--brand-offset-x', `${Math.max(0, Math.round(canvasBounds.left - topbarBounds.left))}px`);
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

function render(now = performance.now(), force = false, targetSize = null) {
  if (exportInProgress && !targetSize) return;
  const minFrameTime = 1000 / Number(state.fps);
  if (!force && now - previousFrame < minFrameTime - 1) return;
  previousFrame = now;
  const delta = Math.min(0.1, (now - previousTime) / 1000);
  previousTime = now;
  if (isAnimating) elapsed += delta * Number(state.speed);

  const renderSize = targetSize || animationExportSize;
  resizeCanvas(Boolean(renderSize), renderSize);
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

const colorLabels = Object.freeze({
  baseColor: 'Base Color',
  bodyColor: 'Body Color',
  midColor: 'Mid Color',
  edgeColor: 'Edge Color',
});

const colorPicker = document.querySelector('#color-picker');
const colorPickerTitle = document.querySelector('#color-picker-title');
const colorPickerDot = document.querySelector('#color-picker-dot');
const colorField = document.querySelector('#color-field');
const colorHue = document.querySelector('#color-hue');
const colorHex = document.querySelector('#color-hex');
const colorFormat = document.querySelector('#color-format');
const eyeDropperButton = document.querySelector('#color-eyedropper');
const colorPickerFooter = colorPicker.querySelector('.color-picker-footer');
let activeColorKey = null;
let activeColorButton = null;
let pickerHsv = { h: 0, s: 0, v: 0 };

function normalizeHex(value) {
  const raw = String(value).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(raw)) return `#${raw.split('').map((char) => char + char).join('').toLowerCase()}`;
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`;
  return null;
}

function hexToRgb255(hex) {
  const value = normalizeHex(hex) || '#000000';
  return {
    r: parseInt(value.slice(1, 3), 16),
    g: parseInt(value.slice(3, 5), 16),
    b: parseInt(value.slice(5, 7), 16),
  };
}

function rgbToHex(r, g, b) {
  const channels = [r, g, b].map(Number);
  if (channels.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)) return null;
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

function hexToHsv(hex) {
  const value = normalizeHex(hex) || '#000000';
  const r = parseInt(value.slice(1, 3), 16) / 255;
  const g = parseInt(value.slice(3, 5), 16) / 255;
  const b = parseInt(value.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max ? delta / max : 0, v: max };
}

function hsvToHex({ h, s, v }) {
  const chroma = v * s;
  const segment = h / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const m = v - chroma;
  let rgb = [0, 0, 0];
  if (segment < 1) rgb = [chroma, x, 0];
  else if (segment < 2) rgb = [x, chroma, 0];
  else if (segment < 3) rgb = [0, chroma, x];
  else if (segment < 4) rgb = [0, x, chroma];
  else if (segment < 5) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return `#${rgb.map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function hslToHex(h, s, l) {
  if (![h, s, l].every(Number.isFinite) || s < 0 || s > 100 || l < 0 || l > 100) return null;
  const hue = ((h % 360) + 360) % 360;
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const m = lightness - chroma / 2;
  let rgb = [0, 0, 0];
  if (segment < 1) rgb = [chroma, x, 0];
  else if (segment < 2) rgb = [x, chroma, 0];
  else if (segment < 3) rgb = [0, chroma, x];
  else if (segment < 4) rgb = [0, x, chroma];
  else if (segment < 5) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return rgbToHex(...rgb.map((channel) => (channel + m) * 255));
}

const colorPlaceholders = Object.freeze({
  hex: '#RRGGBB',
  rgb: '255, 128, 64',
  css: 'color: #FF8040;',
  hsl: '20°, 100%, 63%',
  hsb: '20°, 75%, 100%',
});

function formatColorValue(hex, format = colorFormat.value) {
  const normalized = normalizeHex(hex) || '#000000';
  const { r, g, b } = hexToRgb255(normalized);
  const hsv = hexToHsv(normalized);
  const lightness = hsv.v * (1 - hsv.s / 2);
  const hslSaturation = lightness === 0 || lightness === 1 ? 0 : (hsv.v - lightness) / Math.min(lightness, 1 - lightness);
  const hue = Math.round(hsv.h);
  if (format === 'rgb') return `${r}, ${g}, ${b}`;
  if (format === 'css') return `color: ${normalized.toUpperCase()};`;
  if (format === 'hsl') return `${hue}°, ${Math.round(hslSaturation * 100)}%, ${Math.round(lightness * 100)}%`;
  if (format === 'hsb') return `${hue}°, ${Math.round(hsv.s * 100)}%, ${Math.round(hsv.v * 100)}%`;
  return normalized.toUpperCase();
}

function parseColorValue(value, format = colorFormat.value) {
  const raw = String(value).trim();
  if (format === 'hex') return normalizeHex(raw);
  if (format === 'css') {
    const cssValue = raw.replace(/^color\s*:\s*/i, '').replace(/;$/, '').trim();
    const hex = normalizeHex(cssValue);
    if (hex) return hex;
    const cssNumbers = cssValue.match(/-?\d*\.?\d+/g)?.map(Number) || [];
    if (/^rgb/i.test(cssValue) && cssNumbers.length >= 3) return rgbToHex(...cssNumbers.slice(0, 3));
    if (/^hsl/i.test(cssValue) && cssNumbers.length >= 3) return hslToHex(...cssNumbers.slice(0, 3));
    return null;
  }
  const numbers = raw.match(/-?\d*\.?\d+/g)?.map(Number) || [];
  if (numbers.length < 3) return null;
  if (format === 'rgb') return rgbToHex(...numbers.slice(0, 3));
  if (format === 'hsl') return hslToHex(...numbers.slice(0, 3));
  if (format === 'hsb') {
    const [h, s, b] = numbers;
    if (![h, s, b].every(Number.isFinite) || s < 0 || s > 100 || b < 0 || b > 100) return null;
    return hsvToHex({ h: ((h % 360) + 360) % 360, s: s / 100, v: b / 100 });
  }
  return null;
}

function syncColorSwatches() {
  Object.keys(colorLabels).forEach((key) => {
    const swatch = document.querySelector(`[data-color-swatch="${key}"]`);
    if (swatch) swatch.style.setProperty('--swatch', state[key]);
  });
}

function syncPickerVisuals(updateInput = true) {
  if (!activeColorKey) return;
  const hex = state[activeColorKey];
  colorPicker.style.setProperty('--picker-hue', pickerHsv.h);
  colorPicker.style.setProperty('--picker-s', `${pickerHsv.s * 100}%`);
  colorPicker.style.setProperty('--picker-v', `${(1 - pickerHsv.v) * 100}%`);
  colorPicker.style.setProperty('--picker-color', hex);
  colorHue.value = Math.round(pickerHsv.h);
  colorPickerDot.style.background = hex;
  colorHex.placeholder = colorPlaceholders[colorFormat.value];
  if (updateInput) colorHex.value = formatColorValue(hex);
  colorHex.setAttribute('aria-invalid', 'false');
  colorField.setAttribute('aria-valuenow', Math.round(pickerHsv.v * 100));
}

function applyPickerColor(hex, updateInput = true) {
  if (!activeColorKey) return;
  state[activeColorKey] = hex;
  syncColorSwatches();
  syncPickerVisuals(updateInput);
  updateFavoriteIndicator();
  render(performance.now(), true);
}

function positionColorPicker() {
  if (!activeColorButton || colorPicker.hidden) return;
  const rect = activeColorButton.getBoundingClientRect();
  const pickerWidth = colorPicker.offsetWidth;
  const pickerHeight = colorPicker.offsetHeight;
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const gap = 12;
  const minLeft = viewportLeft + gap;
  const maxLeft = Math.max(minLeft, viewportLeft + viewportWidth - pickerWidth - gap);
  const minTop = viewportTop + gap;
  const maxTop = Math.max(minTop, viewportTop + viewportHeight - pickerHeight - gap);
  const isMobile = window.matchMedia('(max-width: 700px)').matches;
  const preferredLeft = isMobile
    ? viewportLeft + (viewportWidth - pickerWidth) / 2
    : (rect.left - pickerWidth - gap >= minLeft ? rect.left - pickerWidth - gap : rect.right - pickerWidth);
  const preferredTop = isMobile
    ? viewportTop + (viewportHeight - pickerHeight) / 2
    : rect.top - 80;
  const left = Math.min(maxLeft, Math.max(minLeft, preferredLeft));
  const top = Math.min(maxTop, Math.max(minTop, preferredTop));
  colorPicker.style.left = `${left}px`;
  colorPicker.style.top = `${top}px`;
}

function syncVisualViewport() {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const top = viewport?.offsetTop ?? 0;
  document.documentElement.style.setProperty('--visual-viewport-height', `${height}px`);
  document.documentElement.style.setProperty('--visual-viewport-top', `${top}px`);
  positionColorPicker();
}

function openColorPicker(button) {
  if (activeColorButton && activeColorButton !== button) activeColorButton.setAttribute('aria-expanded', 'false');
  activeColorButton = button;
  activeColorKey = button.dataset.colorKey;
  pickerHsv = hexToHsv(state[activeColorKey]);
  colorPickerTitle.textContent = colorLabels[activeColorKey];
  button.setAttribute('aria-expanded', 'true');
  colorPicker.hidden = false;
  syncPickerVisuals();
  positionColorPicker();
  colorHex.focus();
  colorHex.select();
}

function closeColorPicker({ restoreFocus = false } = {}) {
  if (colorPicker.hidden) return;
  colorPicker.hidden = true;
  activeColorButton?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) activeColorButton?.focus();
  activeColorButton = null;
  activeColorKey = null;
}

function updateFieldFromPointer(event) {
  const rect = colorField.getBoundingClientRect();
  pickerHsv.s = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  pickerHsv.v = 1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  applyPickerColor(hsvToHex(pickerHsv));
}

document.querySelectorAll('[data-color-key]').forEach((button) => {
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', () => {
    if (activeColorButton === button && !colorPicker.hidden) closeColorPicker({ restoreFocus: true });
    else openColorPicker(button);
  });
});

colorField.addEventListener('pointerdown', (event) => {
  colorField.setPointerCapture(event.pointerId);
  updateFieldFromPointer(event);
});
colorField.addEventListener('pointermove', (event) => {
  if (colorField.hasPointerCapture(event.pointerId)) updateFieldFromPointer(event);
});
colorField.addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 0.05 : 0.01;
  if (event.key === 'ArrowLeft') pickerHsv.s = Math.max(0, pickerHsv.s - step);
  else if (event.key === 'ArrowRight') pickerHsv.s = Math.min(1, pickerHsv.s + step);
  else if (event.key === 'ArrowUp') pickerHsv.v = Math.min(1, pickerHsv.v + step);
  else if (event.key === 'ArrowDown') pickerHsv.v = Math.max(0, pickerHsv.v - step);
  else return;
  event.preventDefault();
  applyPickerColor(hsvToHex(pickerHsv));
});
colorHue.addEventListener('input', () => {
  pickerHsv.h = Number(colorHue.value);
  applyPickerColor(hsvToHex(pickerHsv));
});
colorFormat.addEventListener('change', () => {
  syncPickerVisuals();
  colorHex.focus();
  colorHex.select();
});
colorHex.addEventListener('focus', () => colorHex.select());
colorHex.addEventListener('mouseup', (event) => event.preventDefault());
colorHex.addEventListener('input', () => {
  const raw = colorHex.value.trim();
  const normalized = parseColorValue(raw);
  colorHex.setAttribute('aria-invalid', String(Boolean(raw) && !normalized));
  if (!normalized) return;
  pickerHsv = hexToHsv(normalized);
  applyPickerColor(normalized, false);
});
colorHex.addEventListener('paste', (event) => {
  const normalized = parseColorValue(event.clipboardData?.getData('text') || '');
  event.preventDefault();
  if (!normalized) {
    colorHex.setAttribute('aria-invalid', 'true');
    showStatus(`Paste a valid ${colorFormat.options[colorFormat.selectedIndex].text} color value`);
    return;
  }
  pickerHsv = hexToHsv(normalized);
  applyPickerColor(normalized);
  colorHex.setSelectionRange(0, colorHex.value.length);
  showStatus(`${colorHex.value} applied`);
});
colorHex.addEventListener('copy', () => {
  if (activeColorKey) showStatus(`${colorHex.value} copied`);
});

function commitColorInput() {
  const normalized = parseColorValue(colorHex.value);
  if (!normalized) {
    colorHex.setAttribute('aria-invalid', 'true');
    colorHex.value = formatColorValue(state[activeColorKey] || '#000000');
    return false;
  }
  pickerHsv = hexToHsv(normalized);
  applyPickerColor(normalized);
  return true;
}

colorHex.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    if (commitColorInput()) colorHex.select();
  }
});
colorHex.addEventListener('blur', commitColorInput);
document.querySelector('#color-picker-close').addEventListener('click', () => closeColorPicker({ restoreFocus: true }));

function hideScreenColorPicker() {
  eyeDropperButton.hidden = true;
  colorPickerFooter.classList.add('without-eyedropper');
}

if ('EyeDropper' in window && window.isSecureContext) {
  eyeDropperButton.addEventListener('click', async () => {
    try {
      const result = await new window.EyeDropper().open();
      const normalized = normalizeHex(result.sRGBHex);
      if (normalized) {
        pickerHsv = hexToHsv(normalized);
        applyPickerColor(normalized);
        colorHex.focus();
        colorHex.select();
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      hideScreenColorPicker();
      showStatus('Screen color picker is unavailable in this browser');
    }
  });
} else {
  hideScreenColorPicker();
}

document.addEventListener('pointerdown', (event) => {
  if (!colorPicker.hidden && !colorPicker.contains(event.target) && !event.target.closest('[data-color-key]')) closeColorPicker();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !colorPicker.hidden) closeColorPicker({ restoreFocus: true });
});
window.addEventListener('resize', syncVisualViewport, { passive: true });
window.visualViewport?.addEventListener('resize', syncVisualViewport, { passive: true });
window.visualViewport?.addEventListener('scroll', syncVisualViewport, { passive: true });
syncVisualViewport();

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
  syncColorSwatches();
  if (activeColorKey) {
    pickerHsv = hexToHsv(state[activeColorKey]);
    syncPickerVisuals();
  }
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
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const exportModal = document.querySelector('#export-modal');
const exportTrigger = document.querySelector('#export-png');
const exportTitleFormat = document.querySelector('#export-title-format');
const exportFilename = document.querySelector('#export-filename');
const exportFileExtension = document.querySelector('#export-file-extension');
const animationSettings = document.querySelector('#animation-settings');
const exportDurationFieldset = document.querySelector('#export-duration-fieldset');
const exportFpsFieldset = document.querySelector('#export-fps-fieldset');
const exportQualityFieldset = document.querySelector('#export-quality-fieldset');
const exportResolutionFieldset = document.querySelector('#export-resolution-fieldset');
const exportOutputDimensions = document.querySelector('#export-output-dimensions');
const exportOutputMeta = document.querySelector('#export-output-meta');
const exportDownloadButton = document.querySelector('#export-download');
const exportSettings = {
  format: 'png',
  duration: 5,
  fps: 30,
  quality: 'high',
  resolution: Number(state.exportResolution),
};
const animatedFormats = new Set(['gif', 'mp4']);
const formatMimeTypes = Object.freeze({ png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' });
let exportModalOpener = null;
let animationExportSize = null;

function canvasToBlob(type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(`Could not create ${type} image`));
    }, type, quality);
  });
}

const GIF_FPS = 24;
const GIF_MAX_EDGE = 960;
const gifPalette = (() => {
  const palette = new Uint8Array(256 * 3);
  for (let index = 0; index < 256; index += 1) {
    palette[index * 3] = Math.round(((index >> 5) & 7) * 255 / 7);
    palette[index * 3 + 1] = Math.round(((index >> 2) & 7) * 255 / 7);
    palette[index * 3 + 2] = Math.round((index & 3) * 255 / 3);
  }
  return palette;
})();

function gifBytes(...values) {
  return Uint8Array.from(values);
}

function gifText(value) {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function gifWord(value) {
  return [value & 255, (value >> 8) & 255];
}

function readGifFrame(width, height) {
  const rgba = new Uint8Array(width * height * 4);
  const indexed = new Uint8Array(width * height);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  const readError = gl.getError();
  if (readError !== gl.NO_ERROR) throw new Error(`Could not read GIF frame from GPU (${readError})`);

  // WebGL returns rows bottom-up. GIF expects its first row at the top, so flip
  // while reducing the rendered colors to the GIF global palette.
  for (let y = 0; y < height; y += 1) {
    const sourceRow = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const source = (sourceRow * width + x) * 4;
      const target = y * width + x;
      indexed[target] = (rgba[source] >> 5) << 5
        | (rgba[source + 1] >> 5) << 2
        | (rgba[source + 2] >> 6);
    }
  }
  return indexed;
}

function lzwEncodeGif(indexedPixels) {
  const clearCode = 256;
  const endCode = 257;
  let codeSize = 9;
  let nextCode = 258;
  let dictionary = new Map();
  const output = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const writeCode = (code) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      output.push(bitBuffer & 255);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  writeCode(clearCode);
  let prefix = indexedPixels[0] ?? 0;
  for (let index = 1; index < indexedPixels.length; index += 1) {
    const suffix = indexedPixels[index];
    const key = prefix * 256 + suffix;
    const existing = dictionary.get(key);
    if (existing !== undefined) {
      prefix = existing;
      continue;
    }
    writeCode(prefix);
    if (nextCode < 4096) {
      dictionary.set(key, nextCode);
      nextCode += 1;
      // The decoder creates each dictionary entry one emitted code later than
      // the encoder. Grow the packed code width on that same delayed boundary.
      if (nextCode === (1 << codeSize) + 1 && codeSize < 12) codeSize += 1;
    } else {
      writeCode(clearCode);
      dictionary = new Map();
      codeSize = 9;
      nextCode = 258;
    }
    prefix = suffix;
  }
  writeCode(prefix);
  writeCode(endCode);
  if (bitCount > 0) output.push(bitBuffer & 255);
  return Uint8Array.from(output);
}

function gifSubBlocks(data) {
  const blockCount = Math.ceil(data.length / 255);
  const packed = new Uint8Array(data.length + blockCount + 1);
  let source = 0;
  let target = 0;
  while (source < data.length) {
    const length = Math.min(255, data.length - source);
    packed[target++] = length;
    packed.set(data.subarray(source, source + length), target);
    source += length;
    target += length;
  }
  return packed;
}

function createGifHeader(width, height) {
  return [
    gifText('GIF89a'),
    gifBytes(...gifWord(width), ...gifWord(height), 0xf7, 0, 0),
    gifPalette,
    gifBytes(0x21, 0xff, 0x0b),
    gifText('NETSCAPE2.0'),
    gifBytes(0x03, 0x01, 0x00, 0x00, 0x00),
  ];
}

function createGifFrame(indexedPixels, width, height, delayCentiseconds) {
  return [
    gifBytes(0x21, 0xf9, 0x04, 0x00, ...gifWord(delayCentiseconds), 0x00, 0x00),
    gifBytes(0x2c, 0, 0, 0, 0, ...gifWord(width), ...gifWord(height), 0x00, 0x08),
    gifSubBlocks(lzwEncodeGif(indexedPixels)),
  ];
}

function selectedGifSize() {
  const width = Number(state.canvasWidth);
  const height = Number(state.canvasHeight);
  const scale = Math.min(1, GIF_MAX_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function mixHexColors(first, second, amount) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const channels = a.map((channel, index) => Math.round((channel + (b[index] - channel) * amount) * 255));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function editableSvgPalette() {
  const candidates = [
    ['Background', state.baseColor],
    ['Base Edge', mixHexColors(state.baseColor, state.edgeColor, 0.5)],
    ['Edge', state.edgeColor],
    ['Edge Mid', mixHexColors(state.edgeColor, state.midColor, 0.5)],
    ['Mid', state.midColor],
    ['Mid Body', mixHexColors(state.midColor, state.bodyColor, 0.5)],
    ['Body', state.bodyColor],
  ];
  if (state.showText) candidates.push(['Text', state.textColor]);

  const seen = new Set();
  return candidates.filter(([, color]) => {
    const normalized = color.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).map(([name, color]) => ({
    name,
    color,
    rgb: hexToRgb(color).map((channel) => Math.round(channel * 255)),
  }));
}

function buildEditableSvg(exportSize) {
  const longestEdge = Math.max(exportSize.width, exportSize.height);
  const traceScale = Math.min(1, 640 / longestEdge);
  const traceWidth = Math.max(1, Math.round(exportSize.width * traceScale));
  const traceHeight = Math.max(1, Math.round(exportSize.height * traceScale));
  const traceCanvas = document.createElement('canvas');
  traceCanvas.width = traceWidth;
  traceCanvas.height = traceHeight;
  const traceContext = traceCanvas.getContext('2d', { willReadFrequently: true });
  if (!traceContext) throw new Error('Could not create SVG tracing surface');
  traceContext.imageSmoothingEnabled = true;
  traceContext.imageSmoothingQuality = 'high';
  traceContext.drawImage(canvas, 0, 0, traceWidth, traceHeight);

  const pixels = traceContext.getImageData(0, 0, traceWidth, traceHeight).data;
  const palette = editableSvgPalette();
  const paths = palette.map(() => []);
  const colorAt = (x, y) => {
    const offset = (y * traceWidth + x) * 4;
    let selected = 0;
    let shortestDistance = Infinity;
    for (let index = 0; index < palette.length; index += 1) {
      const [r, g, b] = palette[index].rgb;
      const red = pixels[offset] - r;
      const green = pixels[offset + 1] - g;
      const blue = pixels[offset + 2] - b;
      const distance = red * red + green * green + blue * blue;
      if (distance < shortestDistance) {
        shortestDistance = distance;
        selected = index;
      }
    }
    return selected;
  };

  for (let y = 0; y < traceHeight; y += 1) {
    let x = 0;
    while (x < traceWidth) {
      const paletteIndex = colorAt(x, y);
      let runEnd = x + 1;
      while (runEnd < traceWidth && colorAt(runEnd, y) === paletteIndex) runEnd += 1;
      if (paletteIndex !== 0) paths[paletteIndex].push(`M${x} ${y}h${runEnd - x}v1H${x}Z`);
      x = runEnd;
    }
  }

  const groups = palette.slice(1).map((entry, index) => {
    const path = paths[index + 1];
    if (!path.length) return '';
    const id = entry.name.replace(/[^a-z0-9]+/gi, '_');
    return `<g id="${id}"><path fill="${entry.color}" d="${path.join('')}"/></g>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${exportSize.width}" height="${exportSize.height}" viewBox="0 0 ${traceWidth} ${traceHeight}" shape-rendering="crispEdges"><title>NUF Pattern · Editable Vector</title><desc>Color-grouped vector paths generated by NUF Pattern Studio.</desc><g id="Background"><rect width="${traceWidth}" height="${traceHeight}" fill="${palette[0].color}"/></g>${groups}</svg>`;
}

function safeExportFilename() {
  return (exportFilename.value || 'nuf-pattern')
    .replace(/\.[a-z0-9]+$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'nuf-pattern';
}

function suggestedExportFilename() {
  const modeNames = ['liquid-voronoi', 'radial-flow', 'falling-flow', 'field-contours'];
  return `nuf-${modeNames[Number(state.mode)] || 'pattern'}-${String(Number(state.seed) + 1).padStart(2, '0')}`;
}

function selectedExportSize() {
  return {
    width: Math.round(Number(state.canvasWidth) * Number(exportSettings.resolution)),
    height: Math.round(Number(state.canvasHeight) * Number(exportSettings.resolution)),
  };
}

function selectExportOption(selector, value, dataKey) {
  document.querySelectorAll(selector).forEach((button) => {
    const selected = String(button.dataset[dataKey]) === String(value);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function updateExportModal() {
  const format = exportSettings.format;
  const animated = animatedFormats.has(format);
  const gif = format === 'gif';
  const size = gif ? selectedGifSize() : selectedExportSize();
  const resolutionLabel = exportSettings.resolution === 1 ? '1×' : exportSettings.resolution === 2 ? '2K · 2×' : '4K';
  exportTitleFormat.textContent = format.toUpperCase();
  exportFileExtension.textContent = `.${format}`;
  animationSettings.hidden = !animated;
  exportDurationFieldset.hidden = !animated;
  exportFpsFieldset.hidden = gif;
  exportQualityFieldset.hidden = gif;
  exportResolutionFieldset.hidden = gif;
  exportTrigger.textContent = 'Export';
  exportOutputDimensions.textContent = `${size.width} × ${size.height} px`;
  exportOutputMeta.textContent = format === 'svg'
    ? 'SVG · Editable vector paths'
    : gif ? `GIF · ${exportSettings.duration}s · optimized` : animated ? `${format.toUpperCase()} · ${exportSettings.duration}s` : `${format.toUpperCase()} · ${resolutionLabel}`;
  selectExportOption('[data-export-format]', format, 'exportFormat');
  selectExportOption('[data-export-duration]', exportSettings.duration, 'exportDuration');
  selectExportOption('[data-export-fps]', exportSettings.fps, 'exportFps');
  selectExportOption('[data-export-quality]', exportSettings.quality, 'exportQuality');
  selectExportOption('[data-export-resolution]', exportSettings.resolution, 'exportResolution');
}

function openExportModal() {
  closeColorPicker();
  exportModalOpener = document.activeElement;
  exportSettings.resolution = Number(state.exportResolution);
  exportFilename.value = suggestedExportFilename();
  exportModal.hidden = false;
  document.body.classList.add('export-modal-open');
  updateExportModal();
  document.querySelector(`[data-export-format="${exportSettings.format}"]`)?.focus();
}

function closeExportModal({ restoreFocus = true } = {}) {
  if (exportModal.hidden) return;
  exportModal.hidden = true;
  document.body.classList.remove('export-modal-open');
  if (restoreFocus) exportModalOpener?.focus();
}

document.querySelectorAll('[data-export-format]').forEach((button) => {
  button.addEventListener('click', () => {
    exportSettings.format = button.dataset.exportFormat;
    updateExportModal();
  });
});
document.querySelectorAll('[data-export-duration]').forEach((button) => {
  button.addEventListener('click', () => {
    exportSettings.duration = Number(button.dataset.exportDuration);
    updateExportModal();
  });
});
document.querySelectorAll('[data-export-fps]').forEach((button) => {
  button.addEventListener('click', () => {
    exportSettings.fps = Number(button.dataset.exportFps);
    updateExportModal();
  });
});
document.querySelectorAll('[data-export-quality]').forEach((button) => {
  button.addEventListener('click', () => {
    exportSettings.quality = button.dataset.exportQuality;
    updateExportModal();
  });
});
document.querySelectorAll('[data-export-resolution]').forEach((button) => {
  button.addEventListener('click', () => {
    exportSettings.resolution = Number(button.dataset.exportResolution);
    state.exportResolution = exportSettings.resolution;
    document.querySelectorAll('[data-key="exportResolution"]').forEach((input) => { input.value = state.exportResolution; });
    updateExportModal();
  });
});
document.querySelectorAll('[data-key="exportResolution"]').forEach((input) => {
  input.addEventListener('change', () => {
    exportSettings.resolution = Number(state.exportResolution);
    if (!exportModal.hidden) updateExportModal();
  });
});

exportTrigger.addEventListener('click', openExportModal);
document.querySelector('#export-modal-close').addEventListener('click', () => closeExportModal());
document.querySelector('#export-cancel').addEventListener('click', () => closeExportModal());
exportModal.addEventListener('pointerdown', (event) => {
  if (event.target === exportModal) closeExportModal();
});
exportModal.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeExportModal();
  if (event.key !== 'Tab') return;
  const focusable = [...exportModal.querySelectorAll('button:not([disabled]), input:not([disabled])')]
    .filter((element) => !element.closest('[hidden]'));
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

function exportStillImage() {
  if (exportInProgress) return;
  const format = exportSettings.format;
  const exportSize = selectedExportSize();
  const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  const maxDimension = Math.min(maxViewport[0], maxViewport[1], gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));

  if (exportSize.width > maxDimension || exportSize.height > maxDimension) {
    showStatus(`${exportSize.width}×${exportSize.height} export is not supported by this GPU`);
    return;
  }

  exportInProgress = true;
  closeExportModal({ restoreFocus: false });
  showStatus(`Rendering ${format.toUpperCase()} · ${exportSize.width}×${exportSize.height}…`, 8000);
  requestAnimationFrame(async () => {
    try {
      render(performance.now(), true, exportSize);
      gl.finish();
      const filename = safeExportFilename();
      if (format === 'svg') {
        const svg = buildEditableSvg(exportSize);
        const parsedSvg = new DOMParser().parseFromString(svg, 'image/svg+xml');
        if (parsedSvg.querySelector('parsererror')) throw new Error('Generated SVG is not valid XML');
        downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${filename}.svg`);
        showStatus('Editable SVG exported');
      } else {
        const mimeType = formatMimeTypes[format];
        const imageQuality = format === 'png' ? undefined : .92;
        const blob = await canvasToBlob(mimeType, imageQuality);
        downloadBlob(blob, `${filename}.${format}`);
        showStatus(`${format.toUpperCase()} exported`);
      }
    } catch (error) {
      console.error(error);
      showStatus(`${format.toUpperCase()} export failed`);
    } finally {
      exportInProgress = false;
      resizeCanvas(true);
      render(performance.now(), true);
    }
  });
}

async function exportGifAnimation() {
  if (exportInProgress) return;
  const exportSize = selectedGifSize();
  const frameCount = Math.max(1, Math.round(Number(exportSettings.duration) * GIF_FPS));

  const gifParts = createGifHeader(exportSize.width, exportSize.height);
  const startElapsed = elapsed;
  const wasAnimating = isAnimating;
  exportInProgress = true;
  isAnimating = false;
  animationExportSize = exportSize;
  exportDownloadButton.disabled = true;

  try {
    for (let frame = 0; frame < frameCount; frame += 1) {
      elapsed = startElapsed + (frame / GIF_FPS) * Number(state.speed);
      render(performance.now(), true, exportSize);
      gl.finish();
      const indexedPixels = readGifFrame(exportSize.width, exportSize.height);
      const currentCentiseconds = Math.round(frame * 100 / GIF_FPS);
      const nextCentiseconds = Math.round((frame + 1) * 100 / GIF_FPS);
      gifParts.push(...createGifFrame(indexedPixels, exportSize.width, exportSize.height, Math.max(2, nextCentiseconds - currentCentiseconds)));

      if (frame % 3 === 0 || frame === frameCount - 1) {
        const progress = Math.round((frame + 1) / frameCount * 100);
        exportDownloadButton.textContent = `Encoding GIF · ${progress}%`;
        showStatus(`Encoding GIF · ${progress}%`, 8000);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }

    gifParts.push(gifBytes(0x3b));
    const blob = new Blob(gifParts, { type: 'image/gif' });
    if (!blob.size) throw new Error('GIF encoder returned an empty file');
    downloadBlob(blob, `${safeExportFilename()}.gif`);
    closeExportModal({ restoreFocus: false });
    showStatus(`GIF exported · ${exportSize.width}×${exportSize.height}`);
  } catch (error) {
    console.error(error);
    showStatus('GIF export failed');
  } finally {
    elapsed = startElapsed + Number(exportSettings.duration) * Number(state.speed);
    isAnimating = wasAnimating;
    animationExportSize = null;
    exportInProgress = false;
    exportDownloadButton.disabled = false;
    exportDownloadButton.textContent = 'Download Pattern';
    previousTime = performance.now();
    resizeCanvas(true);
    render(performance.now(), true);
  }
}

function exportAnimation() {
  if (exportSettings.format === 'gif') {
    exportGifAnimation();
    return;
  }
  if (!window.MediaRecorder || !canvas.captureStream) {
    showStatus('Animation export is not supported in this browser');
    return;
  }
  const mimeTypes = ['video/mp4;codecs=avc1.42E01E', 'video/mp4'];
  const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) {
    showStatus('MP4 export is not supported in this browser');
    return;
  }
  const exportSize = selectedExportSize();
  const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  const maxDimension = Math.min(maxViewport[0], maxViewport[1], gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
  if (exportSize.width > maxDimension || exportSize.height > maxDimension) {
    showStatus(`${exportSize.width}×${exportSize.height} export is not supported by this GPU`);
    return;
  }
  const bitrates = { low: 3_000_000, medium: 6_000_000, high: 12_000_000 };
  const chunks = [];
  animationExportSize = exportSize;
  render(performance.now(), true, exportSize);
  const stream = canvas.captureStream(exportSettings.fps);
  const animationRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrates[exportSettings.quality] });
  exportDownloadButton.disabled = true;
  exportDownloadButton.textContent = `Recording ${exportSettings.duration}s…`;
  animationRecorder.ondataavailable = ({ data }) => data.size && chunks.push(data);
  animationRecorder.onstop = () => {
    stream.getTracks().forEach((track) => track.stop());
    animationExportSize = null;
    resizeCanvas(true);
    render(performance.now(), true);
    exportDownloadButton.disabled = false;
    exportDownloadButton.textContent = 'Download Pattern';
    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size) downloadBlob(blob, `${safeExportFilename()}.mp4`);
    closeExportModal({ restoreFocus: false });
    showStatus(blob.size ? 'MP4 exported' : 'MP4 export failed');
  };
  animationRecorder.start(100);
  showStatus(`Recording ${exportSettings.duration}s MP4…`, exportSettings.duration * 1000 + 1500);
  window.setTimeout(() => animationRecorder.state === 'recording' && animationRecorder.stop(), exportSettings.duration * 1000);
}

exportDownloadButton.addEventListener('click', () => {
  if (animatedFormats.has(exportSettings.format)) exportAnimation();
  else exportStillImage();
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
