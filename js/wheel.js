// The 3D wheel, ported from the TD network:
//   Pattern CHOPs (cos/sin, Phase = rotation)  -> card positions on an oval
//   pat_ry / aspect                            -> one shared card angle, card width = image aspect
//   cam_orbit Null + orthographic cam_axo      -> orbit group + OrthographicCamera
//   focus + featured CHOPs                     -> featuredIndex()

import * as THREE from 'three';

let renderer, scene, camera, orbit;
const meshes = new Map();       // item key -> mesh
let order = [];                 // item keys in wheel order
const geometry = new THREE.PlaneGeometry(1, 1);
const layout = { cx: 0.5, cy: 0.5 };   // where the wheel centre sits on screen (fractions)

export function initWheel(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  camera.position.z = 50;                 // like cam_axo sitting 50 units along the orbit's Z
  orbit = new THREE.Group();
  orbit.rotation.order = 'YXZ';           // yaw (azimuth) outside, pitch (elevation) inside: TD's 'zxy' order
  orbit.add(camera);
  scene.add(orbit);
}

// Screen position of the wheel centre, as fractions of the canvas (0..1 from left, 0..1 from top)
export function setLayout(cx, cy) { layout.cx = cx; layout.cy = cy; }

export function setItems(items, removed = []) {
  for (const it of removed) {
    const m = meshes.get(it.key);
    if (m) { scene.remove(m); m.material.map.dispose(); m.material.dispose(); meshes.delete(it.key); }
  }
  for (const it of items) {
    if (meshes.has(it.key)) continue;
    const tex = new THREE.CanvasTexture(it.card);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    mesh.scale.set(it.aspect, 1, 1);      // cards are 1 unit tall, as wide as the image's aspect
    meshes.set(it.key, mesh);
    scene.add(mesh);
  }
  order = items.map((it) => it.key);
}

// Wheel rotation in turns: coarse spin plus whole-image fine steps
export function rotation(v) {
  const n = Math.max(order.length, 1);
  return v.spin + Math.round(v.fine) / n;
}

// Where on the oval the focus point is, in turns: the point furthest in screen direction
// 'focus_dir' (0 = straight right on screen, 90 = toward the viewer), as in the 'focus' CHOP
function focusTurns(v) {
  const a = (v.azimuth - v.focus_dir) * Math.PI / 180;
  return ((Math.atan2(-v.radius_z * Math.sin(a), v.radius_x * Math.cos(a)) / (2 * Math.PI)) % 1 + 1) % 1;
}

// The card nearest the focus point, as in the 'featured' CHOP
export function featuredIndex(v) {
  const n = order.length;
  if (!n) return -1;
  return ((Math.round((focusTurns(v) + rotation(v)) * n) % n) + n) % n;
}

// The spin value that puts a card exactly on the focus point: 'step' cards on from the
// nearest one (0 = just line up the nearest card)
export function snapSpin(v, step) {
  const n = order.length;
  if (!n) return v.spin;
  const f = focusTurns(v);
  const k = Math.round((f + rotation(v)) * n) + step;
  return k / n - f - Math.round(v.fine) / n;
}

export function cardCount() { return order.length; }

export function render(v) {
  const n = order.length;
  const rot = rotation(v);
  const yaw = v.card_yaw * Math.PI / 180;
  order.forEach((key, i) => {
    const a = 2 * Math.PI * (i / n - rot);
    const m = meshes.get(key);
    m.position.set(v.radius_x * Math.cos(a), 0, v.radius_z * Math.sin(a));
    m.rotation.y = yaw;
  });

  orbit.rotation.set(-v.elevation * Math.PI / 180, v.azimuth * Math.PI / 180, 0);

  // Orthographic view 'zoom' units wide, shifted so the wheel centre lands at layout.cx/cy
  const { clientWidth: w, clientHeight: h } = renderer.domElement;
  const pr = renderer.getPixelRatio();
  if (renderer.domElement.width !== Math.round(w * pr) || renderer.domElement.height !== Math.round(h * pr)) renderer.setSize(w, h, false);
  const W = v.zoom, H = v.zoom * h / w;
  camera.left = -W * layout.cx; camera.right = W * (1 - layout.cx);
  camera.top = H * layout.cy;   camera.bottom = -H * (1 - layout.cy);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}
