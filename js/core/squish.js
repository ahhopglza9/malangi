// =====================================================================
//  SquishCore : 말랑이 몸통(돔) 형태 + 젤리 물리 (Three.js와 무관한 순수 JS)
//   create(dome)  → 돔 크기(dome)에 맞는 몸통 생성
//   fitDome(aspect, el, dist) → 사진의 가로세로 비율에 맞는 돔 크기 + 카메라 높이 자동 계산
//   solveLookY(dome, el, dist) → 돔이 화면 중앙에 오는 카메라 시선 높이
// =====================================================================
export const SquishCore = (function(){
  let S = 96;               // 경도 방향 분할 (setDensity 로 바뀜)
  let L = 54;               // 위도 링 개수 (극점 제외)
  let NV = 2 + L*S;         // 총 정점 수
  let BOX_STEP_K = 1;       // 상자 격자 간격 배율
  // 품질 단계: f = 정점 수 배율 (1 = 원본). 다음에 만드는 몸통부터 적용
  function setDensity(f){
    const k = Math.sqrt(Math.max(0.1, f || 1));
    S = Math.max(24, Math.round(96*k/4)*4);
    L = Math.max(14, Math.round(54*k));
    NV = 2 + L*S;
    BOX_STEP_K = 1/k;
  }
  const FLOOR_Y = -0.30;    // 바닥 높이

  // ---- 물리 파라미터 (젤리 느낌: 살짝 언더댐프 → 놓으면 출렁) ----
  const K  = 250;   // 원래 모양으로 돌아가려는 탄성
  const C  = 10.0;  // 감쇠
  const KN = 140;   // 이웃 정점과의 결합(파동이 퍼지게)
  const CN = 5.0;   // 이웃 간 점성 (거친 떨림 제거)
  const MAX_DEPTH = 0.55;

  function sm(a, b, x){ const t = Math.min(1, Math.max(0, (x-a)/(b-a))); return t*t*(3-2*t); }

  // ---- 돔 형태: 사진의 실루엣에 맞춰 피팅한 매끈한 돔 (무늬·얼굴은 원본 이미지가 담당) ----
  //   A: 가로 반지름, C: 앞뒤 반지름, Hup: 윗부분 높이, Hlo: 아랫부분 높이(바닥은 평평하게 잘림)
  const DEFAULT_DOME = { A:1.22, C:1.15, Hup:1.00, Hlo:0.50 };
  function shape(theta, phi, out, P){
    const st = Math.sin(theta), ct = Math.cos(theta);
    const dx = st*Math.cos(phi), dy = ct, dz = st*Math.sin(phi);
    const tLow = sm(0.28, -0.28, dy);
    const Hy = P.Hup*(1-tLow) + P.Hlo*tLow;
    let x = dx*P.A, y = dy*Hy, z = dz*P.C;
    // 평평한 바닥 (부드러운 max). P.flat === false 이면 바닥을 깎지 않은 완전한 구/타원체
    if (P.flat !== false){
      const a = y - FLOOR_Y, k = 0.12;
      y = FLOOR_Y + 0.5*(a + Math.sqrt(a*a + k*k));
    }
    out[0] = x; out[1] = y; out[2] = z;
    return 1;
  }

  // 정점 법선 (면적 가중 평균)
  function restNormals(rest, index){
    const NVn = rest.length/3;
    const nrest = new Float32Array(NVn*3);
    for (let t=0;t<index.length;t+=3){
      const a=index[t]*3, b=index[t+1]*3, c=index[t+2]*3;
      const e1x=rest[b]-rest[a], e1y=rest[b+1]-rest[a+1], e1z=rest[b+2]-rest[a+2];
      const e2x=rest[c]-rest[a], e2y=rest[c+1]-rest[a+1], e2z=rest[c+2]-rest[a+2];
      const nx=e1y*e2z-e1z*e2y, ny=e1z*e2x-e1x*e2z, nz=e1x*e2y-e1y*e2x;
      for (const i of [a,b,c]){ nrest[i]+=nx; nrest[i+1]+=ny; nrest[i+2]+=nz; }
    }
    for (let i=0;i<NVn;i++){
      const l = Math.hypot(nrest[i*3],nrest[i*3+1],nrest[i*3+2]) || 1;
      nrest[i*3]/=l; nrest[i*3+1]/=l; nrest[i*3+2]/=l;
    }
    return nrest;
  }

  // 위도·경도 격자 몸통 조립: 정점 위치(rest)만 주면 삼각형·이웃 목록·법선을 만든다
  function assemble(rest, ao){
    const V = (j,s)=> 1 + (j-1)*S + ((s%S)+S)%S;

    // 삼각형 (바깥쪽이 앞면이 되도록 감는 방향 확인 완료)
    const tris = [];
    for (let s=0;s<S;s++) tris.push(0, V(1,s+1), V(1,s));
    for (let j=1;j<L;j++) for (let s=0;s<S;s++){
      const a=V(j,s), b=V(j,s+1), c=V(j+1,s), e=V(j+1,s+1);
      tris.push(a,b,c, b,e,c);
    }
    for (let s=0;s<S;s++) tris.push(V(L,s), V(L,s+1), NV-1);
    const index = new Uint16Array(tris);

    // 이웃 목록 (정점 하나당 상하좌우, 극점은 인접 링 전체)
    const nStart = new Int32Array(NV+1);
    const nList = [];
    const add = (i, arr)=>{ nStart[i] = nList.length; arr.forEach(x=>nList.push(x)); };
    { const a=[]; for (let s=0;s<S;s++) a.push(V(1,s)); add(0, a); }
    for (let j=1;j<=L;j++) for (let s=0;s<S;s++){
      const i = V(j,s);
      add(i, [V(j,s-1), V(j,s+1), j>1 ? V(j-1,s) : 0, j<L ? V(j+1,s) : NV-1]);
    }
    { const a=[]; for (let s=0;s<S;s++) a.push(V(L,s)); add(NV-1, a); }
    nStart[NV] = nList.length;
    const nIdx = new Int32Array(nList);

    const nrest = restNormals(rest, index);
    return { rest, ao, index, nStart, nIdx, nrest };
  }

  function build(P){
    const rest = new Float32Array(NV*3);
    const ao   = new Float32Array(NV).fill(1);
    const tmp = [0,0,0];
    const setV = (i, theta, phi)=>{
      ao[i] = shape(theta, phi, tmp, P);
      rest[i*3] = tmp[0]; rest[i*3+1] = tmp[1]; rest[i*3+2] = tmp[2];
    };
    setV(0, 0, 0);
    setV(NV-1, Math.PI, 0);
    for (let j=1;j<=L;j++){
      const theta = j*Math.PI/(L+1);
      for (let s=0;s<S;s++) setV(1+(j-1)*S+s, theta, s*Math.PI*2/S);
    }
    return assemble(rest, ao);
  }

  // 회전체 몸통 (눈사람처럼 세로축을 중심으로 대칭인 물체): 윤곽선(프로필)을 세로축으로 한 바퀴 돌려 만든다
  //   profile : [[t, r], ...]   t = 0(맨 위) ~ 1(맨 아래),  r = 그 높이의 반지름 ÷ 전체 높이
  //   height  : 월드 높이 (가운데가 y=0)
  function buildLathe(profile, height){
    const pts = profile.map((p)=>({ y:(0.5 - p[0])*height, r:p[1]*height }));
    pts[0].r = 0; pts[pts.length-1].r = 0;                       // 위·아래 끝은 한 점으로 닫는다
    const cum = [0];
    for (let i=1;i<pts.length;i++) cum.push(cum[i-1] + Math.hypot(pts[i].y-pts[i-1].y, pts[i].r-pts[i-1].r));
    const total = cum[cum.length-1];
    const at = (s)=>{                                            // 윤곽선을 따라 s 만큼 간 지점
      let k = 1; while (k < cum.length-1 && cum[k] < s) k++;
      const f = (s-cum[k-1]) / Math.max(1e-9, cum[k]-cum[k-1]);
      return { y:pts[k-1].y + (pts[k].y-pts[k-1].y)*f, r:pts[k-1].r + (pts[k].r-pts[k-1].r)*f };
    };
    const rest = new Float32Array(NV*3);
    const ao   = new Float32Array(NV).fill(1);
    rest[1] = pts[0].y; rest[(NV-1)*3+1] = pts[pts.length-1].y;
    for (let j=1;j<=L;j++){
      const p = at(total*j/(L+1));                               // 링을 윤곽선 길이 기준으로 고르게 배치 → 머리·몸통 윗면도 둥글게
      for (let s=0;s<S;s++){
        const ph = s*Math.PI*2/S, i = 1+(j-1)*S+s;
        rest[i*3] = p.r*Math.cos(ph); rest[i*3+1] = p.y; rest[i*3+2] = p.r*Math.sin(ph);
      }
    }
    return assemble(rest, ao);
  }
  // 직육면체 몸통 (모서리가 살짝 둥근 상자): 반쪽 크기 hx,hy,hz / 모서리 둥글기 r / 격자 간격 step
  //   여섯 면을 잘게 나눈 격자를 만들고, 모서리 쪽 점들을 반지름 r 인 원호 위로 밀어 둥글게 만든다.
  function buildBox(hx, hy, hz, r, step){
    step = step*BOX_STEP_K;
    r = Math.min(r, hx*0.9, hy*0.9, hz*0.9);
    const nx = Math.max(2, Math.round(2*hx/step)), ny = Math.max(2, Math.round(2*hy/step)), nz = Math.max(2, Math.round(2*hz/step));
    const pos = [], ids = new Map();
    const vtx = (i, j, k)=>{
      const key = (i*(ny+1) + j)*(nz+1) + k;
      let v = ids.get(key);
      if (v === undefined){
        v = pos.length/3; ids.set(key, v);
        const x = -hx + 2*hx*i/nx, y = -hy + 2*hy*j/ny, z = -hz + 2*hz*k/nz;
        const qx = Math.max(-(hx-r), Math.min(hx-r, x)), qy = Math.max(-(hy-r), Math.min(hy-r, y)), qz = Math.max(-(hz-r), Math.min(hz-r, z));
        let dx = x-qx, dy = y-qy, dz = z-qz; const len = Math.hypot(dx, dy, dz) || 1;
        pos.push(qx + dx/len*r, qy + dy/len*r, qz + dz/len*r);
      }
      return v;
    };
    const tris = [];
    const quad = (a, b, c, d, nrm)=>{                                 // a,b,c,d: 사각형 꼭짓점(순서대로). 바깥쪽이 앞면이 되도록 감는다
      const P = (v)=>[pos[v*3], pos[v*3+1], pos[v*3+2]];
      const tri = (p, q, s)=>{
        const A = P(p), B = P(q), C = P(s);
        const e1 = [B[0]-A[0], B[1]-A[1], B[2]-A[2]], e2 = [C[0]-A[0], C[1]-A[1], C[2]-A[2]];
        const cx = e1[1]*e2[2]-e1[2]*e2[1], cy = e1[2]*e2[0]-e1[0]*e2[2], cz = e1[0]*e2[1]-e1[1]*e2[0];
        if (cx*nrm[0] + cy*nrm[1] + cz*nrm[2] >= 0) tris.push(p, q, s); else tris.push(p, s, q);
      };
      tri(a, b, c); tri(a, c, d);
    };
    for (let i=0;i<nx;i++) for (let j=0;j<ny;j++){                     // 앞(+z) · 뒤(-z)
      quad(vtx(i,j,nz), vtx(i+1,j,nz), vtx(i+1,j+1,nz), vtx(i,j+1,nz), [0,0,1]);
      quad(vtx(i,j,0),  vtx(i+1,j,0),  vtx(i+1,j+1,0),  vtx(i,j+1,0),  [0,0,-1]);
    }
    for (let j=0;j<ny;j++) for (let k=0;k<nz;k++){                     // 오른쪽(+x) · 왼쪽(-x)
      quad(vtx(nx,j,k), vtx(nx,j+1,k), vtx(nx,j+1,k+1), vtx(nx,j,k+1), [1,0,0]);
      quad(vtx(0,j,k),  vtx(0,j+1,k),  vtx(0,j+1,k+1),  vtx(0,j,k+1),  [-1,0,0]);
    }
    for (let i=0;i<nx;i++) for (let k=0;k<nz;k++){                     // 위(+y) · 아래(-y)
      quad(vtx(i,ny,k), vtx(i+1,ny,k), vtx(i+1,ny,k+1), vtx(i,ny,k+1), [0,1,0]);
      quad(vtx(i,0,k),  vtx(i+1,0,k),  vtx(i+1,0,k+1),  vtx(i,0,k+1),  [0,-1,0]);
    }
    const NVb = pos.length/3;
    if (NVb > 65000) throw new Error('정점이 너무 많아요 (step 을 키워 주세요)');
    const rest = new Float32Array(pos), index = new Uint16Array(tris);
    const nb = Array.from({ length:NVb }, ()=>[]);
    for (let t=0;t<index.length;t+=3) for (let k=0;k<3;k++){
      const p = index[t+k], q = index[t+(k+1)%3];
      if (p === q) continue;
      if (nb[p].indexOf(q) < 0) nb[p].push(q);
      if (nb[q].indexOf(p) < 0) nb[q].push(p);
    }
    const nStart = new Int32Array(NVb+1), list = [];
    for (let i=0;i<NVb;i++){ nStart[i] = list.length; if (!nb[i].length) nb[i].push(i); for (const q of nb[i]) list.push(q); }
    nStart[NVb] = list.length;
    return { rest, ao:new Float32Array(NVb).fill(1), index, nStart, nIdx:new Int32Array(list), nrest:restNormals(rest, index) };
  }
  
  // 둥근 돔 몸통
  //   opts : fromGeometry 옵션 ({ floor:false, centerY:0 } 등). 완전한 구는 dome 에 flat:false 를 준다.
  function create(domeOpt, opts){
    const P = Object.assign({}, DEFAULT_DOME, domeOpt || {});
    return fromGeometry(build(P), Object.assign({ floor:true, dome:P }, opts || {}));
  }

  // 어떤 모양이든 { rest, index, nStart, nIdx, nrest } 만 있으면 같은 젤리 물리를 적용한다
  //   opts.floor === false 이면 바닥 없이 공중에 떠 있는 몸통 (실루엣 말랑이용)
  function fromGeometry(g, opts){
    opts = opts || {};
    const NV = g.rest.length/3;
    const hasFloor = opts.floor !== false;
    const rest = g.rest, nStart = g.nStart, nIdx = g.nIdx;
    let MINY = 1e9, TOP = -1e9;
    const ext0 = { x0:1e9, x1:-1e9, y0:1e9, y1:-1e9, z0:1e9, z1:-1e9 };
    for (let i=0;i<NV;i++){
      const x=rest[i*3], y=rest[i*3+1], z=rest[i*3+2];
      if (y<MINY) MINY=y; if (y>TOP) TOP=y;
      if (x<ext0.x0) ext0.x0=x; if (x>ext0.x1) ext0.x1=x;
      if (y<ext0.y0) ext0.y0=y; if (y>ext0.y1) ext0.y1=y;
      if (z<ext0.z0) ext0.z0=z; if (z>ext0.z1) ext0.z1=z;
    }
    const FLOOR = hasFloor ? MINY : -1e9;
    const CENTER_Y = opts.centerY != null ? opts.centerY : 0.5*(TOP + MINY) - 0.03;   // 눌림(납작해짐)의 기준 높이
    const hxE=(ext0.x1-ext0.x0)/2, hyE=(ext0.y1-ext0.y0)/2, hzE=(ext0.z1-ext0.z0)/2;
    const extent = Object.assign({}, ext0);            // 현재 몸통의 가로/세로/깊이 범위 (그림자 크기 등에 사용)
    const pos    = new Float32Array(rest);          // 현재 위치
    const d      = new Float32Array(NV*3);          // 변위
    const v      = new Float32Array(NV*3);          // 속도
    const T      = new Float32Array(NV*3);          // 손가락이 만드는 목표 변위
    const strain = new Float32Array(NV);            // 눌린 부분 밝아지는 정도
    let sleeping = true;

    // ---- 접촉(손가락/손바닥) → 정점별 목표 변위 ----
    function computeTargets(contacts){
      T.fill(0);
      if (!contacts.length) return;
      let sumHn = 0;
      for (const c of contacts){ c.hn = Math.min(1.2, c.h / MAX_DEPTH); sumHn += c.hn; }
      const share = 1 / Math.max(1, sumHn*0.9);      // 여러 손가락이 동시에 눌러도 전체가 과하게 납작해지지 않게
      for (const c of contacts){
        c.hn *= share;
        // 누르는 방향으로 몸이 얇으면(판 모양) 옆으로 퍼지는 양도 그만큼만 — 얇은 판이 통째로 부풀어 보이지 않게
        { const q = Math.min(1, (Math.abs(c.dx)*hxE + Math.abs(c.dy)*hyE + Math.abs(c.dz)*hzE) / 0.6); c.gx = q*q; }
        // 바닥 고정: 몸이 눌릴 때 바닥면이 떠오르지 않게 보정값 계산
        if (hasFloor){
          const qy = FLOOR - CENTER_Y;
          const qa = qy*c.dy;
          const byOff = c.hn*(-0.30*qa*c.dy + 0.16*c.gx*(qy - qa*c.dy));
          c.lift = Math.max(0, byOff);
        } else c.lift = 0;
      }
      for (let i=0;i<NV;i++){
        const i3=i*3;
        const rx=rest[i3], ry=rest[i3+1], rz=rest[i3+2];
        let tx=0, ty=0, tz=0;
        for (let n=0;n<contacts.length;n++){
          const c = contacts[n];
          // (1) 몸 전체가 눌리는 방향으로 납작해지고 옆으로 퍼짐(부피 보존 느낌)
          const qx=rx, qyv=ry-CENTER_Y, qz=rz;
          const qa = qx*c.dx + qyv*c.dy + qz*c.dz;
          tx += c.hn*(-0.30*qa*c.dx + 0.16*c.gx*(qx  - qa*c.dx));
          ty += c.hn*(-0.30*qa*c.dy + 0.16*c.gx*(qyv - qa*c.dy)) - c.lift;
          tz += c.hn*(-0.30*qa*c.dz + 0.16*c.gx*(qz  - qa*c.dz));

          // (2) 접촉 지점 근처의 국소 움푹 패임
          const sx=rx-c.ax, sy=ry-c.ay, sz=rz-c.az;
          const a = sx*c.dx + sy*c.dy + sz*c.dz;
          const px=sx-a*c.dx, py=sy-a*c.dy, pz=sz-a*c.dz;
          const rho2 = px*px+py*py+pz*pz;
          const lim = 3.3*c.r;
          if (rho2 > lim*lim) continue;
          const rho = Math.sqrt(rho2);
          const att  = a > 0 ? Math.exp(-a/0.50) : Math.exp(a/0.60);
          const att2 = a > 0 ? Math.exp(-a/0.75) : Math.exp(a/0.75);
          const x1 = rho/c.r, x2 = rho/(2.7*c.r);
          const g1 = x1 < 1 ? (1-x1*x1)*(1-x1*x1) : 0;
          const g2 = x2 < 1 ? (1-x2*x2)*(1-x2*x2) : 0;
          const w = (0.55*g1 + 0.45*g2)*att;

          const pw = c.h*w*0.85;
          tx += c.dx*pw + c.lx*w*0.9;
          ty += c.dy*pw + c.ly*w*0.9;
          tz += c.dz*pw + c.lz*w*0.9;

          // (3) 눌린 자리 둘레가 도넛처럼 부풀어 오름
          const e = (x1-1.55)/0.85;
          const ring = Math.exp(-e*e) * att2;
          if (rho > 1e-4 && ring > 1e-3){
            const kk = 0.30*c.h*ring/rho;
            tx += px*kk; ty += py*kk; tz += pz*kk;
          }
          const rise = 0.14*c.h*ring;
          tx -= c.dx*rise; ty -= c.dy*rise; tz -= c.dz*rise;
        }
        T[i3]=tx; T[i3+1]=ty; T[i3+2]=tz;
      }
    }

    function substep(h){
      for (let i=0;i<NV;i++){
        const i3=i*3;
        const a=nStart[i], b=nStart[i+1], inv=1/(b-a);
        let mdx=0,mdy=0,mdz=0,mvx=0,mvy=0,mvz=0;
        for (let k=a;k<b;k++){
          const j3=nIdx[k]*3;
          mdx+=d[j3]; mdy+=d[j3+1]; mdz+=d[j3+2];
          mvx+=v[j3]; mvy+=v[j3+1]; mvz+=v[j3+2];
        }
        mdx*=inv; mdy*=inv; mdz*=inv; mvx*=inv; mvy*=inv; mvz*=inv;
        v[i3]   += (K*(T[i3]  -d[i3])   + KN*(mdx-d[i3])   + CN*(mvx-v[i3])   - C*v[i3])  *h;
        v[i3+1] += (K*(T[i3+1]-d[i3+1]) + KN*(mdy-d[i3+1]) + CN*(mvy-v[i3+1]) - C*v[i3+1])*h;
        v[i3+2] += (K*(T[i3+2]-d[i3+2]) + KN*(mdz-d[i3+2]) + CN*(mvz-v[i3+2]) - C*v[i3+2])*h;
      }
      for (let i=0;i<NV;i++){
        const i3=i*3;
        d[i3]+=v[i3]*h; d[i3+1]+=v[i3+1]*h; d[i3+2]+=v[i3+2]*h;
        // 바닥: 뚫고 내려가지 않고, 눌린 만큼 옆으로 퍼진다
        const y = rest[i3+1] + d[i3+1];
        if (hasFloor && y < FLOOR){
          const pen = FLOOR - y;
          d[i3+1] = FLOOR - rest[i3+1];
          if (v[i3+1] < 0) v[i3+1] = 0;
          d[i3]   += (rest[i3]  +d[i3])  *pen*0.30;
          d[i3+2] += (rest[i3+2]+d[i3+2])*pen*0.30;
        }
      }
    }

    
    // ---- 꽉 쥐기: 손으로 전체를 움켜쥔 것처럼 중심을 향해 줄어들고,
    //      손가락 사이로 삐져나오듯 군데군데 울퉁불퉁 부풀어 오른다 ----
    const GRIP_SHRINK = 0.30, GRIP_BULGE = 0.07;
    const GRIP_CY = hasFloor ? FLOOR : CENTER_Y;         // 바닥이 있으면 바닥에 붙은 채로 줄어든다
    function addGrip(grip, time){
      if (grip <= 0.001) return;
      for (let i=0;i<NV;i++){
        const i3=i*3, rx=rest[i3], ry=rest[i3+1], rz=rest[i3+2];
        const l = 0.5*( Math.sin(5.1*rx+1.3)*Math.sin(4.3*ry+0.7) + Math.sin(4.7*rz+2.1)*Math.sin(3.9*rx+0.4) );   // -1..1 울퉁불퉁 무늬
        const s = GRIP_SHRINK*grip*(1 + 0.15*l);
        const bulge = GRIP_BULGE*grip*(0.30 + 0.70*(0.5 + 0.5*l)) + 0.010*grip*Math.sin(time*22 + 2.6*rx + 3.1*ry + 1.7*rz);      // 부드럽게 퍼지는 떨림 포함
        T[i3]   += -s*rx           + g.nrest[i3]  *bulge;
        T[i3+1] += -s*(ry-GRIP_CY) + g.nrest[i3+1]*bulge;
        T[i3+2] += -s*rz           + g.nrest[i3+2]*bulge;
      }
    }

    // returns { active, deform }  (active=false 이면 화면 갱신 불필요)
    //   grip : 꽉 쥐는 정도 0~1,  time : 초 단위 시간(떨림용)
    function step(dt, contacts, grip, time){
      grip = grip || 0; time = time || 0;
      const idle = !contacts.length && grip <= 0.001;
      if (idle && sleeping) return { active:false, deform:0 };
      sleeping = false;
      computeTargets(contacts);
      addGrip(grip, time);
      const n = Math.max(1, Math.ceil(dt/(1/160)));
      const h = dt/n;
      for (let s=0;s<n;s++) substep(h);

      let sumD=0, maxV=0, maxD=0;
      let ex0=1e9, ex1=-1e9, ez0=1e9, ez1=-1e9, ey0=1e9, ey1=-1e9;
      for (let i=0;i<NV;i++){
        const i3=i*3;
        const px=rest[i3]+d[i3], py=rest[i3+1]+d[i3+1], pz=rest[i3+2]+d[i3+2];
        pos[i3]=px; pos[i3+1]=py; pos[i3+2]=pz;
        if (px<ex0) ex0=px; if (px>ex1) ex1=px; if (pz<ez0) ez0=pz; if (pz>ez1) ez1=pz; if (py<ey0) ey0=py; if (py>ey1) ey1=py;
        const dm = Math.hypot(d[i3],d[i3+1],d[i3+2]);
        const vm = Math.abs(v[i3])+Math.abs(v[i3+1])+Math.abs(v[i3+2]);
        sumD += dm; if (dm>maxD) maxD=dm; if (vm>maxV) maxV=vm;
        strain[i] += (Math.min(1, dm*1.8) - strain[i]) * 0.22;
      }
      extent.x0=ex0; extent.x1=ex1; extent.y0=ey0; extent.y1=ey1; extent.z0=ez0; extent.z1=ez1;
      if (idle && maxV < 0.004 && maxD < 0.0008){
        d.fill(0); v.fill(0); pos.set(rest); strain.fill(0); sleeping = true;
        Object.assign(extent, ext0);
      }
      return { active:true, deform: Math.min(1, sumD/NV*5) };
    }

    return { NV, rest, ao: g.ao, nrest: g.nrest, index: g.index, pos, strain, step, floorY: MINY, hasFloor, CENTER_Y, dome: opts.dome || null, extent, restExtent: ext0 };
  }


  // ---- 사진 비율에 맞는 돔 + 카메라 자동 피팅 (기준 카메라: 위에서 el 각도, fov 30°) ----
  function domePoints(P){
    const pts = [], tmp = [0,0,0], NS = 72, NL = 40;
    shape(0, 0, tmp, P);            pts.push(tmp.slice());
    shape(Math.PI, 0, tmp, P);      pts.push(tmp.slice());
    for (let j=1;j<=NL;j++) for (let s=0;s<NS;s++){ shape(j*Math.PI/(NL+1), s*2*Math.PI/NS, tmp, P); pts.push(tmp.slice()); }
    return pts;
  }
  function hullOf(pts, el, dist, ty){
    const ce=Math.cos(el), se=Math.sin(el);
    const cam=[0, ty+dist*se, dist*ce];
    const fx=-cam[0], fy=ty-cam[1], fz=-cam[2], fl=Math.hypot(fx,fy,fz);
    const fw=[fx/fl, fy/fl, fz/fl], up=[0, ce, -se];
    const t=Math.tan(15*Math.PI/180);
    let mnx=1e9, mxx=-1e9, mny=1e9, mxy=-1e9;
    for (const p of pts){
      const dx=p[0]-cam[0], dy=p[1]-cam[1], dz=p[2]-cam[2];
      const z=dx*fw[0]+dy*fw[1]+dz*fw[2];
      const x=dx/(z*t), y=(dy*up[1]+dz*up[2])/(z*t);
      if (x<mnx) mnx=x; if (x>mxx) mxx=x; if (y<mny) mny=y; if (y>mxy) mxy=y;
    }
    return { cy:(mny+mxy)/2, ratio:(mxy-mny)/(mxx-mnx) };
  }
  function solveLookY(dome, el, dist){
    const pts = domePoints(Object.assign({}, DEFAULT_DOME, dome||{}));
    let ty = 0.3;
    for (let k=0;k<14;k++) ty += hullOf(pts, el, dist, ty).cy * dist*Math.tan(15*Math.PI/180) * 0.9;
    return ty;
  }
  // aspect = 사진 속 몸통의 (세로 반지름 / 가로 반지름). 너무 납작하면 카메라를 더 낮춰서 맞춘다.
  function fitDome(aspect, el, dist){
    const base = { A:DEFAULT_DOME.A, C:DEFAULT_DOME.C };
    let e = el, Hup = 1;
    for (let tries=0; tries<6; tries++){
      let lo = 0.25, hi = 2.6, ty = 0.1;
      for (let it=0; it<28; it++){
        const mid = (lo+hi)/2;
        const pts = domePoints(Object.assign({}, base, { Hup:mid, Hlo:mid*0.5 }));
        for (let k=0;k<4;k++) ty += hullOf(pts, e, dist, ty).cy * dist*Math.tan(15*Math.PI/180) * 0.9;
        if (hullOf(pts, e, dist, ty).ratio < aspect) lo = mid; else hi = mid;
      }
      Hup = (lo+hi)/2;
      if (Hup > 0.33 || e < 0.25) break;
      e -= 0.1;
    }
    const dome = { A:base.A, C:base.C, Hup, Hlo:Hup*0.5 };
    return { dome, el:e, lookY: solveLookY(dome, e, dist) };
  }

  return { create, fromGeometry, buildLathe, buildBox, restNormals, fitDome, solveLookY, setDensity,
           grid:()=>({ S, L, NV }), DEFAULT_DOME, FLOOR_Y, MAX_DEPTH };
})();
