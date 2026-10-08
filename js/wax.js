// 왁뿌볼: 안쪽 속 · 부스러기 · 소리 · 화면 연결 (조각 계산은 core/wax-sim.js)
import { WaxSim } from './core/wax-sim.js';
import { CORE_SRC, SHARD_SRC } from './render/shaders.js';
import { U, uCam } from './render/uniforms.js';
import { Sound } from './sound.js';
import { $, showMsg, haptic } from './dom.js';

export const Wax = (function(){
  const sim = WaxSim.create();
  let alive = false;                                              // 부스러기가 아직 날아가는 중인지 (화면 갱신 판단용)
  let on = false, cfg = {}, R = 1.25, hard = 1, gripK = 1, done = false, lastPct = -1;
  let core = null, coreMat = null, pts = null, ptsGeo = null, ptsMat = null;

  function attach(scene){                                                   // 안쪽 속 메시와 부스러기 점을 한 번만 만든다
    if (core) return;
    coreMat = new THREE.ShaderMaterial({
      uniforms:{ uInset:{ value:0.06 }, uCoreColor:{ value:new THREE.Vector3(1, 0.72, 0.79) }, uCam:uCam },
      vertexShader:CORE_SRC.vertex, fragmentShader:CORE_SRC.fragment
    });
    core = new THREE.Mesh(new THREE.BufferGeometry(), coreMat);
    core.frustumCulled = false; core.visible = false; scene.add(core);
    ptsGeo = new THREE.BufferGeometry();
    ptsGeo.setAttribute('position', new THREE.BufferAttribute(sim.sp, 3).setUsage(THREE.DynamicDrawUsage));
    ptsGeo.setAttribute('aAlpha',   new THREE.BufferAttribute(sim.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    ptsGeo.setAttribute('aSize',    new THREE.BufferAttribute(sim.size, 1).setUsage(THREE.DynamicDrawUsage));
    ptsGeo.setAttribute('aRot',     new THREE.BufferAttribute(sim.rot, 1).setUsage(THREE.DynamicDrawUsage));
    ptsMat = new THREE.ShaderMaterial({
      uniforms:{ uPointScale:{ value:900 }, uShardColor:{ value:new THREE.Vector3(1, 0.98, 0.9) } },
      vertexShader:SHARD_SRC.vertex, fragmentShader:SHARD_SRC.fragment, transparent:true, depthWrite:false
    });
    pts = new THREE.Points(ptsGeo, ptsMat);
    pts.frustumCulled = false; pts.visible = false; scene.add(pts);
  }
  function report(){
    const pct = Math.round(sim.nBroken()/sim.N*100);
    if (pct !== lastPct){ lastPct = pct; const el = $('waxPct'); if (el) el.textContent = pct + '%'; }
    if (!done && sim.nBroken() >= sim.N){ done = true; showMsg('왁스를 전부 깼어요! 🎉'); }
  }
  function enable(m, radius, geo, scene){
    attach(scene);
    cfg = m.wax || {}; R = radius; hard = 1/(cfg.hardness || 1);
    gripK = cfg.gripSpeed == null ? 1 : cfg.gripSpeed;            // 꽉 쥘 때 깨지는 속도 배율 (1 = 기본, 클수록 빨리, 작을수록 천천히)
    const cc = new THREE.Color(cfg.core || '#ffb8c9'); coreMat.uniforms.uCoreColor.value.set(cc.r, cc.g, cc.b);
    const sc = new THREE.Color(cfg.color || '#f3ead7'); ptsMat.uniforms.uShardColor.value.set(sc.r, sc.g, sc.b);
    coreMat.uniforms.uInset.value = 0.05*R;
    core.geometry = geo; core.visible = true; pts.visible = true;
    sim.reset(R); done = false; lastPct = -1; on = true; U.uWax.value = 1; U.uWaxLit.value = m.img ? 0 : 1;
    const btn = $('waxReset'); if (btn) btn.hidden = false;
    report();
  }
  function disable(){
    alive = false;
    on = false; U.uWax.value = 0; U.uWaxLit.value = 0;
    if (core){ core.visible = false; pts.visible = false; }
    const btn = $('waxReset'); if (btn) btn.hidden = true;
  }
  function reset(){ if (!on) return; sim.reset(R); alive = false; done = false; lastPct = -1; report(); Sound.tick(); showMsg('새 왁뿌볼이에요 🫧'); }
  // 매 프레임: 누르는 손가락·쥐는 힘이 왁스에 피해를 주고, 깨지면 소리·진동·부스러기
  function update(dt, list, grip){
    if (!on) return;
    for (const c of list){
      const px = c.ax + c.lx, py = c.ay + c.ly, pz = c.az + c.lz, l = Math.hypot(px, py, pz) || 1;
      const press = Math.min(1.2, c.h/0.55);
      if (!c.waxHit){ c.waxHit = true; sim.hitAt(px/l, py/l, pz/l, 0.28, 0.45); }               // 처음 내리치는 순간
      const boost = 1 + Math.min(1.5, c.speed*0.001);                                          // 문지르면 더 빨리 깨짐
      sim.hitAt(px/l, py/l, pz/l, (0.6 + 1.6*press)*dt*hard*boost, 0.50);
    }
    if (grip > 0.02) sim.hitAll(0.5*grip*dt*hard*gripK);                                           // 꽉 쥐면 여기저기서 와삭와삭
    const r = sim.step(dt);
    alive = r.alive > 0;
    if (r.brokeNow){ Sound.crack(Math.min(1, 0.45 + 0.2*r.brokeNow)); haptic(6); }
    else if (r.ticksNow) Sound.tick();
    if (r.alive || r.brokeNow){
      const at = ptsGeo.attributes;
      at.position.needsUpdate = true; at.aAlpha.needsUpdate = true; at.aSize.needsUpdate = true; at.aRot.needsUpdate = true;
    }
    report();
  }
  function onResize(heightPx){ if (ptsMat) ptsMat.uniforms.uPointScale.value = heightPx/(2*Math.tan(15*Math.PI/180)); }
  return { enable, disable, reset, update, onResize, busy:()=> on && alive, get on(){ return on; }, sites:sim.sites, softness:()=>sim.softness() };
})();
