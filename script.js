// --- ALIGNMENT SETTINGS ---
// Adjust these if the original image and sketch image don't align perfectly!
// Change these values and refresh the page to see the difference.
const REAL_IMAGE_OFFSET_X = 0.0; // Example: try 0.01 or -0.01 to move left/right
const REAL_IMAGE_OFFSET_Y = 0.0; // Example: try 0.01 or -0.01 to move up/down
const REAL_IMAGE_SCALE = 1; // Example: 1.05 scales it up by 5%
// --------------------------

// Setup Canvas for Mouse Trail (Displacement Map)
const trailCanvas = document.createElement("canvas");
const trailCtx = trailCanvas.getContext("2d");
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
        targetParallax.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
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
camera.position.z = 10;

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

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
    // Background Image
    const bgAspect = bgTexture.image.width / bgTexture.image.height;
    const bgHeight = 24;
    const bgWidth = bgHeight * bgAspect;
    const bgGeometry = new THREE.PlaneGeometry(bgWidth, bgHeight);

    // Treat background as transparent if it has transparency, else it's solid
    const bgMaterial = new THREE.MeshBasicMaterial({
        map: bgTexture,
        transparent: true,
        depthWrite: false,
    });
    const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
    bgMesh.position.z = -15;
    scene.add(bgMesh);

    // Foreground Butterfly Material with Sketch-to-Real Reveal Trail
    const butterflyMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uImageSketch: { value: sketchTexture },
            uImageReal: { value: realTexture },
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
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D uImageSketch;
            uniform sampler2D uImageReal;
            uniform sampler2D uDisplacement;
            uniform vec2 uResolution;
            uniform vec2 uRealOffset;
            uniform float uRealScale;
            varying vec2 vUv;
            
            void main() {
                // Map screen coordinates (0 to 1) for full-screen mouse brush
                vec2 screenUv = gl_FragCoord.xy / uResolution.xy;
                
                vec4 disp = texture2D(uDisplacement, screenUv);
                float intensity = disp.r;
                
                // Adjust UV for the real image to align it perfectly with the sketch
                vec2 realUv = (vUv - 0.5) / uRealScale + 0.5 + uRealOffset;
                
                // Sample both images
                vec4 colorSketch = texture2D(uImageSketch, vUv);
                vec4 colorReal = texture2D(uImageReal, realUv);
                
                // --- FILTER TO REMOVE BLACK BACKGROUND ---
                // For Sketch:
                float maxColorSketch = max(colorSketch.r, max(colorSketch.g, colorSketch.b));
                // If the sketch itself also has a black background, this will mask it:
                float alphaSketch = smoothstep(0.02, 0.15, maxColorSketch);
                // If it's already a transparent PNG, we combine both:
                colorSketch.a = min(colorSketch.a, alphaSketch);
                
                // For Original (Real):
                float maxColorReal = max(colorReal.r, max(colorReal.g, colorReal.b));
                float alphaReal = smoothstep(0.02, 0.15, maxColorReal);
                colorReal.a = min(colorReal.a, alphaReal);
                // -----------------------------------------
                
                // Smooth reveal curve: where trail is drawn, show real image
                float revealFactor = smoothstep(0.0, 0.5, intensity);
                
                vec4 finalColor = mix(colorSketch, colorReal, revealFactor);
                
                gl_FragColor = finalColor;
            }
        `,
        transparent: true,
    });

    // Geometry for Butterfly
    const imgAspect = sketchTexture.image.width / sketchTexture.image.height;
    const planeHeight = 8;
    const planeWidth = planeHeight * imgAspect;

    const butterflyGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);

    // Butterfly Mesh
    const butterflyMesh = new THREE.Mesh(butterflyGeometry, butterflyMaterial);
    butterflyMesh.position.z = 0;
    scene.add(butterflyMesh);

    // Animation Loop
    const clock = new THREE.Clock();

    function drawTrail() {
        trailCtx.fillStyle = "rgba(0, 0, 0, 0.03)";
        trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);

        mouse.x += (targetMouse.x - mouse.x) * 0.15;
        mouse.y += (targetMouse.y - mouse.y) * 0.15;

        const dist = Math.hypot(mouse.x - prevMouse.x, mouse.y - prevMouse.y);

        if (dist > 0.1) {
            const brushSize = 150;
            const gradient = trailCtx.createRadialGradient(
                mouse.x,
                mouse.y,
                0,
                mouse.x,
                mouse.y,
                brushSize,
            );
            gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
            gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.5)");
            gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

            trailCtx.fillStyle = gradient;
            trailCtx.beginPath();
            trailCtx.arc(mouse.x, mouse.y, brushSize, 0, Math.PI * 2);
            trailCtx.fill();
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

        // Organic floating motion for butterfly
        butterflyMesh.position.y = Math.sin(elapsedTime * 1.5) * 0.1;

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

        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
});
