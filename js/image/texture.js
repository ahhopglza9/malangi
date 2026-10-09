import { morph } from './silhouette.js';

// =====================================================================
//  이미지 준비: 몸통 자동 감지 + 3D 텍스처용 가공
// =====================================================================
// 사진 속 몸통 타원을 자동으로 찾는다. (배경이 투명한 PNG일 때 가장 정확)
//   body = { cx, cy, rx, ry }  (픽셀 단위: 중심 x,y / 가로·세로 반지름)
function detectBody(img){
  const W = img.naturalWidth, H = img.naturalHeight;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  let x0=W, x1=-1, y0=H, y1=-1;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){
    if (d[(y*W+x)*4+3] > 200){ if (x<x0) x0=x; if (x>x1) x1=x; if (y<y0) y0=y; if (y>y1) y1=y; }
  }
  const opaqueWholeImage = x1<0 || ((x1-x0) >= W*0.985 && (y1-y0) >= H*0.985);
  if (opaqueWholeImage){            // 투명 배경이 없으면 안전하게 화면 가운데 큰 타원으로 가정
    return { cx:W/2, cy:H/2, rx:W*0.42, ry:H*0.42, auto:'fallback' };
  }
  const k = 0.975;                  // 가장자리 흰 테두리를 살짝 안쪽으로 제외
  return { cx:(x0+x1)/2, cy:(y0+y1)/2, rx:(x1-x0)/2*k, ry:(y1-y0)/2*k, auto:'alpha' };
}

// 몸통 바깥의 흰 테두리(헤일로)·투명 영역을 안쪽 색으로 번지게 채워서
// 3D 표면 가장자리에 하얀 선/검은 선이 생기지 않게 한다. (이미지 내용 자체는 그대로)
//   body : 몸통 타원 { cx, cy, rx, ry }   /   mk : (선택) 실루엣 마스크 — 있으면 타원 대신 마스크를 쓴다
function prepareTexCanvas(img, body, mk){
  const W = img.naturalWidth, H = img.naturalHeight;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, W, H), d = id.data;
  const mask = new Uint8Array(W*H);
  let sr=0, sg=0, sb=0, sn=0;
  if (mk){
    const er = morph(mk.m, W, H, 2, false);              // 경계 2px 안쪽만 믿는다 (배경이 섞인 가장자리 제외)
    for (let i=0;i<W*H;i++) if (er[i]){ mask[i]=1; sr+=d[i*4]; sg+=d[i*4+1]; sb+=d[i*4+2]; sn++; }
  } else {
    for (let y=0;y<H;y++) for (let x=0;x<W;x++){
      const i = y*W+x;
      const ex = (x-body.cx)/body.rx, ey = (y-body.cy)/body.ry;
      if (ex*ex+ey*ey <= 1 && d[i*4+3] >= 250){ mask[i]=1; sr+=d[i*4]; sg+=d[i*4+1]; sb+=d[i*4+2]; sn++; }
    }
  }
  if (!sn) return cv;
  // 확정된 영역 바깥으로 한 겹씩 번지게 채움 (최대 34px)
  const stamp = new Int32Array(W*H);
  let frontier = [];
  const NB = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){
    const i = y*W+x; if (mask[i]) continue;
    for (const o of NB){ const xx=x+o[0], yy=y+o[1]; if (xx>=0&&yy>=0&&xx<W&&yy<H&&mask[yy*W+xx]){ frontier.push(i); stamp[i]=1; break; } }
  }
  for (let it=2; it<36 && frontier.length; it++){
    for (const i of frontier){
      const x = i%W, y = (i/W)|0;
      let r=0, gg=0, b=0, n=0;
      for (const o of NB){ const xx=x+o[0], yy=y+o[1]; if (xx<0||yy<0||xx>=W||yy>=H) continue; const j=yy*W+xx; if (mask[j]){ r+=d[j*4]; gg+=d[j*4+1]; b+=d[j*4+2]; n++; } }
      if (n){ d[i*4]=r/n; d[i*4+1]=gg/n; d[i*4+2]=b/n; }
    }
    const next = [];
    for (const i of frontier){
      mask[i] = 1;
      const x = i%W, y = (i/W)|0;
      for (const o of NB){ const xx=x+o[0], yy=y+o[1]; if (xx<0||yy<0||xx>=W||yy>=H) continue; const j=yy*W+xx; if (!mask[j] && stamp[j] !== it){ stamp[j]=it; next.push(j); } }
    }
    frontier = next;
  }
  const mr = sr/sn, mg = sg/sn, mb = sb/sn;      // 남은 바깥 영역은 평균색으로
  for (let i=0;i<W*H;i++){ if (!mask[i]){ d[i*4]=mr; d[i*4+1]=mg; d[i*4+2]=mb; } d[i*4+3]=255; }
  g.putImageData(id, 0, 0);
  return cv;
}


// 사진이 없을 때 쓰는 단색 "사진"과 홈 카드용 썸네일
function solidImage(color){
  const c = document.createElement('canvas'); c.width = 32; c.height = 16;
  const g = c.getContext('2d'); g.fillStyle = color || '#f3ead7'; g.fillRect(0, 0, 32, 16);
  c.naturalWidth = 32; c.naturalHeight = 16;
  return c;
}
function waxThumb(w){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(46, 42, 6, 64, 64, 62);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, (w && w.color) || '#f3ead7'); gr.addColorStop(1, '#c9bda2');
  g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI*2); g.fill();
  g.strokeStyle = 'rgba(90,70,50,0.35)'; g.lineWidth = 2; g.beginPath();
  g.moveTo(58, 8); g.lineTo(70, 40); g.lineTo(56, 62); g.lineTo(74, 96); g.moveTo(70, 40); g.lineTo(100, 52); g.stroke();
  return c.toDataURL();
}

export { detectBody, prepareTexCanvas, solidImage, waxThumb };
