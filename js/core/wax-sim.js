// =====================================================================
//  왁뿌볼: 겉면 왁스가 조각으로 나뉘어 금이 가고, 깨져서 떨어져 나가는 기능
//   WaxSim : 조각(48개)의 피해·깨짐·떨어지는 부스러기 계산 (Three.js 와 무관한 순수 JS)
//   Wax    : 안쪽 속 · 부스러기 · 소리 · 화면 연결
// =====================================================================
export const WaxSim = (function(){
  const N = 48, MAXS = 360;
  function create(){
    const sites = new Float32Array(N*4), rate = new Float32Array(N);        // sites: 조각 중심 xyz + 부서진 정도 w(셰이더로 그대로 전달)
    const broken = new Uint8Array(N), half = new Uint8Array(N);
    const sp = new Float32Array(MAXS*3), sv = new Float32Array(MAXS*3);
    const alpha = new Float32Array(MAXS), size = new Float32Array(MAXS), rot = new Float32Array(MAXS), life = new Float32Array(MAXS);
    let nBroken = 0, cursor = 0, radius = 1.25;
    let seed = 987654321;
    const rnd = ()=>{ seed = (seed*16807) % 2147483647; return seed/2147483647; };
    const ga = Math.PI*(3 - Math.sqrt(5));
    for (let i=0;i<N;i++){                                                  // 피보나치 구 + 살짝 흔들기 = 고르지만 자연스러운 조각 배치
      const y = 1 - 2*(i+0.5)/N + (rnd()-0.5)*0.10, r = Math.sqrt(Math.max(0, 1-y*y)), th = ga*i + (rnd()-0.5)*0.5;
      const x = Math.cos(th)*r, z = Math.sin(th)*r, l = Math.hypot(x,y,z);
      sites[i*4] = x/l; sites[i*4+1] = y/l; sites[i*4+2] = z/l;
      rate[i] = 0.6 + rnd()*0.9;                                            // 조각마다 깨지기 쉬운 정도가 조금씩 달라요
    }
    function reset(rad){
      radius = rad || radius;
      for (let i=0;i<N;i++) sites[i*4+3] = 0;
      broken.fill(0); half.fill(0); nBroken = 0;
      alpha.fill(0); size.fill(0); life.fill(0);
    }
    function hitAt(dx, dy, dz, amount, spread){                             // 방향(단위벡터) 근처 조각들에 피해
      for (let i=0;i<N;i++){
        if (broken[i]) continue;
        const dot = dx*sites[i*4] + dy*sites[i*4+1] + dz*sites[i*4+2];
        const ang = Math.acos(Math.min(1, Math.max(-1, dot)));
        const w = Math.exp(-(ang/spread)*(ang/spread));
        if (w < 0.02) continue;
        sites[i*4+3] += amount*w*rate[i];
      }
    }
    function hitAll(amount){ for (let i=0;i<N;i++) if (!broken[i]) sites[i*4+3] += amount*rate[i]; }
    function spawn(i){                                                      // 깨진 조각 자리에서 부스러기가 튀어 나온다
      const nx = sites[i*4], ny = sites[i*4+1], nz = sites[i*4+2];
      for (let k=0;k<8;k++){
        const j = cursor; cursor = (cursor+1) % MAXS;
        const tx = Math.random()-0.5, ty = Math.random()-0.5, tz = Math.random()-0.5;
        const sp0 = 0.5 + Math.random()*1.5;
        sp[j*3] = nx*radius*0.98 + tx*0.25; sp[j*3+1] = ny*radius*0.98 + ty*0.25; sp[j*3+2] = nz*radius*0.98 + tz*0.25;
        sv[j*3] = nx*sp0 + tx*1.4; sv[j*3+1] = ny*sp0 + ty*1.4 + 0.7; sv[j*3+2] = nz*sp0 + tz*1.4;
        life[j] = 1.0 + Math.random()*0.8; alpha[j] = 1;
        size[j] = 0.05 + Math.random()*0.08; rot[j] = Math.random()*6.283;
      }
    }
    function step(dt){                                                      // 깨짐 판정 + 부스러기 이동. { brokeNow, ticksNow }
      let brokeNow = 0, ticksNow = 0;
      for (let i=0;i<N;i++){
        if (broken[i]) continue;
        const d = sites[i*4+3];
        if (!half[i] && d > 0.5){ half[i] = 1; ticksNow++; }
        if (d >= 1){ broken[i] = 1; sites[i*4+3] = 1; nBroken++; brokeNow++; spawn(i); }
      }
      let alive = 0;
      for (let j=0;j<MAXS;j++){
        if (life[j] <= 0) continue;
        life[j] -= dt; alive++;
        if (life[j] <= 0){ alpha[j] = 0; continue; }
        sv[j*3+1] -= 4.5*dt;                                                // 중력
        sp[j*3] += sv[j*3]*dt; sp[j*3+1] += sv[j*3+1]*dt; sp[j*3+2] += sv[j*3+2]*dt;
        rot[j] += dt*3; alpha[j] = Math.min(1, life[j]/0.4);
      }
      return { brokeNow, ticksNow, alive };
    }
    return { N, sites, sp, alpha, size, rot, reset, hitAt, hitAll, step,
             nBroken:()=>nBroken, softness:()=>0.22 + 0.78*Math.min(1, nBroken/(N*0.45)) };   // 껍질이 온전할수록 단단
  }
  return { create, N };
})();
