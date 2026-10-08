import { SquishCore } from '../core/squish.js';

// =====================================================================
//  실루엣 몸통 : 사진 → 배경 제거(마스크) → 윤곽을 따라 부풀린 3D 몸통
//   makeMask(img, opt)          배경을 지우고 몸통 마스크를 만든다
//   buildSilhouette(mask, opt)  마스크 윤곽 그대로의 앞·뒤 두 겹 몸통(SquishCore.fromGeometry 에 넣는다)
//   makeCutoutCanvas(img, mask) 배경이 투명해진 사진 (홈 화면 썸네일용)
// =====================================================================

// ---------- 마스크 만들기 ----------
// 정사각 창으로 침식(dilate=false) / 팽창(dilate=true)
function morph(src, W, H, r, dilate){
  const t = new Uint8Array(W*H), o = new Uint8Array(W*H);
  for (let y=0;y<H;y++){
    const row = y*W;
    for (let x=0;x<W;x++){
      let v = dilate ? 0 : 1;
      for (let k=-r;k<=r;k++){
        const xx = x+k, s = (xx>=0 && xx<W) ? src[row+xx] : 0;
        if (dilate){ if (s){ v=1; break; } } else if (!s){ v=0; break; }
      }
      t[row+x] = v;
    }
  }
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){
    let v = dilate ? 0 : 1;
    for (let k=-r;k<=r;k++){
      const yy = y+k, s = (yy>=0 && yy<H) ? t[yy*W+x] : 0;
      if (dilate){ if (s){ v=1; break; } } else if (!s){ v=0; break; }
    }
    o[y*W+x] = v;
  }
  return o;
}
// 값이 같은 덩어리(4방향 연결) 라벨링. 반환: { lab, sizes }
function labelComponents(m, W, H, want){
  const lab = new Int32Array(W*H), stack = new Int32Array(W*H), sizes = [0];
  let id = 0;
  for (let i=0;i<W*H;i++){
    if (m[i] !== want || lab[i]) continue;
    id++; let sp = 0, cnt = 0; stack[sp++] = i; lab[i] = id;
    while (sp){
      const p = stack[--sp]; cnt++;
      const x = p%W, y = (p/W)|0;
      if (x>0   && m[p-1]===want && !lab[p-1]){ lab[p-1]=id; stack[sp++]=p-1; }
      if (x<W-1 && m[p+1]===want && !lab[p+1]){ lab[p+1]=id; stack[sp++]=p+1; }
      if (y>0   && m[p-W]===want && !lab[p-W]){ lab[p-W]=id; stack[sp++]=p-W; }
      if (y<H-1 && m[p+W]===want && !lab[p+W]){ lab[p+W]=id; stack[sp++]=p+W; }
    }
    sizes.push(cnt);
  }
  return { lab, sizes };
}
function parseColor(c){
  if (Array.isArray(c)) return c;
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c));
  return m ? [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)] : [255,255,255];
}

//   opt.bg      : 배경색('#ffffff' 처럼). 생략하면 "채도가 낮고 밝은 색 = 배경" (흰색/회색/체크무늬 배경)
//   opt.tol     : bg 를 줬을 때 배경으로 볼 색 거리 (기본 40)
//   opt.satMax / opt.minBright : 자동 배경 판정 기준 (기본 10 / 150)
//   opt.open    : 얇은 찌꺼기를 지우는 정도(픽셀). 기본 = 이미지 크기의 0.5%
//   이미 배경이 투명한 PNG 이면 알파 채널을 그대로 쓴다.
function makeMask(img, opt){
  opt = opt || {};
  const W = img.naturalWidth, H = img.naturalHeight;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  let m = new Uint8Array(W*H);

  let clear = 0;
  for (let i=0;i<W*H;i++) if (d[i*4+3] < 250) clear++;
  if (clear > W*H*0.02){                                   // 진짜 투명 배경
    for (let i=0;i<W*H;i++) m[i] = d[i*4+3] > 128 ? 1 : 0;
  } else {
    const bc = opt.bg ? parseColor(opt.bg) : null, tol = opt.tol == null ? 40 : opt.tol;
    const satMax = opt.satMax == null ? 10 : opt.satMax, minB = opt.minBright == null ? 150 : opt.minBright;
    for (let i=0;i<W*H;i++){
      const r=d[i*4], gg=d[i*4+1], b=d[i*4+2];
      if (bc) m[i] = Math.hypot(r-bc[0], gg-bc[1], b-bc[2]) > tol ? 1 : 0;
      else { const mx=Math.max(r,gg,b), mn=Math.min(r,gg,b); m[i] = ((mx-mn) <= satMax && (r+gg+b)/3 >= minB) ? 0 : 1; }
    }
  }

  const ro = opt.open == null ? Math.max(2, Math.round(Math.max(W,H)*0.005)) : opt.open;
  m = morph(morph(m, W, H, ro, false), W, H, ro, true);                 // 열기: 가느다란 찌꺼기 제거
  { const L = labelComponents(m, W, H, 1); let best = 1;                // 가장 큰 덩어리만
    for (let k=2;k<L.sizes.length;k++) if (L.sizes[k] > L.sizes[best]) best = k;
    for (let i=0;i<W*H;i++) m[i] = L.lab[i]===best ? 1 : 0; }
  m = morph(morph(m, W, H, 3, true), W, H, 3, false);                   // 닫기: 잔 틈 메우기
  { const L = labelComponents(m, W, H, 0);                              // 작은 구멍 메우기 (테두리와 안 이어진 배경)
    const touch = new Uint8Array(L.sizes.length);
    for (let x=0;x<W;x++){ touch[L.lab[x]] = 1; touch[L.lab[(H-1)*W+x]] = 1; }
    for (let y=0;y<H;y++){ touch[L.lab[y*W]] = 1; touch[L.lab[y*W+W-1]] = 1; }
    const limit = W*H*(opt.holes == null ? 0.004 : opt.holes);            // opt.holes: 메울 구멍의 최대 크기(사진 면적 대비). 0 이면 구멍을 그대로 둠 (방아쇠울처럼 뚫린 곳)
    for (let i=0;i<W*H;i++){ const l = L.lab[i]; if (l && !touch[l] && L.sizes[l] < limit) m[i] = 1; } }

  let x0=W, x1=-1, y0=H, y1=-1, area=0;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) if (m[y*W+x]){
    area++; if (x<x0) x0=x; if (x>x1) x1=x; if (y<y0) y0=y; if (y>y1) y1=y;
  }
  return { m, W, H, x0, x1, y0, y1, area,
           // texprep 의 body 형식과 맞춘 값: 몸통 경계 상자의 중심 / 반폭 / 반높이
           cx:(x0+x1)/2, cy:(y0+y1)/2, rx:(x1-x0+1)/2, ry:(y1-y0+1)/2 };
}

// 배경이 투명해진 사진 캔버스 (경계 1px 침식) — 홈 화면 썸네일 등에 사용
function makeCutoutCanvas(img, mask, maxSide){
  const W = mask.W, H = mask.H;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, W, H), d = id.data;
  const er = morph(mask.m, W, H, 1, false);
  for (let i=0;i<W*H;i++) if (!er[i]) d[i*4+3] = 0;
  g.putImageData(id, 0, 0);
  // 몸통 부분만 잘라서 작게
  const bw = mask.x1-mask.x0+1, bh = mask.y1-mask.y0+1, sc = (maxSide||128)/Math.max(bw,bh);
  const out = document.createElement('canvas');
  out.width = Math.max(1,Math.round(bw*sc)); out.height = Math.max(1,Math.round(bh*sc));
  out.getContext('2d').drawImage(cv, mask.x0, mask.y0, bw, bh, 0, 0, out.width, out.height);
  return out;
}

// ---------- 정확한 거리 변환 (Felzenszwalb) ----------
//  각 몸통 픽셀에서 가장 가까운 배경 픽셀까지의 거리와 그 픽셀 좌표를 구한다
function edt(m, W, H){
  const INF = 1e12, n = Math.max(W,H);
  const D = new Float32Array(W*H), BX = new Int16Array(W*H), BY = new Int16Array(W*H);
  const d1 = new Float64Array(W*H), a1 = new Int16Array(W*H);
  const f = new Float64Array(n), dd = new Float64Array(n), arg = new Int32Array(n), vv = new Int32Array(n), zz = new Float64Array(n+1);
  function dt1(len){
    let k = 0; vv[0] = 0; zz[0] = -INF; zz[1] = INF;
    for (let q=1;q<len;q++){
      let s;
      for (;;){
        const p = vv[k];
        s = ((f[q]+q*q) - (f[p]+p*p)) / (2*q - 2*p);
        if (s <= zz[k]) k--; else break;
      }
      k++; vv[k] = q; zz[k] = s; zz[k+1] = INF;
    }
    k = 0;
    for (let q=0;q<len;q++){
      while (zz[k+1] < q) k++;
      dd[q] = (q-vv[k])*(q-vv[k]) + f[vv[k]]; arg[q] = vv[k];
    }
  }
  for (let x=0;x<W;x++){
    for (let y=0;y<H;y++) f[y] = m[y*W+x] ? INF : 0;
    dt1(H);
    for (let y=0;y<H;y++){ d1[y*W+x] = dd[y]; a1[y*W+x] = arg[y]; }
  }
  for (let y=0;y<H;y++){
    for (let x=0;x<W;x++) f[x] = d1[y*W+x];
    dt1(W);
    for (let x=0;x<W;x++){ const q = arg[x]; D[y*W+x] = Math.sqrt(dd[x]); BX[y*W+x] = q; BY[y*W+x] = a1[y*W+q]; }
  }
  return { D, BX, BY };
}

// ---------- 윤곽을 따라 부풀린 몸통 ----------
//   opt.size  : 가장 긴 변의 길이 (월드 단위, 기본 2.8)
//   opt.puff  : 통통한 정도 (기본 1.0 — 1이면 가는 부분은 원통처럼 둥근 단면)
//   opt.depth : (선택) 절반 두께. 주면 둥근 베개 대신 납작한 판 모양 (번개처럼 두께가 일정한 모양에 어울려요)
//   opt.bevel : (선택) depth 를 줬을 때 모서리가 둥글게 올라오는 폭 (기본 depth×1.2)
//   opt.verts : 앞면 정점 수 목표 (기본 3200 → 앞뒤 합쳐 약 6500)
//   opt.thick : (선택) 위치마다 다른 두께 { rows:[[t,w],…], cols:[[t,w],…], scale } — 위·앞에서 찍은 사진에서 잰 값.
//               rows = 사진 위→아래(t 0~1)에 따른 전체 두께, cols = 사진 왼쪽→오른쪽(t 0~1)에 따른 전체 두께 (w 는 가장 긴 변 대비 비율).
//               둘 중 더 얇은 쪽이 그 자리의 두께가 돼요. 주면 puff 는 쓰지 않고, scale 로 전체 두께를 조절해요 (기본 1).
function buildSilhouette(mk, opt){
  opt = opt || {};
  const W = mk.W, H = mk.H, m = mk.m;
  const size = opt.size || 2.8, puff = opt.puff == null ? 1.0 : opt.puff;
  const E = edt(m, W, H);
  const bw = mk.x1-mk.x0+1, bh = mk.y1-mk.y0+1;
  const s = size / Math.max(bw, bh);                       // 픽셀 → 월드 단위
  const cell = Math.max(3, Math.sqrt(mk.area / (opt.verts || 3200)));
  const nx = Math.ceil(bw/cell)+1, ny = Math.ceil(bh/cell)+1;
  const ox = mk.x0 + (bw - (nx-1)*cell)/2, oy = mk.y0 + (bh - (ny-1)*cell)/2;

  // 1) 격자 정점: 몸통 안쪽에 있는 격자점
  const gid = new Int32Array(nx*ny).fill(-1);
  const gpx = [], gpy = [], gd = [];
  for (let j=0;j<ny;j++) for (let i=0;i<nx;i++){
    const px = ox+i*cell, py = oy+j*cell;
    const ix = Math.round(px), iy = Math.round(py);
    if (ix<0||iy<0||ix>=W||iy>=H || !m[iy*W+ix]) continue;
    gid[j*nx+i] = gpx.length; gpx.push(px); gpy.push(py); gd.push(Math.max(0, E.D[iy*W+ix]-0.5));
  }
  const NG = gpx.length;

  // 2) 삼각형 (한 칸에 꼭짓점 3~4개가 안쪽이면 채움)
  const tris = [];
  for (let j=0;j<ny-1;j++) for (let i=0;i<nx-1;i++){
    const a = gid[j*nx+i], b = gid[j*nx+i+1], c = gid[(j+1)*nx+i], e = gid[(j+1)*nx+i+1];
    const flip = (i+j)&1;
    if (a>=0 && b>=0 && c>=0 && e>=0){
      if (flip){ tris.push([a,b,e],[a,e,c]); } else { tris.push([a,b,c],[b,e,c]); }
    } else {
      const v = [a,b,c,e].filter(k=>k>=0);
      if (v.length === 3){
        // 순서: 격자 (a b / c e) 안에서 빠진 꼭짓점을 뺀 나머지 3개
        if (a<0) tris.push([b,e,c]); else if (b<0) tris.push([a,e,c]); else if (c<0) tris.push([a,b,e]); else tris.push([a,b,c]);
      }
    }
  }

  // 3) 경계 정점 찾기 → 실제 윤곽 위로 붙이기 (계단 모양 제거)
  const edgeCount = new Map();
  const ekey = (p,q)=> p<q ? p*NG+q : q*NG+p;
  for (const t of tris) for (let k=0;k<3;k++){
    const key = ekey(t[k], t[(k+1)%3]); edgeCount.set(key, (edgeCount.get(key)||0)+1);
  }
  const isBoundary = new Uint8Array(NG);
  edgeCount.forEach((cnt, key)=>{ if (cnt===1){ isBoundary[(key/NG)|0] = 1; isBoundary[key%NG] = 1; } });
  const dOrig = gd.slice();
  for (let k=0;k<NG;k++){
    if (!isBoundary[k]) continue;
    const ix = Math.round(gpx[k]), iy = Math.round(gpy[k]), idx = iy*W+ix;
    const bxp = E.BX[idx], byp = E.BY[idx];
    const dx = bxp-gpx[k], dy = byp-gpy[k], len = Math.hypot(dx,dy) || 1;
    const move = Math.max(0, len-0.5);
    gpx[k] += dx/len*move; gpy[k] += dy/len*move; gd[k] = 0;
  }

  // 4) 두께: 각 지점 주변의 "가장 큰 내접원 반지름" R 을 구해서 둥근 단면으로 부풀림
  //    (가는 총신은 가늘고 둥글게, 넓은 개머리판은 두껍게)
  const R = new Float32Array(NG);
  for (let k=0;k<NG;k++) R[k] = dOrig[k];
  const gi = new Int32Array(NG), gj = new Int32Array(NG);
  for (let j=0;j<ny;j++) for (let i=0;i<nx;i++){ const k = gid[j*nx+i]; if (k>=0){ gi[k]=i; gj[k]=j; } }
  for (let k=0;k<NG;k++){
    const r = dOrig[k]; if (r < cell) continue;
    const rc = Math.ceil(r/cell);
    for (let dj=-rc;dj<=rc;dj++) for (let di=-rc;di<=rc;di++){
      const ii = gi[k]+di, jj = gj[k]+dj;
      if (ii<0||jj<0||ii>=nx||jj>=ny) continue;
      const k2 = gid[jj*nx+ii]; if (k2<0) continue;
      if (Math.hypot(di,dj)*cell <= r && r > R[k2]) R[k2] = r;
    }
  }
  // 이웃 평균으로 부드럽게 (경계 정점 제외)
  const adj = Array.from({length:NG}, ()=>[]);
  for (const t of tris) for (let k=0;k<3;k++){
    const p=t[k], q=t[(k+1)%3];
    if (adj[p].indexOf(q)<0) adj[p].push(q);
    if (adj[q].indexOf(p)<0) adj[q].push(p);
  }
  for (let it=0; it<3; it++){
    const R2 = R.slice();
    for (let k=0;k<NG;k++){
      if (!adj[k].length) continue;
      let sum=0; for (const q of adj[k]) sum += R[q];
      R2[k] = 0.5*R[k] + 0.5*sum/adj[k].length;
    }
    R.set(R2);
  }
  const zf = new Float32Array(NG);
  const thick = opt.thick || null;
  const depthCap = opt.depth == null ? null : opt.depth;                       // 절반 두께(월드 단위). 주면 "납작한 판 + 둥근 모서리"
  const useCap = depthCap != null || thick != null;
  const lerpT = (arr, t)=>{                                                    // [[t,w],…] 표에서 t 위치의 값
    t = Math.min(1, Math.max(0, t));
    let i = 1; while (i < arr.length-1 && arr[i][0] < t) i++;
    const a = arr[i-1], b = arr[i], f = (t-a[0]) / Math.max(1e-9, b[0]-a[0]);
    return a[1] + (b[1]-a[1])*Math.min(1, Math.max(0, f));
  };
  const capAt = (k)=> thick                                                    // 그 자리의 절반 두께(월드 단위)
    ? 0.5*size*(thick.scale == null ? 1 : thick.scale)*Math.min(lerpT(thick.rows, (gpy[k]-mk.y0)/Math.max(1,bh-1)), lerpT(thick.cols, (gpx[k]-mk.x0)/Math.max(1,bw-1)))
    : depthCap;
  for (let k=0;k<NG;k++){
    if (isBoundary[k]) { zf[k] = 0; continue; }
    const r = Math.max(R[k], dOrig[k], 1e-3), dd = Math.min(dOrig[k], r);
    if (useCap){
      const cap = capAt(k);
      const bevelW = Math.max(1e-3, opt.bevel == null ? cap*1.2 : opt.bevel);   // 모서리가 둥글게 올라오는 폭
      const t = Math.min(1, dd*s/bevelW);                                       // 가는 부분은 t<1 이라 자동으로 더 얇아짐
      zf[k] = (thick ? 1 : puff) * cap * Math.sqrt(1 - (1-t)*(1-t));
    } else zf[k] = puff * Math.sqrt(Math.max(0, r*r - (r-dd)*(r-dd))) * s;
  }
  if (useCap){                                                                 // 격자 무늬 때문에 생기는 톱니 모양 모서리를 살짝 다듬기
    for (let it=0; it<2; it++){
      const z2 = zf.slice();
      for (let k=0;k<NG;k++){
        if (isBoundary[k] || !adj[k].length) continue;
        let sum=0; for (const q of adj[k]) sum += zf[q];
        z2[k] = 0.5*zf[k] + 0.5*sum/adj[k].length;
      }
      zf.set(z2);
    }
  }

  // 5) 앞면(+z)·뒷면(-z) 조립. 경계 정점은 공유해서 닫힌 몸통으로.
  const cxw = (mk.x0+mk.x1)/2, cyw = (mk.y0+mk.y1)/2;
  const backIdx = new Int32Array(NG);
  let NV = NG;
  for (let k=0;k<NG;k++) backIdx[k] = isBoundary[k] ? k : NV++;
  if (NV > 65000) throw new Error('정점이 너무 많아요 (opt.verts 를 줄여 주세요)');
  const rest = new Float32Array(NV*3);
  for (let k=0;k<NG;k++){
    const wx = (gpx[k]-cxw)*s, wy = (cyw-gpy[k])*s;
    rest[k*3] = wx; rest[k*3+1] = wy; rest[k*3+2] = zf[k];
    if (backIdx[k] !== k){ const b = backIdx[k]*3; rest[b] = wx; rest[b+1] = wy; rest[b+2] = -zf[k]; }
  }
  const idxArr = [];
  for (const t of tris){
    let [a,b,c] = t;
    const area2 = (rest[b*3]-rest[a*3])*(rest[c*3+1]-rest[a*3+1]) - (rest[c*3]-rest[a*3])*(rest[b*3+1]-rest[a*3+1]);
    if (area2 < 0){ const tmp = b; b = c; c = tmp; }          // 앞면은 항상 +z 쪽을 바라보게
    idxArr.push(a,b,c);
    idxArr.push(backIdx[a], backIdx[c], backIdx[b]);          // 뒷면은 반대 방향
  }
  const index = new Uint16Array(idxArr);

  // 6) 이웃 목록 (삼각형 모서리 기준)
  const nb = Array.from({length:NV}, ()=>[]);
  for (let t=0;t<index.length;t+=3) for (let k=0;k<3;k++){
    const p=index[t+k], q=index[t+(k+1)%3];
    if (p===q) continue;
    if (nb[p].indexOf(q)<0) nb[p].push(q);
    if (nb[q].indexOf(p)<0) nb[q].push(p);
  }
  const nStart = new Int32Array(NV+1), list = [];
  for (let i=0;i<NV;i++){ nStart[i] = list.length; if (!nb[i].length) nb[i].push(i); for (const q of nb[i]) list.push(q); }
  nStart[NV] = list.length;

  return {
    rest, index, nStart, nIdx: new Int32Array(list), ao: new Float32Array(NV).fill(1),
    nrest: SquishCore.restNormals(rest, index),
    info: { scale:s, cell, verts:NV, width:bw*s, height:bh*s, zmax: Math.max(...zf) }
  };
}

export { morph, labelComponents, parseColor, makeMask, makeCutoutCanvas, edt, buildSilhouette };
