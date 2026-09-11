// Monochrome Beat — An ambient, autonomous visualizer with toner-grained outlines, screen-space gradient/photo mapping, and dynamic, smooth drifting organic noise blobs.

// --- WebGL2 Shader Sources --
const vertSrc = `#version 300 es
  in vec2 aPosition;
  out vec2 vUv;
  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const fragSrc = `#version 300 es
  precision highp float;

  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uNoiseScale;
  uniform int uNoiseComplexity;
  uniform float uBlobSize;
  uniform float uBlobCount;
  uniform float uShapeSeparation;
  uniform float uCoreThickness;
  uniform float uHaloSpread;
  uniform float uGrainDensity;
  uniform float uClusterIrregularity;

  // Background Modes
  uniform float uBackgroundMode; // 0.0 = Solid Color, 1.0 = Expanding Ribbons, 2.0 = Falling Lines
  uniform vec3 uBaseColor;
  uniform vec2 uRibbonCenter;
  uniform float uShowRibbonCenter;
  uniform float uRibbonCenterSize;
  uniform vec3 uRibbonEdgeColor;
  uniform vec3 uRibbonMidColor;
  uniform vec3 uRibbonBodyColor;
  uniform float uRibbonDensity;
  uniform float uPatternMidDeform;
  uniform float uRibbonNoiseScale;
  uniform float uRibbonGrainAmount;
  uniform float uRibbonEdgeSize;

  // Falling Lines Specifics
  uniform float uStripeMidWidth;
  uniform float uStripeBodyWidth;
  uniform float uStripeGap;

  // Customizable Colors & Fill Modes
  uniform float uShapeFillMode; // 0.0 = Single Color, 1.0 = Gradient, 2.0 = Photo
  uniform vec3 uShapeColor;

  // Gradient Texture
  uniform sampler2D uGradientTex;
  uniform float uGradientAngle;

  // Photo Texture
  uniform sampler2D uPhotoTex;
  uniform vec2 uPhotoResolution;

  // Background Blobs Uniforms
  uniform float uShowBlobs; // 0.0 = Hide, 1.0 = Show
  uniform float uBlobStyle; // 0.0 = Organic, 1.0 = Circular
  uniform float uBlobColorMode; // 0.0 = Default, 1.0 = Single Color
  uniform vec3 uBlobColor;
  uniform float uEnableGrain; // 0.0 = Off, 1.0 = On
  uniform float uShapeGrainAmount;
  uniform float uEdgeSoftness;

  // Edge Color Mode Uniforms
  uniform float uEdgeColorMode; // 0.0 = Single, 1.0 = Three-Tone
  uniform vec3 uInnerEdgeColor;
  uniform vec3 uOuterEdgeColor;
  uniform float uInnerEdgeWidth;
  uniform float uOuterEdgeWidth;

  // Typography Uniforms
  uniform float uShowText;
  uniform sampler2D uTextTex;
  uniform vec3 uTextColor;
  uniform float uTextBaseSize;
  uniform float uTextThickness;
  uniform float uTextBlur;
  uniform float uTextSharpness;
  uniform float uTextNoiseScale;
  uniform float uTextGrainAmount;
  uniform float uTextWarpAmount;
  uniform vec2 uTextPosition;
  uniform float uTextFlip;
  uniform float uTextBlendMode; // 0.0 = Normal, 1.0 = Invert, 2.0 = Difference

  // Background Mask Uniforms
  uniform float uEnableBgMask;
  uniform sampler2D uBgMaskTex;
  uniform float uBgMaskMode; // 0.0 = Alpha, 1.0 = Luminance
  uniform float uBgMaskInvert;
  uniform vec2 uBgMaskResolution;
  uniform float uBgMaskLoaded;

  in vec2 vUv;
  out vec4 fragColor;

  // Simplex noise (Ashima Arts, MIT)
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

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // Cellular noise (Worley noise) for circular blobs
  float cellular(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float minDist = 1.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 neighbor = vec2(float(x), float(y));
        vec2 cellId = i + neighbor;
        float h1 = hash(cellId);
        float h2 = hash(cellId + vec2(37.12, 74.34));
        vec2 point = vec2(h1, h2);
        point = 0.5 + 0.5 * sin(uTime * 0.5 + point * 6.2831);
        vec2 diff = neighbor + point - f;
        float dist = length(diff);
        minDist = min(minDist, dist);
      }
    }
    return minDist;
  }

  vec2 getCoverUv(vec2 uv, vec2 screenRes, vec2 imageRes) {
    float screenAspect = screenRes.x / screenRes.y;
    float imageAspect = imageRes.x / imageRes.y;
    vec2 resultUv = uv;
    if (screenAspect > imageAspect) {
      float scale = imageAspect / screenAspect;
      resultUv.y = (uv.y - 0.5) * scale + 0.5;
    } else {
      float scale = screenAspect / imageAspect;
      resultUv.x = (uv.x - 0.5) * scale + 0.5;
    }
    return resultUv;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv - 0.5;
    float aspect = uResolution.x / uResolution.y;
    p.x *= aspect;

    // Background Mask Calculation
    float maskVal = 1.0;
    if (uEnableBgMask > 0.5 && uBgMaskLoaded > 0.5) {
      vec2 maskUv = getCoverUv(uv, uResolution, uBgMaskResolution);
      vec4 maskTexel = texture(uBgMaskTex, maskUv);
      if (uBgMaskMode > 0.5) {
        maskVal = dot(maskTexel.rgb, vec3(0.299, 0.587, 0.114));
      } else {
        maskVal = maskTexel.a;
      }
      if (uBgMaskInvert > 0.5) {
        maskVal = 1.0 - maskVal;
      }
    }

    // 1. Calculate Organic Shapes Mask (Noise Field)
    float shapeMask = 0.0;
    float dist = 999.0;
    float core = 0.0;
    float spread = 0.0;
    float clusterMod = 1.0;
    float inkProbability = 0.0;
    float cleanMask = 0.0;

    // We can define up to 32 potential blobs
    float potential = 0.0;

    if (uShowBlobs > 0.5) {
      vec2 evalP = p * (uNoiseScale * 0.5);

      // Organic mode warps coordinates using simplex noise
      vec3 warpPos = vec3(p * uNoiseScale, uTime * 0.3);
      float deform = uPatternMidDeform * 0.15;
      if (uBlobStyle < 0.5) { // Organic mode
        evalP.x += snoise(warpPos) * deform;
        evalP.y += snoise(warpPos + vec3(11.7, 43.1, 9.8)) * deform;
      }

      float time = uTime * 0.4;
      int activeCount = int(uBlobCount);

      // Render multiple individual drifting blobs that fuse together
      for (int i = 0; i < 32; i++) {
        if (i >= activeCount) break;

        float fi = float(i);
        // Continuous smooth drifting offsets using multi-dimensional Simplex noise
        float dx = snoise(vec3(fi * 13.54 + 2.1, 4.3, time * 0.6)) * 0.55;
        float dy = snoise(vec3(fi * 27.81 + 9.7, 15.4, time * 0.6)) * 0.55;

        // Spread blobs in a beautiful golden spiral
        float theta = fi * 2.39996; // Golden angle
        float spreadFactor = 0.18 * sqrt(fi + 1.0);
        vec2 bPos = vec2(cos(theta), sin(theta)) * spreadFactor + vec2(dx, dy);

        // Distance to the evaluation point
        vec2 d = evalP - bPos;
        float d2 = dot(d, d);

        // Exponential metaball falloff scaled by size
        float radius = uBlobSize * 0.14;
        potential += exp(-d2 / (radius * radius));
      }

      // Contour threshold is adjusted by shapeSeparation
      float threshold = mix(0.4, 2.0, uShapeSeparation / 4.0);
      dist = max(0.0, threshold - potential);

      // High-frequency pseudo-random grain particles
      vec3 noisePos = vec3(p * uNoiseScale, uTime * 0.5);
      vec2 grainCoord = noisePos.xy * 650.0;
      float grainVal = hash(floor(grainCoord) + vec2(sin(uTime * 10.0), cos(uTime * 10.0)));

      // Toner Outline Mode — low-frequency cluster noise modulates edge thickness and halo spread
      float clusterNoise = fbm(noisePos * 1.8 + vec3(12.3, 45.6, 78.9), 2);
      clusterMod = mix(1.0, smoothstep(-0.4, 0.4, clusterNoise) * 1.8 + 0.2, uClusterIrregularity);

      // Calculate ink probability and cleanMask based on distance
      core = uCoreThickness * clusterMod;
      float wInner = uInnerEdgeWidth * clusterMod;
      float wOuter = uOuterEdgeWidth * clusterMod;
      float totalThickness = core + wInner + wOuter;
      float softnessVal = max(0.002, uEdgeSoftness * 0.4);

      if (uEdgeColorMode > 0.5) {
        // Three-Tone mode
        if (dist < core + wInner) {
          inkProbability = 1.0;
        } else {
          float t = (dist - (core + wInner)) / max(wOuter, 0.001);
          inkProbability = 1.0 - smoothstep(0.0, 1.0, t);
        }
        cleanMask = 1.0 - smoothstep(totalThickness - softnessVal, totalThickness + softnessVal, dist);
      } else {
        // Single/Default mode
        spread = uHaloSpread * clusterMod;
        totalThickness = core + spread;
        if (dist < core) {
          inkProbability = 1.0;
        } else {
          float t = (dist - core) / max(spread, 0.001);
          inkProbability = 1.0 - smoothstep(0.0, 1.0, t);
        }
        cleanMask = 1.0 - smoothstep(totalThickness - softnessVal, totalThickness + softnessVal, dist);
      }

      float grainyMask = step(1.0 - (inkProbability * uGrainDensity), grainVal);

      if (uEnableGrain > 0.5) {
        // Multiply grainyMask by cleanMask to cleanly contain grain inside the solid mass
        shapeMask = cleanMask * mix(1.0, grainyMask, uShapeGrainAmount);
      } else {
        shapeMask = cleanMask;
      }
    }

    // 2. Color Blending & Inversion
    vec3 shapeColor;
    if (uShapeFillMode < 0.5) {
      // Single Color
      shapeColor = uShapeColor;
    } else if (uShapeFillMode < 1.5) {
      // Gradient — rotated UV mapping
      float angleRad = uGradientAngle * 3.14159265359 / 180.0;
      vec2 centeredUv = uv - 0.5;
      vec2 rotUv = vec2(
        centeredUv.x * cos(angleRad) - centeredUv.y * sin(angleRad),
        centeredUv.x * sin(angleRad) + centeredUv.y * cos(angleRad)
      );
      float gradT = clamp(rotUv.x + 0.5, 0.0, 1.0);
      shapeColor = texture(uGradientTex, vec2(gradT, 0.5)).rgb;
    } else {
      // Photo
      vec2 photoUv = getCoverUv(uv, uResolution, uPhotoResolution);
      shapeColor = texture(uPhotoTex, photoUv).rgb;
    }

    // Determine active shape color (Default vs Single Color vs Three-Tone Edge)
    vec3 activeShapeColor = shapeColor;
    if (uBlobColorMode > 0.5) {
      activeShapeColor = uBlobColor;
    }
    if (uEdgeColorMode > 0.5 && uShowBlobs > 0.5) {
      vec3 coreColor = activeShapeColor;
      float wInner = uInnerEdgeWidth * clusterMod;
      float wOuter = uOuterEdgeWidth * clusterMod;
      float totalW = wInner + wOuter;
      
      if (dist < core) {
        activeShapeColor = coreColor;
      } else {
        float dHalo = dist - core;
        if (dHalo < wInner) {
          float localT = smoothstep(0.0, 1.0, dHalo / max(wInner, 0.001));
          activeShapeColor = mix(coreColor, uInnerEdgeColor, localT);
        } else if (dHalo < totalW) {
          float localT = smoothstep(0.0, 1.0, (dHalo - wInner) / max(wOuter, 0.001));
          activeShapeColor = mix(uInnerEdgeColor, uOuterEdgeColor, localT);
        } else {
          activeShapeColor = uOuterEdgeColor;
        }
      }
    }

    // 3. Unified Scene Composition
    vec3 sceneColor = uBaseColor;

    if (uBackgroundMode > 0.5) {
      if (uBackgroundMode < 1.5) {
        // Expanding Ribbons (Swirling, wavy concentric ribbons)
        vec2 centerUv = uv - 0.5;
        centerUv.x *= aspect;
        centerUv.x -= uRibbonCenter.x * 0.5 * aspect;
        centerUv.y -= uRibbonCenter.y * 0.5;

        float r = length(centerUv);
        float theta = atan(centerUv.y, centerUv.x);

        vec3 noisePos = vec3(centerUv * uRibbonNoiseScale, uTime * uPatternMidDeform * 0.15);
        float noiseVal = fbm(noisePos, 3);

        // Swirl angle warps concentric circles into wavy pinwheel ribbons
        float swirl = theta + (1.0 / (r + 0.05)) * uPatternMidDeform * 0.3;

        // Warp the radius using both noise and the swirl angle
        float warpedR = r + noiseVal * uPatternMidDeform * 0.15 + sin(swirl * 6.0) * uPatternMidDeform * 0.05;

        // Apply Ribbon Center Size as a phase offset to the warped radius
        float phaseR = max(0.0, warpedR - uRibbonCenterSize);

        // Falling motion
        float bandVal = phaseR * uRibbonDensity - uTime * uPatternMidDeform * 1.5;
        float edgeT = abs(fract(bandVal) - 0.5) * 2.0;

        // 3-stop gradient interpolation: Body -> Mid -> Edge
        float edgeStart = max(0.05, 1.0 - uRibbonEdgeSize);
        float blurWidth = uHaloSpread;

        // Add grain directly to the interpolation factor
        float grainNoise = (hash(floor(uv * 800.0 + vec2(sin(uTime * 12.0), cos(uTime * 12.0)))) - 0.5) * uRibbonGrainAmount * 0.5;
        float edgeT_distorted = clamp(edgeT + grainNoise, 0.0, 1.0);

        // Clean 3-stop gradient interpolation
        float t1 = smoothstep(0.0, max(0.01, edgeStart - blurWidth), edgeT_distorted);
        float t2 = smoothstep(max(0.01, edgeStart - blurWidth), min(0.99, edgeStart + blurWidth), edgeT_distorted);

        vec3 ribbonColor = mix(uRibbonBodyColor, uRibbonMidColor, t1);
        ribbonColor = mix(ribbonColor, uRibbonEdgeColor, t2);

        if (uShowRibbonCenter > 0.5) {
          float centerMask = smoothstep(uRibbonCenterSize - 0.01, uRibbonCenterSize + 0.01, r);
          ribbonColor = mix(uBaseColor, ribbonColor, centerMask);
        }

        if (uEnableBgMask > 0.5) {
          sceneColor = mix(uBaseColor, ribbonColor, maskVal);
        } else {
          sceneColor = ribbonColor;
        }
      } else {
        // Falling Lines (Horizontal stripes going down with independent band motion)
        float grainNoise = (hash(floor(uv * 800.0 + vec2(sin(uTime * 12.0), cos(uTime * 12.0)))) - 0.5) * uRibbonGrainAmount * 0.12;

        // 1. Body Color Stripe
        float scaledY_body = uv.y;
        vec3 noisePosBody = vec3(uv * uRibbonNoiseScale * 0.4, uTime * 0.3);
        float noiseBody = snoise(noisePosBody) * 0.25;
        float bandValBody = scaledY_body * uRibbonDensity + uTime * 0.4 + noiseBody;
        float localY_body = fract(bandValBody) + grainNoise;

        float w3 = uStripeBodyWidth * 0.5;
        float blurBody = uHaloSpread * 1.2;
        float m3 = smoothstep(w3 + blurBody, w3 - blurBody, abs(localY_body - 0.8));

        // 2. Mid Color Stripe
        vec3 noisePosMid = vec3(uv * uRibbonNoiseScale * 1.2, uTime * 0.8);
        float noiseMid = snoise(noisePosMid) * 0.15;
        float bandValMid = uv.y * uRibbonDensity + uTime * 1.0 + noiseMid;
        float localY_mid = fract(bandValMid) + grainNoise;

        float w2 = uStripeMidWidth * 0.5;
        float blurMid = uHaloSpread * 0.6;
        float m2 = smoothstep(w2 + blurMid, w2 - blurMid, abs(localY_mid - 0.5));

        // 3. Edge Color Stripe
        vec3 noisePosEdge = vec3(uv * uRibbonNoiseScale * 2.5, uTime * 2.0);
        float noiseEdge = snoise(noisePosEdge) * 0.08;
        float bandValEdge = uv.y * uRibbonDensity + uTime * 2.0 + noiseEdge;
        float localY_edge = fract(bandValEdge) + grainNoise;

        float w1 = uRibbonEdgeSize * 0.5;
        float blurEdge = uHaloSpread * 0.3;
        float m1 = smoothstep(w1 + blurEdge, w1 - blurEdge, abs(localY_edge - 0.2));

        // Composite the independent stripes from back to front
        vec3 ribbonColor = uBaseColor;
        ribbonColor = mix(ribbonColor, uRibbonBodyColor, m3);
        ribbonColor = mix(ribbonColor, uRibbonMidColor, m2);
        ribbonColor = mix(ribbonColor, uRibbonEdgeColor, m1);

        if (uEnableBgMask > 0.5) {
          sceneColor = mix(uBaseColor, ribbonColor, maskVal);
        } else {
          sceneColor = ribbonColor;
        }
      }
    }

    // Draw shapes onto background
    sceneColor = mix(sceneColor, activeShapeColor, shapeMask);

    // 4. Draw Typography Layer (Soft Inflatable Logo Mask)
    if (uShowText > 0.5) {
      // Aspect ratio correction for text UVs
      vec2 textUv = uv - 0.5;
      textUv.x *= aspect;

      // Apply position offset
      textUv -= uTextPosition * 0.5;

      // Scale UVs from center
      float scaleFactor = 1.0 / (uTextBaseSize * 10.0);
      textUv *= scaleFactor;

      // Apply flipping around local center
      if (uTextFlip == 1.0 || uTextFlip == 3.0) {
        textUv.x = -textUv.x;
      }
      if (uTextFlip == 2.0 || uTextFlip == 3.0) {
        textUv.y = -textUv.y;
      }

      textUv += 0.5;

      // Apply global noise warp to the whole text object
      if (uTextWarpAmount > 0.0) {
        vec3 warpPos = vec3(textUv * uTextNoiseScale, uTime * 0.15);
        vec2 warp = vec2(
          snoise(warpPos),
          snoise(warpPos + vec3(31.17, 12.71, 93.41))
        ) * uTextWarpAmount * 0.08;
        textUv += warp;
      }

      // Sample the text texture
      float alpha = texture(uTextTex, textUv).a;

      float thickness = uTextThickness * 0.2;

      // Map uTextBlur to the edge softness
      float softness = max(0.002, (0.01 + uTextBlur * 0.02) * (1.0 - uTextSharpness * 0.95));

      // Smoothstep-based thickness control
      float textMask = smoothstep(0.5 - thickness - softness, 0.5 - thickness + softness, alpha);

      // Apply text grain
      if (uTextGrainAmount > 0.0) {
        vec2 textGrainCoord = textUv * 800.0;
        float textGrainVal = hash(floor(textGrainCoord) + vec2(sin(uTime * 15.0), cos(uTime * 15.0)));
        float grainFactor = mix(1.0, textGrainVal, uTextGrainAmount * 0.5);
        textMask *= grainFactor;
      }

      // Clip outside texture bounds
      if (textUv.x < 0.0 || textUv.x > 1.0 || textUv.y < 0.0 || textUv.y > 1.0) {
        textMask = 0.0;
      }

      vec3 targetColor = uTextColor;
      if (uTextBlendMode == 1.0) {
        // Invert
        targetColor = vec3(1.0) - sceneColor;
        sceneColor = mix(sceneColor, targetColor, textMask);
      } else if (uTextBlendMode == 2.0) {
        // Difference
        vec3 diffColor = abs(sceneColor - uTextColor);
        sceneColor = mix(sceneColor, diffColor, textMask);
      } else {
        // Normal
        sceneColor = mix(sceneColor, targetColor, textMask);
      }
    }

    fragColor = vec4(sceneColor, 1.0);
  }
`;

// --- WebGL Setup --
const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, alpha: true });
if (!gl) {
  console.error("WebGL2 not supported");
}

function createShader(gl, type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
  }
  return s;
}

function createProgram(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(p));
  }
  return p;
}

const program = createProgram(gl,
  createShader(gl, gl.VERTEX_SHADER, vertSrc),
  createShader(gl, gl.FRAGMENT_SHADER, fragSrc)
);

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(program, 'aPosition');
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

gl.useProgram(program);

// Get Uniform Locations
const uRes = gl.getUniformLocation(program, 'uResolution');
const uTime = gl.getUniformLocation(program, 'uTime');
const uNoiseScale = gl.getUniformLocation(program, 'uNoiseScale');
const uNoiseComplexity = gl.getUniformLocation(program, 'uNoiseComplexity');
const uBlobSize = gl.getUniformLocation(program, 'uBlobSize');
const uBlobCount = gl.getUniformLocation(program, 'uBlobCount');
const uShapeSeparation = gl.getUniformLocation(program, 'uShapeSeparation');
const uCoreThickness = gl.getUniformLocation(program, 'uCoreThickness');
const uHaloSpread = gl.getUniformLocation(program, 'uHaloSpread');
const uGrainDensity = gl.getUniformLocation(program, 'uGrainDensity');
const uClusterIrregularity = gl.getUniformLocation(program, 'uClusterIrregularity');

// Background Uniforms
const uBackgroundMode = gl.getUniformLocation(program, 'uBackgroundMode');
const uBaseColor = gl.getUniformLocation(program, 'uBaseColor');
const uRibCenter = gl.getUniformLocation(program, 'uRibbonCenter');
const uShowRibCenter = gl.getUniformLocation(program, 'uShowRibbonCenter');
const uRibCenterSize = gl.getUniformLocation(program, 'uRibbonCenterSize');
const uRibEdgeColor = gl.getUniformLocation(program, 'uRibbonEdgeColor');
const uRibMidColor = gl.getUniformLocation(program, 'uRibbonMidColor');
const uRibBodyColor = gl.getUniformLocation(program, 'uRibbonBodyColor');
const uRibDensity = gl.getUniformLocation(program, 'uRibbonDensity');
const uPatternMidDeform = gl.getUniformLocation(program, 'uPatternMidDeform');
const uRibNoiseScale = gl.getUniformLocation(program, 'uRibbonNoiseScale');
const uRibGrainAmount = gl.getUniformLocation(program, 'uRibbonGrainAmount');
const uRibEdgeSize = gl.getUniformLocation(program, 'uRibbonEdgeSize');

// Falling Lines Specifics
const uStripeMidWidth = gl.getUniformLocation(program, 'uStripeMidWidth');
const uStripeBodyWidth = gl.getUniformLocation(program, 'uStripeBodyWidth');
const uStripeGap = gl.getUniformLocation(program, 'uStripeGap');

// Background Mask Uniforms
const uEnableBgMask = gl.getUniformLocation(program, 'uEnableBgMask');
const uBgMaskTex = gl.getUniformLocation(program, 'uBgMaskTex');
const uBgMaskMode = gl.getUniformLocation(program, 'uBgMaskMode');
const uBgMaskInvert = gl.getUniformLocation(program, 'uBgMaskInvert');
const uBgMaskResolution = gl.getUniformLocation(program, 'uBgMaskResolution');
const uBgMaskLoaded = gl.getUniformLocation(program, 'uBgMaskLoaded');

// Color & Gradient Uniforms
const uGradientTex = gl.getUniformLocation(program, 'uGradientTex');
const uGradientAngle = gl.getUniformLocation(program, 'uGradientAngle');

// Shape Fill Mode Uniforms
const uShapeFillMode = gl.getUniformLocation(program, 'uShapeFillMode');
const uShapeColor = gl.getUniformLocation(program, 'uShapeColor');
const uPhotoTex = gl.getUniformLocation(program, 'uPhotoTex');
const uPhotoResolution = gl.getUniformLocation(program, 'uPhotoResolution');

// Background Blobs Uniforms
const uShowBlobs = gl.getUniformLocation(program, 'uShowBlobs');
const uBlobStyle = gl.getUniformLocation(program, 'uBlobStyle');
const uBlobColorMode = gl.getUniformLocation(program, 'uBlobColorMode');
const uBlobColor = gl.getUniformLocation(program, 'uBlobColor');
const uEnableGrain = gl.getUniformLocation(program, 'uEnableGrain');
const uShapeGrainAmount = gl.getUniformLocation(program, 'uShapeGrainAmount');
const uEdgeSoftness = gl.getUniformLocation(program, 'uEdgeSoftness');

// Edge Color Mode Uniforms
const uEdgeColorMode = gl.getUniformLocation(program, 'uEdgeColorMode');
const uInnerEdgeColor = gl.getUniformLocation(program, 'uInnerEdgeColor');
const uOuterEdgeColor = gl.getUniformLocation(program, 'uOuterEdgeColor');
const uInnerEdgeWidth = gl.getUniformLocation(program, 'uInnerEdgeWidth');
const uOuterEdgeWidth = gl.getUniformLocation(program, 'uOuterEdgeWidth');

// Typography Uniforms
const uShowText = gl.getUniformLocation(program, 'uShowText');
const uTextTex = gl.getUniformLocation(program, 'uTextTex');
const uTextColor = gl.getUniformLocation(program, 'uTextColor');
const uTextBaseSize = gl.getUniformLocation(program, 'uTextBaseSize');
const uTextThickness = gl.getUniformLocation(program, 'uTextThickness');
const uTextBlur = gl.getUniformLocation(program, 'uTextBlur');
const uTextSharpness = gl.getUniformLocation(program, 'uTextSharpness');
const uTextNoiseScale = gl.getUniformLocation(program, 'uTextNoiseScale');
const uTextGrainAmount = gl.getUniformLocation(program, 'uTextGrainAmount');
const uTextWarpAmount = gl.getUniformLocation(program, 'uTextWarpAmount');
const uTextPosition = gl.getUniformLocation(program, 'uTextPosition');
const uTextFlip = gl.getUniformLocation(program, 'uTextFlip');
const uTextBlendMode = gl.getUniformLocation(program, 'uTextBlendMode');

// --- 1D Gradient Texture Setup --
const gradTexture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, gradTexture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

const gradCanvas = document.createElement('canvas');
gradCanvas.width = 256;
gradCanvas.height = 1;
const gradCtx = gradCanvas.getContext('2d');

function updateGradientTexture(gradient, tex, cnv, cctx) {
  const stops = gradient.stops || [];
  const grad = cctx.createLinearGradient(0, 0, 256, 0);

  if (stops.length === 0) {
    grad.addColorStop(0, '#ff0055');
    grad.addColorStop(1, '#00ffcc');
  } else if (typeof stops[0] === 'number') {
    const numStops = Math.floor(stops.length / 4);
    for (let i = 0; i < numStops; i++) {
      const offset = i / Math.max(1, numStops - 1);
      const r = stops[i * 4];
      const g = stops[i * 4 + 1];
      const b = stops[i * 4 + 2];
      const a = stops[i * 4 + 3] / 100;
      grad.addColorStop(offset, `rgba(${r},${g},${b},${a})`);
    }
  } else {
    const sortedStops = [...stops].sort((a, b) => (a.offset || 0) - (b.offset || 0));
    let maxOffset = 0;
    sortedStops.forEach(s => {
      if (typeof s.offset === 'number' && s.offset > maxOffset) {
        maxOffset = s.offset;
      }
    });
    const divisor = maxOffset > 1 ? maxOffset : 1;
    sortedStops.forEach(stop => {
      let offset = typeof stop.offset === 'number' ? stop.offset : 0;
      offset = offset / divisor;
      offset = Math.max(0, Math.min(1, offset));
      grad.addColorStop(offset, stop.color || '#ffffff');
    });
  }

  cctx.fillStyle = grad;
  cctx.fillRect(0, 0, 256, 1);

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cnv);
}

// --- Photo Texture Setup --
const photoTexture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, photoTexture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

let photoImage = new Image();
photoImage.crossOrigin = "anonymous";
let photoLoaded = false;

function loadPhoto(url) {
  if (!url) return;
  photoLoaded = false;
  photoImage.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, photoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photoImage);
    photoLoaded = true;
  };
  photoImage.src = url;
}

controls.onChange('photoUpload', (url) => {
  loadPhoto(url);
});

// Load initial photo
loadPhoto(controls.get('photoUpload'));

// --- Background Mask Texture Setup --
const bgMaskTexture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, bgMaskTexture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

let bgMaskImage = new Image();
bgMaskImage.crossOrigin = "anonymous";
let bgMaskLoaded = false;

function loadBgMask(url) {
  if (!url) return;
  bgMaskLoaded = false;
  bgMaskImage.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, bgMaskTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bgMaskImage);
    bgMaskLoaded = true;
  };
  bgMaskImage.src = url;
}

controls.onChange('bgMaskImage', (url) => {
  loadBgMask(url);
});

// Load initial mask
loadBgMask(controls.get('bgMaskImage'));

// --- Typography Texture Setup --
const textTexture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, textTexture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

const textCanvas = document.createElement('canvas');
const textCtx = textCanvas.getContext('2d');
let textNeedsUpdate = true;
let lastRenderedFontSpec = "";
let lastRenderedText = "";
let lastRenderedBlur = -1;
let lastRenderedTracking = -999;
let lastRenderedCompression = -1;
let lastRenderedLineSpacing = -1;

function updateTextTexture() {
  const rawText = controls.get('textContent') || "NUF Pattern Maker";
  const text = rawText.replace(/\\n/g, '\n');

  let fontObj = controls.get('textFont') || "Arial";
  let fontFamily = typeof fontObj === 'object' && fontObj !== null ? (fontObj.family || "Arial") : fontObj;
  let fontWeight = typeof fontObj === 'object' && fontObj !== null ? (fontObj.weight || "normal") : "normal";
  let fontStyle = typeof fontObj === 'object' && fontObj !== null ? (fontObj.style || "normal") : "normal";

  const blurVal = controls.get('textBlur') || 0;
  const tracking = controls.get('letterSpacing') !== undefined ? controls.get('letterSpacing') : 0;
  const widthCompression = controls.get('textWidthCompression') !== undefined ? controls.get('textWidthCompression') : 1.0;
  const lineSpacing = controls.get('lineSpacing') !== undefined ? controls.get('lineSpacing') : 0.7;
  const fontSize = 180;
  const fontSpec = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFamily}", sans-serif`;

  if (textNeedsUpdate || fontSpec !== lastRenderedFontSpec || text !== lastRenderedText || blurVal !== lastRenderedBlur || tracking !== lastRenderedTracking || widthCompression !== lastRenderedCompression || lineSpacing !== lastRenderedLineSpacing) {
    textNeedsUpdate = false;
    lastRenderedFontSpec = fontSpec;
    lastRenderedText = text;
    lastRenderedBlur = blurVal;
    lastRenderedTracking = tracking;
    lastRenderedCompression = widthCompression;
    lastRenderedLineSpacing = lineSpacing;

    textCanvas.width = 2048;
    textCanvas.height = 2048;
    textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);

    if (blurVal > 0) {
      textCtx.filter = `blur(${blurVal}px)`;
    } else {
      textCtx.filter = 'none';
    }

    textCtx.font = fontSpec;
    textCtx.fillStyle = "#ffffff";
    textCtx.textAlign = 'center';
    textCtx.textBaseline = 'middle';

    // Apply letter spacing (tracking)
    if ('letterSpacing' in textCtx) {
      textCtx.letterSpacing = `${tracking}px`;
    }

    textCtx.save();
    textCtx.translate(textCanvas.width / 2, textCanvas.height / 2);

    // Horizontal compression/stretch factor based on widthCompression
    textCtx.scale(widthCompression, 1.0);

    const lines = text.split('\n');
    const lineHeight = fontSize * lineSpacing;
    const totalHeight = (lines.length - 1) * lineHeight;
    const startY = -totalHeight / 2;

    for (let i = 0; i < lines.length; i++) {
      const y = startY + i * lineHeight;
      textCtx.fillText(lines[i], 0, y);
    }

    textCtx.restore();

    gl.bindTexture(gl.TEXTURE_2D, textTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);

    if (!document.fonts.check(fontSpec)) {
      document.fonts.load(fontSpec).then(() => {
        if (lastRenderedFontSpec === fontSpec) {
          textNeedsUpdate = true;
        }
      }).catch(err => {
        console.warn("Font load failed:", err);
      });
    }
  }
}

controls.onChange('textContent', () => { textNeedsUpdate = true; });
controls.onChange('textFont', () => { textNeedsUpdate = true; });
controls.onChange('letterSpacing', () => { textNeedsUpdate = true; });
controls.onChange('lineSpacing', () => { textNeedsUpdate = true; });
controls.onChange('textWidthCompression', () => { textNeedsUpdate = true; });
document.fonts.addEventListener('loadingdone', () => { textNeedsUpdate = true; });
document.fonts.ready.then(() => { textNeedsUpdate = true; });
controls.onChange('textBlur', () => { textNeedsUpdate = true; });
window.addEventListener('resize', () => { textNeedsUpdate = true; });

function hexToRgb(hex) {
  if (!hex) return [1, 1, 1];
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

let accumulatedTime = 0.0;
let lastTime = performance.now();

// --- PNG Export Implementation --
function exportPNG() {
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `nuf-pattern-${Date.now()}.png`;
  a.click();
}

controls.onAction('exportPng', () => {
  exportPNG();
});

// --- Main Render Loop --
function render(timestamp) {
  const dt = Math.min(0.1, (timestamp - lastTime) * 0.001);
  lastTime = timestamp;

  gl.viewport(0, 0, canvas.width, canvas.height);

  // Speed controls the time multiplier for the virtual drift waves
  const speed = controls.get('driftSpeed') !== undefined ? controls.get('driftSpeed') : 1.0;
  accumulatedTime += dt * speed;

  gl.useProgram(program);
  gl.uniform2f(uRes, canvas.width, canvas.height);
  gl.uniform1f(uTime, accumulatedTime);

  gl.uniform1f(uNoiseScale, controls.get('noiseScale'));
  gl.uniform1i(uNoiseComplexity, Math.floor(controls.get('noiseComplexity')));
  gl.uniform1f(uBlobSize, controls.get('blobSize'));
  gl.uniform1f(uBlobCount, controls.get('blobCount'));
  gl.uniform1f(uShapeSeparation, controls.get('shapeSeparation'));
  gl.uniform1f(uCoreThickness, controls.get('coreThickness'));
  gl.uniform1f(uHaloSpread, controls.get('haloSpread'));
  gl.uniform1f(uGrainDensity, controls.get('grainDensity'));
  gl.uniform1f(uClusterIrregularity, controls.get('clusterIrregularity'));

  // Background Uniforms
  const bgModeStr = controls.get('backgroundMode');
  let bgModeVal = 0.0;
  if (bgModeStr === 'Expanding Ribbons') bgModeVal = 1.0;
  else if (bgModeStr === 'Falling Lines') bgModeVal = 2.0;
  gl.uniform1f(uBackgroundMode, bgModeVal);

  const baseColor = hexToRgb(controls.get('baseColor'));
  gl.uniform3f(uBaseColor, baseColor[0], baseColor[1], baseColor[2]);

  const ribbonEdgeColor = hexToRgb(controls.get('ribbonEdgeColor'));
  const ribbonMidColor = hexToRgb(controls.get('ribbonMidColor'));
  const ribbonBodyColor = hexToRgb(controls.get('ribbonBodyColor'));
  gl.uniform3f(uRibEdgeColor, ribbonEdgeColor[0], ribbonEdgeColor[1], ribbonEdgeColor[2]);
  gl.uniform3f(uRibMidColor, ribbonMidColor[0], ribbonMidColor[1], ribbonMidColor[2]);
  gl.uniform3f(uRibBodyColor, ribbonBodyColor[0], ribbonBodyColor[1], ribbonBodyColor[2]);
  gl.uniform1f(uRibEdgeSize, controls.get('ribbonEdgeSize'));
  gl.uniform1f(uRibDensity, controls.get('ribbonDensity'));
  gl.uniform1f(uPatternMidDeform, controls.get('patternMidDeform'));
  gl.uniform1f(uRibNoiseScale, controls.get('ribbonNoiseScale'));
  gl.uniform1f(uRibGrainAmount, controls.get('ribbonGrainAmount'));

  // Falling Lines Specifics
  gl.uniform1f(uStripeMidWidth, controls.get('stripeMidWidth'));
  gl.uniform1f(uStripeBodyWidth, controls.get('stripeBodyWidth'));
  gl.uniform1f(uStripeGap, controls.get('stripeGap'));

  const ribbonCenter = controls.get('ribbonCenter') || { x: 0, y: 0 };
  gl.uniform2f(uRibCenter, ribbonCenter.x, ribbonCenter.y);

  gl.uniform1f(uShowRibCenter, controls.get('showRibbonCenter') ? 1.0 : 0.0);
  gl.uniform1f(uRibCenterSize, controls.get('ribbonCenterSize'));

  // Shape Fill Mode Uniforms
  const fillModeStr = controls.get('shapeFillMode');
  let fillModeVal = 1.0;
  if (fillModeStr === 'Single Color') fillModeVal = 0.0;
  else if (fillModeStr === 'Photo') fillModeVal = 2.0;
  gl.uniform1f(uShapeFillMode, fillModeVal);

  const shapeColor = hexToRgb(controls.get('shapeColor'));
  gl.uniform3f(uShapeColor, shapeColor[0], shapeColor[1], shapeColor[2]);

  // Update and bind the 1D Gradient Texture
  const gradient = controls.get('shapeGradient') || { type: 'linear', stops: [{ offset: 0, color: '#ff0055' }, { offset: 1, color: '#00ffcc' }] };
  updateGradientTexture(gradient, gradTexture, gradCanvas, gradCtx);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gradTexture);
  gl.uniform1i(uGradientTex, 0);
  gl.uniform1f(uGradientAngle, controls.get('gradientAngle'));

  // Bind Photo Texture
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, photoTexture);
  gl.uniform1i(uPhotoTex, 1);
  if (photoLoaded) {
    gl.uniform2f(uPhotoResolution, photoImage.width, photoImage.height);
  } else {
    gl.uniform2f(uPhotoResolution, 1.0, 1.0);
  }

  // Bind Background Mask Texture
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, bgMaskTexture);
  gl.uniform1i(uBgMaskTex, 3);
  gl.uniform1f(uEnableBgMask, controls.get('enableBgMask') ? 1.0 : 0.0);
  gl.uniform1f(uBgMaskMode, controls.get('bgMaskMode') === 'Luminance' ? 1.0 : 0.0);
  gl.uniform1f(uBgMaskInvert, controls.get('bgMaskInvert') ? 1.0 : 0.0);
  if (bgMaskLoaded) {
    gl.uniform2f(uBgMaskResolution, bgMaskImage.width, bgMaskImage.height);
    gl.uniform1f(uBgMaskLoaded, 1.0);
  } else {
    gl.uniform2f(uBgMaskResolution, 1.0, 1.0);
    gl.uniform1f(uBgMaskLoaded, 0.0);
  }

  // Background Blobs Uniforms
  const showBlobsVal = controls.get('showBlobs') && (bgModeStr === 'Solid Color');
  gl.uniform1f(uShowBlobs, showBlobsVal ? 1.0 : 0.0);

  const blobStyleStr = controls.get('blobStyle');
  gl.uniform1f(uBlobStyle, blobStyleStr === 'Circular' ? 1.0 : 0.0);

  const blobColorModeStr = controls.get('blobColorMode');
  gl.uniform1f(uBlobColorMode, blobColorModeStr === 'Single Color' ? 1.0 : 0.0);

  const blobColor = hexToRgb(controls.get('blobColor'));
  gl.uniform3f(uBlobColor, blobColor[0], blobColor[1], blobColor[2]);

  gl.uniform1f(uEnableGrain, controls.get('enableGrain') ? 1.0 : 0.0);
  gl.uniform1f(uShapeGrainAmount, controls.get('shapeGrainAmount'));
  gl.uniform1f(uEdgeSoftness, controls.get('edgeSoftness'));

  // Edge Color Mode Uniforms
  gl.uniform1f(uEdgeColorMode, controls.get('edgeColorMode') === 'Three-Tone' ? 1.0 : 0.0);
  const innerEdgeColor = hexToRgb(controls.get('innerEdgeColor'));
  gl.uniform3f(uInnerEdgeColor, innerEdgeColor[0], innerEdgeColor[1], innerEdgeColor[2]);
  const outerEdgeColor = hexToRgb(controls.get('outerEdgeColor'));
  gl.uniform3f(uOuterEdgeColor, outerEdgeColor[0], outerEdgeColor[1], outerEdgeColor[2]);
  gl.uniform1f(uInnerEdgeWidth, controls.get('innerEdgeWidth'));
  gl.uniform1f(uOuterEdgeWidth, controls.get('outerEdgeWidth'));

  // Update and bind Text Texture
  updateTextTexture();
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, textTexture);
  gl.uniform1i(uTextTex, 2);

  gl.uniform1f(uShowText, controls.get('showText') ? 1.0 : 0.0);

  // Set the dynamic custom text color from the sidebar control
  const textColor = hexToRgb(controls.get('textColor'));
  gl.uniform3f(uTextColor, textColor[0], textColor[1], textColor[2]);

  gl.uniform1f(uTextBaseSize, controls.get('textBaseSize'));
  gl.uniform1f(uTextThickness, controls.get('textThickness'));
  gl.uniform1f(uTextBlur, controls.get('textBlur'));
  gl.uniform1f(uTextSharpness, controls.get('textSharpness'));
  gl.uniform1f(uTextNoiseScale, controls.get('textNoiseScale'));
  gl.uniform1f(uTextGrainAmount, controls.get('textGrainAmount'));
  gl.uniform1f(uTextWarpAmount, controls.get('textWarpAmount'));

  const textPos = controls.get('textPosition') || { x: 0, y: 0 };
  gl.uniform2f(uTextPosition, textPos.x, textPos.y);

  const textFlipStr = controls.get('textFlip') || 'None';
  let textFlipVal = 0.0;
  if (textFlipStr === 'Horizontal') textFlipVal = 1.0;
  else if (textFlipStr === 'Vertical') textFlipVal = 2.0;
  else if (textFlipStr === 'Both') textFlipVal = 3.0;
  gl.uniform1f(uTextFlip, textFlipVal);

  // Handle text blend mode with backward compatibility for boolean values
  let blendModeStr = controls.get('textInvert');
  if (blendModeStr === true) blendModeStr = 'Invert';
  if (blendModeStr === false) blendModeStr = 'Normal';
  if (!blendModeStr) blendModeStr = 'Difference';

  let blendModeVal = 0.0; // Normal
  if (blendModeStr === 'Invert') blendModeVal = 1.0;
  else if (blendModeStr === 'Difference') blendModeVal = 2.0;
  gl.uniform1f(uTextBlendMode, blendModeVal);

  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
