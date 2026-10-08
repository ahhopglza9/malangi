// 3D 장면 · 말랑이 올리기 · 입력(손가락/회전/꽉 쥐기) · 매 프레임 루프
import { SquishCore } from './core/squish.js';
import { SHADER_SRC } from './render/shaders.js';
import { U, uCam, uTime } from './render/uniforms.js';
import { detectBody, prepareTexCanvas } from './image/texture.js';
import { buildSilhouette } from './image/silhouette.js';
import { getMask } from './ui.js';
import { Wax } from './wax.js';
import { Sound } from './sound.js';
import { haptic } from './dom.js';

const stageEl = document.getElementById('stage'), canvas = document.getElementById('c');

// =====================================================================
//  3D 장면 (렌더러는 한 번만 만들고, 말랑이가 바뀔 때 몸통·사진·카메라만 교체)
// =====================================================================
let renderer, scene, camera, refCam, mesh, geo, material, shadow, body, tex, texBack;
let posAttr, strainAttr, ready = false;
let active = false, onTouch = ()=>{};
let EL0 = 0.70, DIST = 6.0;                                   // 기준 카메라 = 사진이 찍힌 시점
let az = 0, el = EL0, dist = DIST;                            // 화면 카메라 (드래그로 회전)
const LOOK = { x:0, y:0.084, z:0 };
let shadowBase = { x:3.5, z:3.3 }, sheetMode = false, elMin = 0.06, elMax = 1.2;
const contacts = new Map();                                   // pointerId → 접촉(손가락/손바닥)
let orbit = null;
let raycaster, ndc, plane, vA, vB, vC;

function makeShadowTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64,64,4, 64,64,62);
  gr.addColorStop(0,'rgba(0,0,0,0.42)'); gr.addColorStop(0.55,'rgba(0,0,0,0.20)'); gr.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
}
function placeCamera(cam, a, e, d){
  cam.position.set(
    LOOK.x + d*Math.sin(a)*Math.cos(e),
    LOOK.y + d*Math.sin(e),
    LOOK.z + d*Math.cos(a)*Math.cos(e));
  cam.lookAt(LOOK.x, LOOK.y, LOOK.z);
  cam.updateMatrixWorld();
}
function updateCamera(){ placeCamera(camera, az, el, dist); }

// 렌더러·카메라·조명 없이 셰이더 재질 · 그림자 · 입력 — 앱 전체에서 한 번만
function initRenderer(){
  U.uSites.value = Wax.sites;
  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  renderer.setClearColor(0x000000, 0);
  scene  = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  refCam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  uCam.value = camera.position;
  U.uRefCam.value = refCam.position;

  material = new THREE.ShaderMaterial({ uniforms:U, vertexShader:SHADER_SRC.vertex, fragmentShader:SHADER_SRC.fragment, extensions:{ derivatives:true } });
  mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent:true, depthWrite:false })
  );
  shadow.rotation.x = -Math.PI/2;
  shadow.renderOrder = -1;
  scene.add(shadow);

  raycaster = new THREE.Raycaster(); ndc = new THREE.Vector2(); plane = new THREE.Plane();
  vA = new THREE.Vector3(); vB = new THREE.Vector3(); vC = new THREE.Vector3();
  bindPointer();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);
}

// 몸통이 화면 폭의 fill 만큼 차지하도록 카메라 거리를 맞춘다 (실루엣 말랑이용)
function fitDistance(rest, NV, elv, fill){
  const q = new THREE.Vector4();
  let D = 6.0;
  for (let it=0; it<5; it++){
    placeCamera(refCam, 0, elv, D);
    const vp = new THREE.Matrix4().multiplyMatrices(refCam.projectionMatrix, refCam.matrixWorldInverse);
    let hx = 0, hy = 0;
    for (let i=0;i<NV;i++){
      q.set(rest[i*3], rest[i*3+1], rest[i*3+2], 1).applyMatrix4(vp);
      hx = Math.max(hx, Math.abs(q.x/q.w)); hy = Math.max(hy, Math.abs(q.y/q.w));
    }
    D *= Math.max(hx, hy) / fill;
  }
  return D;
}

// 말랑이 한 마리를 장면에 올린다 — 여기가 "말랑이 교체"의 전부
function applyMalangi(m, img, imgB){
  const isSheet = m.shape === 'silhouette';
  const isLathe = m.shape === 'lathe';                            // 회전체 (눈사람처럼 세로축 대칭)
  const isBox = m.shape === 'box';                                 // 직육면체 (버터 등)
  const isSphere = m.shape === 'sphere' || isLathe || isBox;
  const bx = m.box || {}, boxDims = [bx.w || 0.86, bx.h || 2.8, bx.d || 0.78];   // 가로·높이·깊이 (월드 단위)
  let bodyPx, mk = null, camEl, camDist;

  if (isSheet){
    // (실루엣) 사진에서 배경을 지우고, 윤곽 그대로 부풀린 몸통을 만든다
    mk = getMask(m, img);
    const geom = buildSilhouette(mk, { size:m.size, puff:m.puff, verts:m.verts, depth:m.depth, bevel:m.bevel, thick:m.thick });
    body = SquishCore.fromGeometry(geom, { floor:false, centerY:0 });
    bodyPx = { cx:mk.cx, cy:mk.cy, rx:mk.rx, ry:mk.ry };
    camEl = m.camEl != null ? m.camEl : 0.0;
    LOOK.y = 0;
    camDist = m.camDist || fitDistance(body.rest, body.NV, camEl, 0.80);
  } else if (isSphere){
    // (구) 완전한 공. img 는 사진이 아니라 "구 전개도"(가로 360° × 세로 180° 로 펼친 이미지)
    const R = m.radius || 1.25;
    if (isBox) body = SquishCore.fromGeometry(SquishCore.buildBox(boxDims[0]/2, boxDims[1]/2, boxDims[2]/2, bx.r || 0.1, bx.step || 0.06), { floor:false, centerY:0 });   // 모서리가 둥근 상자
    else if (isLathe) body = SquishCore.fromGeometry(SquishCore.buildLathe(m.profile, m.height || 2.8), { floor:false, centerY:0 });   // 윤곽선을 한 바퀴 돌린 몸통
    else body = SquishCore.create({ A:R, C:R, Hup:R, Hlo:R, flat:false }, { floor:false, centerY:0 });
    bodyPx = { cx:0, cy:0, rx:1, ry:1 };
    camEl = m.camEl != null ? m.camEl : 0.0;
    LOOK.y = 0;
    camDist = m.camDist || fitDistance(body.rest, body.NV, camEl, 0.74);
  } else {
    // (둥근 돔) 사진 속 몸통 위치 (직접 준 값 → 없으면 자동 감지) → 3D 돔 크기 + 카메라
    bodyPx = m.body || detectBody(img);
    camEl = m.camEl != null ? m.camEl : 0.70; camDist = m.camDist || 6.0;
    let dome = m.dome, lookY = m.lookY;
    if (!dome){
      const f = SquishCore.fitDome(bodyPx.ry/bodyPx.rx, camEl, camDist);
      dome = f.dome; camEl = f.el; lookY = f.lookY;
    } else if (lookY == null){
      lookY = SquishCore.solveLookY(dome, camEl, camDist);
    }
    if (!m.body || !m.dome){
      console.info('[말랑이] ' + m.id + ' 자동 계산 결과 — 마음에 들면 config 에 적어 두세요:\n' +
        JSON.stringify({ body: m.body ? undefined : { cx:bodyPx.cx, cy:bodyPx.cy, rx:bodyPx.rx, ry:bodyPx.ry }, dome: m.dome ? undefined : dome, camEl: m.dome ? undefined : camEl }, (k,v)=> typeof v==='number' ? Math.round(v*1000)/1000 : v));
    }
    LOOK.y = lookY;
    body = SquishCore.create(dome);
  }
  EL0 = camEl; DIST = camDist; sheetMode = isSheet;
  elMin = (isSheet || isSphere) ? -0.9 : 0.06;
  elMax = (isSphere && !isBox) ? 0.7 : 1.2;                          // 구는 극(맨 위/아래)이 늘어져 보이지 않게 각도를 제한

  // 지오메트리 교체
  const newGeo = new THREE.BufferGeometry();
  posAttr    = new THREE.BufferAttribute(body.pos, 3).setUsage(THREE.DynamicDrawUsage);
  strainAttr = new THREE.BufferAttribute(body.strain, 1).setUsage(THREE.DynamicDrawUsage);
  newGeo.setAttribute('position', posAttr);
  newGeo.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(body.NV*3), 3).setUsage(THREE.DynamicDrawUsage));
  newGeo.setAttribute('aRest',    new THREE.BufferAttribute(body.rest, 3));
  newGeo.setAttribute('aNRest',   new THREE.BufferAttribute(body.nrest, 3));
  newGeo.setAttribute('aStrain',  strainAttr);
  newGeo.setIndex(new THREE.BufferAttribute(body.index, 1));
  newGeo.computeVertexNormals();
  newGeo.computeBoundingSphere();
  const oldGeo = geo; geo = newGeo; mesh.geometry = geo;
  if (oldGeo) oldGeo.dispose();
  if (isSphere && m.wax) Wax.enable(m, m.radius || 1.25, geo, scene);            // 왁뿌볼: 안쪽 속·부스러기 준비
  else Wax.disable();

  // 기준 카메라(사진 시점) → 사진을 몸통에 투영하는 행렬과 좌표 매핑
  placeCamera(refCam, 0, EL0, DIST);
  const refVP = new THREE.Matrix4().multiplyMatrices(refCam.projectionMatrix, refCam.matrixWorldInverse);
  const q = new THREE.Vector4();
  let mnx=1e9, mxx=-1e9, mny=1e9, mxy=-1e9;
  for (let i=0;i<body.NV;i++){
    q.set(body.rest[i*3], body.rest[i*3+1], body.rest[i*3+2], 1).applyMatrix4(refVP);
    const x=q.x/q.w, y=q.y/q.w;
    if (x<mnx) mnx=x; if (x>mxx) mxx=x; if (y<mny) mny=y; if (y>mxy) mxy=y;
  }
  const oldTex = tex;
  if (isSphere){
    tex = new THREE.Texture(img);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  } else tex = new THREE.CanvasTexture(prepareTexCanvas(img, bodyPx, mk));
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (oldTex) oldTex.dispose();
  U.uMap.value   = tex;
  U.uRefVP.value = refVP;
  U.uMapXf.value = new THREE.Vector3((mnx+mxx)/2, (mny+mxy)/2, ((mxx-mnx)/2)/bodyPx.rx);
  U.uImg.value   = new THREE.Vector4(img.naturalWidth, img.naturalHeight, bodyPx.cx, bodyPx.cy);
  // (실루엣) 뒷면 사진: 앞면 사진과 같은 틀에 맞춰 둔 이미지여야 한다 (크기 동일)
  const oldTexB = texBack; texBack = null;
  if (isSheet && imgB){
    if (imgB.naturalWidth === img.naturalWidth && imgB.naturalHeight === img.naturalHeight){
      texBack = new THREE.CanvasTexture(prepareTexCanvas(imgB, bodyPx, mk));
      texBack.anisotropy = tex.anisotropy;
    } else console.warn('[말랑이] ' + m.id + ': imgBack 은 img 와 가로세로 크기가 같아야 해요 (' + imgB.naturalWidth + 'x' + imgB.naturalHeight + ' ≠ ' + img.naturalWidth + 'x' + img.naturalHeight + '). 뒷면은 앞면 사진을 써요.');
  }
  if (oldTexB) oldTexB.dispose();
  U.uMapBack.value = texBack; U.uHasBack.value = texBack ? 1 : 0;
  U.uSheet.value = isSheet ? 1 : 0;
  U.uSphere.value = isBox ? 3 : (isLathe ? 2 : (isSphere ? 1 : 0));
  U.uBox.value = new THREE.Vector3(boxDims[0]/2, boxDims[1]/2, boxDims[2]/2);        // 직육면체 반쪽 크기
  U.uCyl.value = new THREE.Vector2(-(m.height || 2.8)/2, m.height || 2.8);         // 회전체 전개도의 높이 범위
  U.uGloss.value  = m.gloss  != null ? m.gloss  : ((isSheet || isSphere) ? 0 : 1);     // 실루엣·구 말랑이는 기본 무광 (사진 그대로)
  U.uWhiten.value = m.whiten != null ? m.whiten : ((isSheet || isSphere) ? 0 : 1);

  // 그림자 · 카메라 · 상태 초기화
  const re = body.restExtent;
  shadow.visible = m.shadow !== false;                     // shadow:false 이면 바닥 그림자를 그리지 않는다
  if (isSheet || isSphere){
    shadowBase = { x:(re.x1-re.x0)*1.15, z: isSphere ? (re.z1-re.z0)*1.15 : 1.3 };
    shadow.position.y = re.y0 - 0.35;                      // 바닥 없이 떠 있는 몸통 아래의 은은한 그림자
  } else {
    shadowBase = { x:body.dome.A*2.87, z:body.dome.C*2.87 };
    shadow.position.y = body.floorY - 0.003;
  }
  updateShadow();
  az = 0; el = EL0; dist = DIST;
  updateCamera();
  resetInteraction();
  resize();
}

function updateShadow(){
  const e = body.extent, r = body.restExtent;
  const sx = (e.x1-e.x0)/(r.x1-r.x0);
  const sz = sheetMode ? sx : (e.z1-e.z0)/(r.z1-r.z0);
  shadow.scale.set(shadowBase.x*sx, shadowBase.z*sz, 1);
}
function resize(){
  if (!renderer) return;
  const r = stageEl.getBoundingClientRect();
  if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false);
  Wax.onResize(r.height*renderer.getPixelRatio());
  camera.aspect = r.width/r.height;
  camera.updateProjectionMatrix();
}
function resetInteraction(){
  contacts.clear(); orbit = null; Sound.stopRub();
  setGrip(false); gripLevel = 0;
}

// ---------- 입력 ----------
const PICK_OFFSETS = [[0,0],[12,0],[-12,0],[0,12],[0,-12],[9,9],[-9,9],[9,-9],[-9,-9],[22,0],[-22,0],[0,22],[0,-22]];
function pick(e){
  const r = canvas.getBoundingClientRect();
  for (const o of PICK_OFFSETS){                       // 손가락이 두꺼우니 살짝 빗나가도 잡아준다
    ndc.set(((e.clientX+o[0]-r.left)/r.width)*2-1, -((e.clientY+o[1]-r.top)/r.height)*2+1);
    raycaster.setFromCamera(ndc, camera);
    const h = raycaster.intersectObject(mesh, false);
    if (h.length) return h[0];
  }
  return null;
}
function bindPointer(){
  canvas.addEventListener('pointerdown', (e)=>{
    e.preventDefault(); Sound.ensure();
    if (!ready) return;
    try { canvas.setPointerCapture(e.pointerId); } catch(_){}
    const hit = pick(e);
    if (!hit){
      if (contacts.size===0 && !orbit) orbit = { id:e.pointerId, x:e.clientX, y:e.clientY };
      return;
    }
    if (contacts.size >= 5) return;
    const n = hit.face.normal;
    const rd = raycaster.ray.direction;
    vA.set(rd.x*0.65 - n.x*0.35, rd.y*0.65 - n.y*0.35, rd.z*0.65 - n.z*0.35).normalize();   // 손가락이 파고드는 방향
    const wasEmpty = contacts.size===0;
    contacts.set(e.pointerId, {
      id:e.pointerId, t:0, h:0,
      ax:hit.point.x, ay:hit.point.y, az:hit.point.z,
      dx:vA.x, dy:vA.y, dz:vA.z,
      r: e.pointerType==='touch' ? 0.52 : 0.44,
      depthScale: 1.0,
      lx:0, ly:0, lz:0, tlx:0, tly:0, tlz:0,
      cx:e.clientX, cy:e.clientY, speed:0
    });
    if (wasEmpty){ onTouch(); Sound.press(1); Sound.startRub(); }
    else Sound.press(0.6);
    haptic(14);
  });

  canvas.addEventListener('pointermove', (e)=>{
    const c = contacts.get(e.pointerId);
    if (c){
      e.preventDefault();
      // 손가락을 끌면 피부가 따라오도록 옆으로 밀린 정도(lateral)를 계산
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
      raycaster.setFromCamera(ndc, camera);
      camera.getWorldDirection(vA);
      vB.set(c.ax, c.ay, c.az);
      plane.setFromNormalAndCoplanarPoint(vA, vB);
      if (raycaster.ray.intersectPlane(plane, vC)){
        vC.sub(vB);
        const along = vC.x*c.dx + vC.y*c.dy + vC.z*c.dz;
        vC.x -= along*c.dx; vC.y -= along*c.dy; vC.z -= along*c.dz;
        const len = vC.length(), maxLat = 0.85;
        if (len > maxLat) vC.multiplyScalar(maxLat/len);
        c.tlx = vC.x; c.tly = vC.y; c.tlz = vC.z;
      }
      c.speed = Math.max(c.speed, Math.hypot(e.clientX-c.cx, e.clientY-c.cy)*60);
      c.cx = e.clientX; c.cy = e.clientY;
    } else if (orbit && orbit.id===e.pointerId){
      e.preventDefault();
      az -= (e.clientX-orbit.x)*0.008;
      el = Math.max(elMin, Math.min(elMax, el + (e.clientY-orbit.y)*0.005));
      orbit.x = e.clientX; orbit.y = e.clientY;
      updateCamera();
    }
  });

  function release(e){
    if (orbit && orbit.id===e.pointerId){ orbit = null; return; }
    if (!contacts.has(e.pointerId)) return;
    contacts.delete(e.pointerId);
    if (contacts.size===0){ Sound.release(); haptic(6); Sound.stopRub(); }
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
}
// ---------- 꽉 쥐기 (스페이스바 / ✊ 버튼) ----------
let gripHeld = false, gripLevel = 0;
function setGrip(on){
  on = !!on;
  if (on === gripHeld) return;
  if (on && (!ready || !active)) return;
  gripHeld = on;
  const btn = document.getElementById('gripBtn'); if (btn) btn.classList.toggle('active', on);
  if (on){ Sound.ensure(); onTouch(); Sound.gripStart(); haptic(20); }
  else { Sound.gripStop(); haptic(8); }
}
// ---------- 루프 ----------
let last = performance.now();
function frame(now){
  requestAnimationFrame(frame);
  if (!ready || !active){ last = now; return; }
  const dt = Math.min((now-last)/1000, 1/30); last = now;

  const list = [];
  let maxSpeed = 0;
  const soft = Wax.on ? Wax.softness() : 1;                       // 왁뿌볼: 왁스가 깨질수록 말랑해진다
  contacts.forEach(c=>{
    c.t += dt;
    const tgt = SquishCore.MAX_DEPTH*c.depthScale*soft*(0.55 + 0.45*(1-Math.exp(-c.t/0.8)));   // 꾹 누를수록 깊이 (왁스가 온전하면 단단해서 덜 들어감)
    c.h += (tgt - c.h)*(1-Math.exp(-dt*10));
    const k = 1-Math.exp(-dt*14);
    c.lx += (c.tlx-c.lx)*k; c.ly += (c.tly-c.ly)*k; c.lz += (c.tlz-c.lz)*k;
    maxSpeed = Math.max(maxSpeed, c.speed);
    c.speed *= 0.85;
    list.push(c);
  });

  gripLevel += ((gripHeld ? 1 : 0) - gripLevel) * (1 - Math.exp(-dt*(gripHeld ? 7 : 11)));   // 쥐는 힘이 부드럽게 오르내림
  if (!gripHeld && gripLevel < 0.003) gripLevel = 0;
  if (Wax.on) Wax.update(dt, list, gripLevel);
  const res = body.step(dt, list, gripLevel*soft, now/1000);
  if (gripHeld) Sound.gripUpdate(gripLevel);
  if (res.active){
    posAttr.needsUpdate = true; strainAttr.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    updateShadow();
  }
  Sound.updateRub(res.deform, maxSpeed);

  uTime.value = now/1000;
  renderer.render(scene, camera);
}

export function initScene(opts){ onTouch = opts.onTouch; if (!renderer) initRenderer(); }
export const hasRenderer = ()=> !!renderer;
export const isReady = ()=> ready;
export function setReady(v){ ready = v; if (v) last = performance.now(); }
export function setActive(v){ active = v; }
export { applyMalangi, resetInteraction, setGrip };
