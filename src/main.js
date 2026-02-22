import * as THREE from 'three';

/**
 * Immersive AR – Tap-to-Place
 *
 * Uses WebXR hit-test to detect real-world surfaces and places a 3D model
 * exactly where the user taps. The model stays anchored in the real world
 * as the user walks around it.
 */
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

    // Placeholder 3D model
    this.model = this._createModel();
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

  _createModel() {
    // Simple placeholder object: a pedestal + body block
    const group = new THREE.Group();

    // Pedestal base
    const baseGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.015, 24);
    const baseMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.0075;
    group.add(base);

    // Main body
    const bodyGeo = new THREE.BoxGeometry(0.1, 0.18, 0.1);
    const bodyMat = new THREE.MeshPhongMaterial({
      color: 0x0a84ff,
      emissive: 0x003366,
      shininess: 60,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.105;
    group.add(body);

    // Small cap on top
    const capGeo = new THREE.SphereGeometry(0.055, 16, 8);
    const capMat = new THREE.MeshPhongMaterial({ color: 0x66ccff, emissive: 0x003366 });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 0.215;
    group.add(cap);

    return group;
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

  // ─── Private: error display ──────────────────────────────────────────────────

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
