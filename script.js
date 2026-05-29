// --- ALIGNMENT SETTINGS ---
// Adjust these if the original image and sketch image don't align perfectly!
// Change these values and refresh the page to see the difference.
const REAL_IMAGE_OFFSET_X = 0.0; // Example: try 0.01 or -0.01 to move left/right
const REAL_IMAGE_OFFSET_Y = 0.0; // Example: try 0.01 or -0.01 to move up/down
const REAL_IMAGE_SCALE = 1; // Example: 1.05 scales it up by 5%
// --------------------------

// Setup Canvas for Mouse Trail (Displacement Map)
const trailCanvas = document.createElement("canvas");
const trailCtx = trailCanvas.getContext("2d", { willReadFrequently: true });
let trailWidth = window.innerWidth;
let trailHeight = window.innerHeight;
trailCanvas.width = trailWidth;
trailCanvas.height = trailHeight;

const trailTexture = new THREE.CanvasTexture(trailCanvas);

// Mouse state for trail
const mouse = new THREE.Vector2(-1000, -1000);
const prevMouse = new THREE.Vector2(-1000, -1000);
const targetMouse = new THREE.Vector2(-1000, -1000);

// Mouse state for parallax
const mouseParallax = { x: 0, y: 0 };
const targetParallax = { x: 0, y: 0 };

window.addEventListener("mousemove", (e) => {
    targetMouse.x = e.clientX;
    targetMouse.y = e.clientY;

    targetParallax.x = (e.clientX / window.innerWidth) * 2 - 1;
    targetParallax.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

// Touch support
window.addEventListener("touchmove", (e) => {
    if (e.touches.length > 0) {
        targetMouse.x = e.touches[0].clientX;
        targetMouse.y = e.touches[0].clientY;

        targetParallax.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
        targetParallax.y = -e.touches[0].innerHeight * 2 + 1;
    }
});

// Three.js Setup
const container = document.getElementById("canvas-container");
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
);
camera.position.z = 11.5; // Start slightly zoomed out for the dolly-in effect

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// Loader States
const loaderState = {
    phase: 1,
    sketchProgress: 0.0,
    energyProgress: 0.0,
    crystalProgress: 0.0,
    interactiveProgress: 0.0,
    flapStrength: 0.0,
    flapSpeed: 1.5,
    breathStrength: 0.5,
    geometryProgress: 0.0,
    lightRayProgress: 0.25,
    shockwaveStrength: 0.0,
    shockwaveProgress: 0.0,
};

// Load Textures
const textureLoader = new THREE.TextureLoader();

Promise.all([
    new Promise((resolve) =>
        textureLoader.load("images/butterfly_sketch.png", resolve),
    ),
    new Promise((resolve) =>
        textureLoader.load("images/butterfly3.png", resolve),
    ),
    new Promise((resolve) =>
        textureLoader.load("images/background.png", resolve),
    ),
]).then(([sketchTexture, realTexture, bgTexture]) => {
    // --- 1. BACKGROUND SHADER ---
    const bgAspect = bgTexture.image.width / bgTexture.image.height;
    const bgHeight = 24;
    const bgWidth = bgHeight * bgAspect;
    const bgGeometry = new THREE.PlaneGeometry(bgWidth, bgHeight);

    const bgMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uImageBg: { value: bgTexture },
            uTime: { value: 0.0 },
            uGeometryProgress: { value: 0.0 },
            uLightRayProgress: { value: 0.25 },
            uShockwaveStrength: { value: 0.0 },
            uShockwaveProgress: { value: 0.0 },
            uResolution: {
                value: new THREE.Vector2(window.innerWidth, window.innerHeight),
            },
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D uImageBg;
            uniform float uTime;
            uniform float uGeometryProgress;
            uniform float uLightRayProgress;
            uniform float uShockwaveStrength;
            uniform float uShockwaveProgress;
            uniform vec2 uResolution;
            varying vec2 vUv;

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }
            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                           mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
            }
            float fbm(vec2 p) {
                float v = 0.0;
                float a = 0.5;
                mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
                for (int i = 0; i < 4; ++i) {
                    v += a * noise(p);
                    p = rot * p * 2.0 + vec2(100.0);
                    a *= 0.5;
                }
                return v;
            }

            void main() {
                // 1. Refractive Chromatic Shockwave Ripple (Signature Element!)
                float shDist = distance(vUv, vec2(0.5));
                float shWidth = 0.15;
                float shWave = smoothstep(uShockwaveProgress - shWidth, uShockwaveProgress, shDist)
                             * smoothstep(uShockwaveProgress + shWidth, uShockwaveProgress, shDist);
                shWave = pow(shWave, 2.0) * uShockwaveStrength * 3.5;
                
                // Distort sampling coordinates based on radial direction from center
                vec2 radialDir = vUv - vec2(0.5);
                float len = length(radialDir);
                vec2 refractOffset = vec2(0.0);
                if (len > 0.0) {
                    refractOffset = (radialDir / len) * shWave * 0.06;
                }
                
                // Sample background with Chromatic Aberration (red, green, blue split along the ripple direction)
                vec2 sampledUv = vUv + refractOffset;
                vec3 bgCol = vec3(
                    texture2D(uImageBg, sampledUv + refractOffset * 0.2).r,
                    texture2D(uImageBg, sampledUv).g,
                    texture2D(uImageBg, sampledUv - refractOffset * 0.2).b
                );
                
                // Boost original background intensity slightly for a less dark backdrop
                bgCol *= 1.02;

                // 2. Volumetric fog/clouds (warmer, brighter deep purple/lavender glow)
                vec2 fogUv = vUv * 2.0 + vec2(uTime * 0.03, uTime * 0.015);
                float fogPattern = fbm(fogUv);
                vec3 fogColor = vec3(0.09, 0.07, 0.18); 
                vec3 color = mix(bgCol, fogColor, fogPattern * 0.35);
                
                // 3. Central ambient halo glow (brightens behind the butterfly)
                float centerHalo = smoothstep(0.8, 0.0, len);
                color += vec3(0.12, 0.1, 0.22) * centerHalo;
                
                // 4. Add rainbow shimmer inside the shockwave wave front
                vec3 waveIrid = vec3(
                    sin(shDist * 25.0 - uTime * 6.0) * 0.5 + 0.5,
                    sin(shDist * 30.0 + uTime * 5.0) * 0.5 + 0.5,
                    cos(shDist * 35.0 - uTime * 7.0) * 0.5 + 0.5
                );
                color += waveIrid * shWave * 0.35;
                
                // 5. Paper grain texture
                float grain = hash(vUv * 1200.0 + vec2(uTime * 0.005)) * 0.03;
                color -= vec3(grain);

                gl_FragColor = vec4(color, 1.0);
            }
        `,
        transparent: true,
        depthWrite: false,
    });
    const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
    bgMesh.position.z = -15;
    scene.add(bgMesh);

    // --- 2. FOREGROUND BUTTERFLY SHADER ---
    const butterflyMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uImageSketch: { value: sketchTexture },
            uImageReal: { value: realTexture },
            uImageBg: { value: bgTexture },
            uDisplacement: { value: trailTexture },
            uResolution: {
                value: new THREE.Vector2(window.innerWidth, window.innerHeight),
            },
            uRealOffset: {
                value: new THREE.Vector2(
                    REAL_IMAGE_OFFSET_X,
                    REAL_IMAGE_OFFSET_Y,
                ),
            },
            uRealScale: { value: REAL_IMAGE_SCALE },
            uSketchProgress: { value: 0.0 },
            uEnergyProgress: { value: 0.0 },
            uCrystalProgress: { value: 0.0 },
            uInteractiveProgress: { value: 0.0 },
            uTime: { value: 0.0 },
            uFlapStrength: { value: 0.0 },
            uFlapSpeed: { value: 1.5 },
            uBreathStrength: { value: 0.5 },
            uShockwaveProgress: { value: 0.0 },
        },
        vertexShader: `
            uniform float uTime;
            uniform float uFlapStrength;
            uniform float uFlapSpeed;
            uniform float uBreathStrength;
            uniform float uSketchProgress;
            varying vec2 vUv;

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }
            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                           mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
            }

            void main() {
                vUv = uv;
                vec3 pos = position;

                // 1. Organic sketching line distortion
                if (uSketchProgress > 0.0 && uSketchProgress < 1.0) {
                    float j = noise(pos.xy * 8.0 + uTime * 15.0);
                    pos.xy += vec2(j) * 0.04 * (1.0 - uSketchProgress);
                }

                // 2. Wing Flap (Bending around Y axis)
                float fold = sin(uTime * uFlapSpeed) * uFlapStrength;
                float distFromCenter = abs(pos.x);
                pos.z += pow(distFromCenter, 1.6) * fold;
                pos.z += sin(pos.y * 1.5 - uTime * 4.0) * distFromCenter * 0.12 * uFlapStrength;

                // 3. Breathing motion
                float breath = sin(uTime * 1.3) * 0.015 * uBreathStrength;
                pos.xy *= (1.0 + breath);

                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D uImageSketch;
            uniform sampler2D uImageReal;
            uniform sampler2D uImageBg;
            uniform sampler2D uDisplacement;
            uniform vec2 uResolution;
            uniform vec2 uRealOffset;
            uniform float uRealScale;

            uniform float uSketchProgress;
            uniform float uEnergyProgress;
            uniform float uCrystalProgress;
            uniform float uInteractiveProgress;
            uniform float uShockwaveProgress;
            uniform float uTime;

            varying vec2 vUv;

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }
            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                           mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
            }

            void main() {
                vec2 realUv = (vUv - 0.5) / uRealScale + 0.5 + uRealOffset;
                
                vec4 colorSketch = texture2D(uImageSketch, vUv);
                vec4 colorReal = texture2D(uImageReal, realUv);
                
                // Keying backgrounds
                float maxColorSketch = max(colorSketch.r, max(colorSketch.g, colorSketch.b));
                float alphaSketch = smoothstep(0.02, 0.15, maxColorSketch);
                colorSketch.a = min(colorSketch.a, alphaSketch);
                
                float maxColorReal = max(colorReal.r, max(colorReal.g, colorReal.b));
                float alphaReal = smoothstep(0.02, 0.15, maxColorReal);
                colorReal.a = min(colorReal.a, alphaReal);
                
                // Sketch organic reveal sweep
                float revealVal = vUv.y + noise(vUv * 8.0) * 0.12;
                float sketchReveal = smoothstep(revealVal - 0.1, revealVal, uSketchProgress * 1.25 - 0.1);
                colorSketch.a *= sketchReveal;

                // Energy Awakening (Rainbow colors flowing from center outwards and vanishing quickly)
                float veins = smoothstep(0.35, 0.85, 1.0 - colorReal.g);
                float distFromCenter = distance(vUv, vec2(0.5));
                float energyWave = smoothstep(0.12, 0.0, abs(distFromCenter - uEnergyProgress * 0.9));
                
                float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
                vec3 rColor1 = vec3(1.0, 0.25, 0.5);  // Neon Pink
                vec3 rColor2 = vec3(0.2, 0.8, 1.0);   // Cyan
                vec3 rColor3 = vec3(0.65, 0.2, 1.0);  // Purple
                vec3 rColor4 = vec3(1.0, 0.85, 0.2);  // Gold

                vec3 rainbowCol = mix(rColor1, rColor2, sin(angle * 2.0 + uTime * 4.0) * 0.5 + 0.5);
                rainbowCol = mix(rainbowCol, rColor3, cos(angle * 3.0 - uTime * 3.0) * 0.5 + 0.5);
                rainbowCol = mix(rainbowCol, rColor4, sin(distFromCenter * 5.0 - uTime * 2.0) * 0.5 + 0.5);

                // Vanish quickly: completely gone when uEnergyProgress >= 0.7
                float energyFade = clamp(1.0 - uEnergyProgress * 1.43, 0.0, 1.0);
                vec3 energyColor = rainbowCol * energyWave * veins * 3.5 * energyFade;

                vec4 sketchWithEnergy = colorSketch;
                sketchWithEnergy.rgb += energyColor * colorSketch.a;
                
                // Crystal/Refractive transformation (Radial sweep from inside outwards)
                float sweepVal = distFromCenter + noise(vUv * 6.0) * 0.08;
                float sweepProgress = smoothstep(sweepVal - 0.08, sweepVal, uCrystalProgress * 0.85 - 0.08);
                
                float crest = smoothstep(0.1, 0.0, abs(sweepVal - uCrystalProgress * 0.85 + 0.04));
                vec3 crestColor = vec3(0.9, 0.35, 1.0) * crest * 4.0;
                
                vec3 irid = vec3(
                    sin(vUv.x * 12.0 + uTime * 3.0) * 0.5 + 0.5,
                    sin(vUv.y * 15.0 - uTime * 2.5) * 0.5 + 0.5,
                    cos((vUv.x + vUv.y) * 9.0 + uTime) * 0.5 + 0.5
                );
                
                vec2 screenUv = gl_FragCoord.xy / uResolution;
                vec2 refractOffset = vec2(
                    sin(vUv.x * 30.0 + uTime) * 0.012,
                    cos(vUv.y * 30.0 + uTime) * 0.012
                ) * (1.0 - uInteractiveProgress) * sweepProgress;
                
                vec3 refractColor = vec3(
                    texture2D(uImageBg, screenUv + refractOffset * 1.35).r,
                    texture2D(uImageBg, screenUv + refractOffset * 1.0).g,
                    texture2D(uImageBg, screenUv + refractOffset * 0.65).b
                );
                
                vec3 crystalLook = mix(colorReal.rgb, refractColor * vec3(1.1, 1.05, 1.2), 0.4 * (1.0 - uInteractiveProgress));
                vec3 revealedRGB = mix(colorReal.rgb, crystalLook + irid * 0.35, 0.6);
                revealedRGB += crestColor * colorReal.a;
                
                vec4 revealedColor = vec4(revealedRGB, colorReal.a);
                
                // Expanding shockwave color ripple (leaves center clean sketch)
                float shDist = distance(vUv, vec2(0.5));
                float shWidth = 0.15;
                float shWave = smoothstep(uEnergyProgress - shWidth, uEnergyProgress, shDist)
                             * smoothstep(uEnergyProgress + shWidth, uEnergyProgress, shDist);
                shWave = pow(shWave, 2.0) * 4.0; // Boost peak
                
                // Mouse reveal mapping
                float mouseTrailIntensity = texture2D(uDisplacement, screenUv).r;
                float baseReveal = mix(sweepProgress, smoothstep(0.0, 0.4, mouseTrailIntensity), uInteractiveProgress);
                
                // Combine with shockwave reveal
                float finalRevealFactor = max(baseReveal, shWave);
                
                vec4 finalColor = mix(sketchWithEnergy, revealedColor, finalRevealFactor);
                
                // Add shockwave glow effect (carrying vibrant colors)
                vec3 shIrid = vec3(
                    sin(vUv.x * 25.0 - uTime * 6.0) * 0.5 + 0.5,
                    sin(vUv.y * 25.0 + uTime * 5.0) * 0.5 + 0.5,
                    cos((vUv.x + vUv.y) * 18.0 - uTime * 7.0) * 0.5 + 0.5
                );
                vec3 shGlow = shIrid * shWave * 1.8;
                finalColor.rgb += shGlow * colorReal.a;
                
                gl_FragColor = finalColor;
            }
        `,
        transparent: true,
    });

    const imgAspect = sketchTexture.image.width / sketchTexture.image.height;
    const planeHeight = 8;
    const planeWidth = planeHeight * imgAspect;
    const butterflyGeometry = new THREE.PlaneGeometry(
        planeWidth,
        planeHeight,
        64,
        64,
    );

    const butterflyMesh = new THREE.Mesh(butterflyGeometry, butterflyMaterial);
    butterflyMesh.position.z = 0;
    scene.add(butterflyMesh);

    // --- 3. PARTICLES SYSTEM SETUP ---
    // Helper to generate soft circular particles dynamically on the fly
    function createCircleTexture() {
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext("2d");
        const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
        grad.addColorStop(0, "rgba(255, 255, 255, 1)");
        grad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 16, 16);
        return new THREE.CanvasTexture(canvas);
    }
    const circleTexture = createCircleTexture();

    const particleCount = 150;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    const particlesData = [];

    function getButterflyCurvePoint(t) {
        const r =
            Math.exp(Math.cos(t)) -
            2 * Math.cos(4 * t) +
            Math.pow(Math.sin(t / 12), 5);
        const x = r * Math.sin(t) * 1.25;
        const y = (r * Math.cos(t) - 0.8) * 1.25; // Adjusted offset for better center alignment
        return new THREE.Vector3(x, y, 0);
    }

    for (let i = 0; i < particleCount; i++) {
        const data = {
            type: i < 50 ? "graphite" : i < 100 ? "ember" : "petal",
            pos: new THREE.Vector3(
                (Math.random() - 0.5) * 18,
                (Math.random() - 0.5) * 14,
                (Math.random() - 0.5) * 4 - 2,
            ),
            target: new THREE.Vector3(0, 0, 0),
            vel: new THREE.Vector3(
                (Math.random() - 0.5) * 0.015,
                (Math.random() - 0.5) * 0.015,
                (Math.random() - 0.5) * 0.008,
            ),
            seed: Math.random() * 100,
            size: Math.random() * 4 + 1.5,
            alpha: Math.random() * 0.35 + 0.1,
            color: new THREE.Color(),
        };

        if (data.type === "graphite") {
            const t = Math.random() * Math.PI * 2;
            const pt = getButterflyCurvePoint(t);
            // Highly randomized, misty 3D distribution around the butterfly (prevents solid center blockages)
            const disturbFactor = 2.5;
            pt.x += (Math.random() - 0.5) * 2.6 * disturbFactor;
            pt.y += (Math.random() - 0.5) * 2.8 * disturbFactor;
            pt.z += (Math.random() - 0.5) * 2.5 * disturbFactor;
            data.target.copy(pt);
            // Ultra-subtle grey charcoal tone
            data.color.setHSL(0.0, 0.0, Math.random() * 0.12 + 0.08);
            data.size = Math.random() * 1.33 + 0.67; // 2/3 size (Tiny specs)
            data.alpha = Math.random() * 0.22 + 0.04;
        } else if (data.type === "ember") {
            // Wider, more randomized spawn area so they don't crowd in the center
            data.pos.set(
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 6 - 2,
                (Math.random() - 0.5) * 4,
            );
            data.color.setHSL(0.85 + Math.random() * 0.1, 0.85, 0.65);
            data.alpha = 0.0;
            data.size = Math.random() * 2.0 + 1.0; // 2/3 size
        } else {
            // Petals: soft light pink floating around, wide distribution
            data.pos.set(
                (Math.random() - 0.5) * 18,
                (Math.random() - 0.5) * 14,
                (Math.random() - 0.5) * 6 - 3,
            );
            data.color.setHSL(0.95 + Math.random() * 0.05, 0.7, 0.85);
            data.alpha = 0.0;
            data.size = Math.random() * 2.66 + 1.33; // 2/3 size
        }

        particlesData.push(data);

        positions[i * 3] = data.pos.x;
        positions[i * 3 + 1] = data.pos.y;
        positions[i * 3 + 2] = data.pos.z;

        colors[i * 3] = data.color.r * data.alpha;
        colors[i * 3 + 1] = data.color.g * data.alpha;
        colors[i * 3 + 2] = data.color.b * data.alpha;

        sizes[i] = data.size;
    }

    particleGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3),
    );
    particleGeometry.setAttribute(
        "color",
        new THREE.BufferAttribute(colors, 3),
    );

    const particleMaterial = new THREE.PointsMaterial({
        size: 0.12,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        map: circleTexture,
        alphaTest: 0.001,
    });

    const particlePoints = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particlePoints);

    // --- 4. MASTER GSAP CINEMATIC TIMELINE ---
    const tl = gsap.timeline();

    // PHASE 01 — EMPTY CANVAS (0.0s - 2.5s)
    tl.to(
        "#loader-ui .concept-title",
        { opacity: 1, y: 0, duration: 1.2, ease: "power2.out" },
        0.5,
    );
    tl.to(
        "#loader-ui .loader-progress-subtle",
        { opacity: 1, y: 0, duration: 1.2, ease: "power2.out" },
        0.5,
    );
    tl.to(
        "#text-phase-1",
        {
            opacity: 1,
            filter: "blur(0px)",
            scale: 1,
            duration: 1.5,
            ease: "power2.out",
        },
        0.8,
    );

    // PHASE 02 — SKETCH CREATION (2.5s - 5.5s)
    tl.add(() => {
        const prog = document.getElementById("progress-val");
        if (prog) prog.innerText = "02 / 07";
        loaderState.phase = 2;
    }, 2.5);
    tl.to(
        "#text-phase-1",
        {
            opacity: 0,
            filter: "blur(12px)",
            scale: 1.06,
            duration: 0.7,
            ease: "power2.in",
        },
        2.5,
    );
    tl.to(
        "#text-phase-2",
        {
            opacity: 1,
            filter: "blur(0px)",
            scale: 1,
            duration: 1.2,
            ease: "power2.out",
        },
        3.0,
    );
    tl.to(
        loaderState,
        { sketchProgress: 1.0, duration: 3.0, ease: "power2.inOut" },
        2.5,
    );

    // PHASE 03 — ENERGY AWAKENING (5.5s - 8.5s)
    tl.add(() => {
        const prog = document.getElementById("progress-val");
        if (prog) prog.innerText = "03 / 07";
        loaderState.phase = 3;
    }, 5.5);
    tl.to(
        "#text-phase-2",
        {
            opacity: 0,
            filter: "blur(12px)",
            scale: 1.06,
            duration: 0.7,
            ease: "power2.in",
        },
        5.5,
    );
    tl.to(
        "#text-phase-3",
        {
            opacity: 1,
            filter: "blur(0px)",
            scale: 1,
            duration: 1.2,
            ease: "power2.out",
        },
        6.0,
    );
    tl.to(
        loaderState,
        {
            energyProgress: 1.0,
            flapStrength: 0.08,
            flapSpeed: 2.2,
            duration: 3.0,
            ease: "power2.inOut",
        },
        5.5,
    );

    // PHASE 04 — BREATH OF LIFE (8.5s - 10.5s)
    tl.add(() => {
        const prog = document.getElementById("progress-val");
        if (prog) prog.innerText = "04 / 07";
        loaderState.phase = 4;
    }, 8.5);
    tl.to(
        loaderState,
        {
            flapStrength: 0.14,
            flapSpeed: 2.8,
            breathStrength: 1.4,
            duration: 2.0,
            ease: "power2.inOut",
        },
        8.5,
    );

    // PHASE 05 — WORLD REACTION (10.5s - 12.0s)
    tl.add(() => {
        const prog = document.getElementById("progress-val");
        if (prog) prog.innerText = "05 / 07";
        loaderState.phase = 5;
    }, 10.5);
    tl.to(
        loaderState,
        {
            geometryProgress: 1.0,
            lightRayProgress: 1.0,
            duration: 1.5,
            ease: "power2.out",
        },
        10.5,
    );

    // PHASE 06 — SIGNATURE MOMENT (12.0s - 14.5s)
    tl.add(() => {
        const prog = document.getElementById("progress-val");
        if (prog) prog.innerText = "06 / 07";
        loaderState.phase = 6;
    }, 12.0);
    tl.to(
        "#text-phase-3",
        {
            opacity: 0,
            filter: "blur(12px)",
            scale: 1.06,
            duration: 0.7,
            ease: "power2.in",
        },
        12.0,
    );
    tl.to(
        "#text-phase-4",
        {
            opacity: 1,
            filter: "blur(0px)",
            scale: 1,
            duration: 1.2,
            ease: "power2.out",
        },
        12.5,
    );
    tl.to(
        loaderState,
        { crystalProgress: 1.0, duration: 2.5, ease: "power3.inOut" },
        12.0,
    );

    // PHASE 07 — HERO REVEAL & INTERACTIVE STATE (14.5s - 16.0s+)
    tl.add(() => {
        const prog = document.getElementById("progress-val");
        if (prog) prog.innerText = "07 / 07";
        loaderState.phase = 7;
    }, 14.5);

    // Fade out Loader UI overlay
    tl.to(
        "#loader-ui",
        { opacity: 0, duration: 1.5, ease: "power2.out" },
        14.5,
    );

    // Fade in Main Web Interface UI (if it exists)
    const webInterface = document.getElementById("web-interface");
    if (webInterface) {
        tl.to(
            webInterface,
            { opacity: 1, duration: 1.5, ease: "power2.out" },
            14.8,
        );
        tl.add(() => {
            webInterface.style.pointerEvents = "auto";
        }, 14.8);
    }

    // Camera Dolly-in
    tl.to(
        camera.position,
        { z: 10.0, duration: 14.5, ease: "power2.inOut" },
        0,
    );

    // Trigger powerful wing flap + shockwave push
    tl.to(
        loaderState,
        {
            flapStrength: 0.2,
            flapSpeed: 1.5,
            shockwaveStrength: 1.0,
            duration: 1.5,
            ease: "power2.inout",
        },
        14.5,
    );

    // Animate shockwave sweep progress
    tl.to(
        loaderState,
        {
            shockwaveProgress: 1.5,
            duration: 1.5,
            ease: "power2.out",
        },
        14.5,
    );

    // Settle to interactive mouse trail state
    tl.to(
        loaderState,
        {
            flapStrength: 0.05,
            flapSpeed: 1.5,
            breathStrength: 0.5,
            shockwaveStrength: 0.0,
            interactiveProgress: 1.0,
            duration: 1.5,
            ease: "power2.out",
        },
        14.85,
    );

    // Animation Loop
    const clock = new THREE.Clock();

    function drawTrail() {
        trailCtx.fillStyle = "rgba(0, 0, 0, 0.03)";
        trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);

        mouse.x += (targetMouse.x - mouse.x) * 0.1;
        mouse.y += (targetMouse.y - mouse.y) * 0.1;

        const dist = Math.hypot(mouse.x - prevMouse.x, mouse.y - prevMouse.y);

        if (dist > 0.1) {
            const brushSize = 150;
            const steps = Math.max(1, Math.ceil(dist / 5));

            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const ix = prevMouse.x + (mouse.x - prevMouse.x) * t;
                const iy = prevMouse.y + (mouse.y - prevMouse.y) * t;

                const gradient = trailCtx.createRadialGradient(
                    ix,
                    iy,
                    0,
                    ix,
                    iy,
                    brushSize,
                );
                gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
                gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.5)");
                gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

                trailCtx.fillStyle = gradient;
                trailCtx.beginPath();
                trailCtx.arc(ix, iy, brushSize, 0, Math.PI * 2);
                trailCtx.fill();
            }
        }

        prevMouse.x = mouse.x;
        prevMouse.y = mouse.y;

        trailTexture.needsUpdate = true;
    }

    function animate() {
        requestAnimationFrame(animate);

        const elapsedTime = clock.getElapsedTime();

        drawTrail();

        // Parallax - Smooth Camera Movement
        mouseParallax.x += (targetParallax.x - mouseParallax.x) * 0.05;
        mouseParallax.y += (targetParallax.y - mouseParallax.y) * 0.05;

        camera.position.x = mouseParallax.x * 0.4;
        camera.position.y = mouseParallax.y * 0.4;
        camera.lookAt(0, 0, 0);

        // Update Materials Uniforms
        if (bgMaterial) {
            bgMaterial.uniforms.uTime.value = elapsedTime;
            bgMaterial.uniforms.uGeometryProgress.value =
                loaderState.geometryProgress;
            bgMaterial.uniforms.uLightRayProgress.value =
                loaderState.lightRayProgress;
            bgMaterial.uniforms.uShockwaveStrength.value =
                loaderState.shockwaveStrength;
            bgMaterial.uniforms.uShockwaveProgress.value =
                loaderState.shockwaveProgress;
        }

        if (butterflyMaterial) {
            butterflyMaterial.uniforms.uTime.value = elapsedTime;
            butterflyMaterial.uniforms.uSketchProgress.value =
                loaderState.sketchProgress;
            butterflyMaterial.uniforms.uEnergyProgress.value =
                loaderState.energyProgress;
            butterflyMaterial.uniforms.uCrystalProgress.value =
                loaderState.crystalProgress;
            butterflyMaterial.uniforms.uInteractiveProgress.value =
                loaderState.interactiveProgress;
            butterflyMaterial.uniforms.uFlapStrength.value =
                loaderState.flapStrength;
            butterflyMaterial.uniforms.uFlapSpeed.value = loaderState.flapSpeed;
            butterflyMaterial.uniforms.uBreathStrength.value =
                loaderState.breathStrength;
            butterflyMaterial.uniforms.uShockwaveProgress.value =
                loaderState.shockwaveProgress;
        }

        // Particle System CPU Animation
        const posAttr = particlePoints.geometry.attributes.position;
        const colorAttr = particlePoints.geometry.attributes.color;

        for (let i = 0; i < particleCount; i++) {
            const p = particlesData[i];

            if (p.type === "graphite") {
                if (loaderState.phase >= 2) {
                    p.pos.lerp(p.target, 0.045);
                    // Add subtle vortex/swirl
                    const orbitRadius =
                        0.12 * (1.0 - loaderState.sketchProgress);
                    p.pos.x +=
                        Math.sin(elapsedTime * 6.0 + p.seed) *
                        orbitRadius *
                        0.01;
                    p.pos.y +=
                        Math.cos(elapsedTime * 6.0 + p.seed) *
                        orbitRadius *
                        0.01;
                } else {
                    p.pos.x += Math.sin(elapsedTime * 0.4 + p.seed) * 0.002;
                    p.pos.y += Math.cos(elapsedTime * 0.4 + p.seed) * 0.0015;
                }
                p.alpha = (1.0 - loaderState.sketchProgress) * 0.55;
            } else if (p.type === "ember") {
                if (loaderState.phase >= 3) {
                    p.alpha = Math.min(
                        0.85,
                        loaderState.energyProgress *
                            (Math.sin(elapsedTime * 3.5 + p.seed) * 0.3 + 0.7),
                    );
                    p.pos.y += 0.02 + Math.random() * 0.012;
                    p.pos.x += Math.sin(elapsedTime * 2.0 + p.seed) * 0.007;

                    if (p.pos.y > 6.0) {
                        p.pos.y = -3.0 + (Math.random() - 0.5) * 2;
                        p.pos.x = (Math.random() - 0.5) * 4;
                    }
                }
            } else if (p.type === "petal") {
                if (loaderState.phase >= 5) {
                    p.alpha = Math.min(0.65, p.alpha + 0.015);
                    p.pos.y -= 0.018;
                    p.pos.x += Math.sin(elapsedTime * 0.8 + p.seed) * 0.014;
                    p.pos.z += Math.cos(elapsedTime * 0.5 + p.seed) * 0.004;

                    if (p.pos.y < -6.0) {
                        p.pos.y = 6.0;
                        p.pos.x = (Math.random() - 0.5) * 16;
                    }
                }
            }

            // Shockwave explosion push in Phase 7
            if (loaderState.shockwaveStrength > 0.0) {
                const dx = p.pos.x;
                const dy = p.pos.y;
                const d = Math.hypot(dx, dy) + 0.01;
                if (d < 10.0) {
                    const force =
                        (1.0 - d / 10.0) * loaderState.shockwaveStrength * 0.65;
                    p.pos.x += (dx / d) * force;
                    p.pos.y += (dy / d) * force;
                }
            }

            posAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
            colorAttr.setXYZ(
                i,
                p.color.r * p.alpha,
                p.color.g * p.alpha,
                p.color.b * p.alpha,
            );
        }
        posAttr.needsUpdate = true;
        colorAttr.needsUpdate = true;

        renderer.render(scene, camera);
    }

    animate();

    window.addEventListener("resize", () => {
        trailWidth = window.innerWidth;
        trailHeight = window.innerHeight;
        trailCanvas.width = trailWidth;
        trailCanvas.height = trailHeight;

        butterflyMaterial.uniforms.uResolution.value.set(
            trailWidth,
            trailHeight,
        );
        if (bgMaterial.uniforms.uResolution) {
            bgMaterial.uniforms.uResolution.value.set(trailWidth, trailHeight);
        }

        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
});
