import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Immersive AR – Tap-to-Place
 *
 * Uses WebXR hit-test to detect real-world surfaces and places a 3D model
 * exactly where the user taps. The model stays anchored in the real world
 * as the user walks around it.
 */

// Path to the default model. Update this constant to swap to a different model.
const DEFAULT_MODEL_URL = '/models/vase/scene.gltf';

// Target height in metres after normalisation.
const MODEL_TARGET_HEIGHT = 0.25;

class ARApp {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.reticle = null;
    this.model = null;
    this.controller = null;

    this.hitTestSource = null;
    this.hitTestSourceRequested = false;
    this.modelPlaced = false;

    this._boundRender = this._render.bind(this);

    this._init();
    this._bindUI();
    this._loadModel(DEFAULT_MODEL_URL);
  }

  // ─── Private: scene / renderer setup ───────────────────────────────────────

  _init() {
    // Scene
    this.scene = new THREE.Scene();

    // Camera (updated every frame by WebXR)
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20,
    );

    // Lighting
    const hemi = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    hemi.position.set(0.5, 1, 0.25);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(0.5, 1, 0.75);
    this.scene.add(dir);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    document.getElementById('canvas-container').appendChild(this.renderer.domElement);

    // Reticle (ring that tracks detected surfaces)
    this.reticle = this._createReticle();
    this.scene.add(this.reticle);

    // Model container – populated asynchronously by _loadModel()
    this.model = new THREE.Group();
    this.model.visible = false;
    this.scene.add(this.model);

    // XR controller – "select" fires on screen tap
    this.controller = this.renderer.xr.getController(0);
    this.controller.addEventListener('select', () => this._onSelect());
    this.scene.add(this.controller);

    window.addEventListener('resize', () => this._onResize());
  }

  _createReticle() {
    // Flat ring lying in the XZ plane (horizontal)
    const geo = new THREE.RingGeometry(0.12, 0.16, 32);
    // Default ring is in XY plane; rotate to lie flat on surfaces
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    return mesh;
  }

  /**
   * Load a glTF/glB model from `url`, normalise it to MODEL_TARGET_HEIGHT metres
   * tall, and shift it so its base rests at y = 0.
   *
   * Call this method again to swap to a different model at any time:
   *   app._loadModel('/models/chair/scene.gltf');
   *
   * @param {string} url - Root-relative path to the .gltf or .glb file.
   */
  _loadModel(url) {
    this._showLoadingMessage('Loading model…');

    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        // Replace any previous model content
        this.model.clear();

        const root = gltf.scene;

        // ── Normalise scale so the model is MODEL_TARGET_HEIGHT metres tall ──
        const box = new THREE.Box3().setFromObject(root);
        const height = box.max.y - box.min.y;
        if (height > 0) {
          root.scale.setScalar(MODEL_TARGET_HEIGHT / height);
        }

        // ── Shift so the base of the model rests exactly at y = 0 ──
        box.setFromObject(root); // recompute after scale change
        root.position.y -= box.min.y;

        this.model.add(root);
        this._hideLoadingMessage();
      },
      undefined,
      (_err) => {
        this._showError(
          'Failed to load 3D model. Check that the model files are present and reload the page.',
        );
        this._hideLoadingMessage();
      },
    );
  }

  // ─── Private: UI wiring ─────────────────────────────────────────────────────

  _bindUI() {
    document.getElementById('start-btn').addEventListener('click', () => this.startAR());
    document.getElementById('reset-btn').addEventListener('click', () => this.reset());
  }

  // ─── Private: XR event handlers ─────────────────────────────────────────────

  _onSelect() {
    if (this.reticle.visible) {
      // Place model at the current reticle position
      const pos = new THREE.Vector3().setFromMatrixPosition(this.reticle.matrix);
      this.model.position.copy(pos);
      // Orient the model so it faces the same direction as the reticle surface
      this.model.quaternion.setFromRotationMatrix(this.reticle.matrix);
      this.model.visible = true;
      this.modelPlaced = true;

      document.getElementById('reset-btn').style.display = 'block';
      document.getElementById('instructions').textContent = 'Tap again to reposition · Reset to start over';
    }
  }

  _onSessionEnd() {
    this.hitTestSource = null;
    this.hitTestSourceRequested = false;
    this.modelPlaced = false;
    this.model.visible = false;
    this.reticle.visible = false;

    document.getElementById('start-screen').style.display = 'flex';
    document.getElementById('instructions').style.display = 'none';
    document.getElementById('reset-btn').style.display = 'none';

    this.renderer.setAnimationLoop(null);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ─── Private: render loop ────────────────────────────────────────────────────

  _render(_time, frame) {
    if (frame) {
      const refSpace = this.renderer.xr.getReferenceSpace();
      const session = this.renderer.xr.getSession();

      // Request hit-test source once per session
      if (!this.hitTestSourceRequested) {
        session
          .requestReferenceSpace('viewer')
          .then((viewerSpace) => {
            session
              .requestHitTestSource({ space: viewerSpace })
              .then((source) => {
                this.hitTestSource = source;
              })
              .catch(() => {
                this._showError('Hit-test not available on this device.');
              });
          });
        this.hitTestSourceRequested = true;
      }

      // Move reticle to the nearest detected surface
      if (this.hitTestSource) {
        const results = frame.getHitTestResults(this.hitTestSource);
        if (results.length > 0) {
          const pose = results[0].getPose(refSpace);
          this.reticle.visible = true;
          this.reticle.matrix.fromArray(pose.transform.matrix);
        } else {
          this.reticle.visible = false;
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  // ─── Private: loading / error display ──────────────────────────────────────

  _showLoadingMessage(msg) {
    const el = document.getElementById('loading-msg');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
    }
  }

  _hideLoadingMessage() {
    const el = document.getElementById('loading-msg');
    if (el) el.style.display = 'none';
  }

  _showError(msg) {
    const el = document.getElementById('error-msg');
    el.textContent = msg;
    el.style.display = 'block';
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /** Start an immersive-ar WebXR session. */
  async startAR() {
    if (!navigator.xr) {
      this._showError(
        'WebXR is not available. Please open this page in Chrome on an Android device over HTTPS.',
      );
      return;
    }

    let supported = false;
    try {
      supported = await navigator.xr.isSessionSupported('immersive-ar');
    } catch {
      // isSessionSupported can throw in some browsers
    }

    if (!supported) {
      this._showError(
        'Immersive AR is not supported on this device. ' +
          'Please use a supported Android device running Chrome 81+.',
      );
      return;
    }

    try {
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.getElementById('overlay') },
      });

      this.renderer.xr.setReferenceSpaceType('local');
      await this.renderer.xr.setSession(session);

      session.addEventListener('end', () => this._onSessionEnd());

      // Hide the start screen, show in-session UI
      document.getElementById('start-screen').style.display = 'none';
      document.getElementById('instructions').style.display = 'block';
      document.getElementById('instructions').textContent =
        'Point at a surface to place the object';

      this.renderer.setAnimationLoop(this._boundRender);
    } catch (err) {
      this._showError(`Could not start AR session: ${err.message}`);
    }
  }

  /** Remove the placed model so the user can place it again. */
  reset() {
    this.model.visible = false;
    this.modelPlaced = false;
    document.getElementById('reset-btn').style.display = 'none';
    document.getElementById('instructions').textContent =
      'Point at a surface to place the object';
  }
}

// Boot
new ARApp();
