// 효과음 다듬기 · 재생 모양 계산 (순수 함수 — Web Audio 와 무관해서 테스트하기 쉬움)
const dbToAmp = (db)=> Math.pow(10, db/20);
const clamp = (x, a, b)=> Math.min(b, Math.max(a, x));

// 앞뒤 무음 경계 [start, end) — 누르는 즉시 소리가 나도록 앞 무음을 자른다 (최대 maxLeadMs 까지만)
export function findBounds(channels, sampleRate, { thresholdDb = -40, padMs = 3, tailMs = 30, maxLeadMs = 250 } = {}){
  const len = channels[0].length, thr = dbToAmp(thresholdDb);
  let first = -1, last = -1;
  for (let i=0;i<len;i++){
    for (const d of channels){ if (Math.abs(d[i]) > thr){ if (first < 0) first = i; last = i; break; } }
  }
  if (first < 0) return { start: 0, end: len };
  const ms = sampleRate/1000;
  return {
    start: Math.min(Math.max(0, first - Math.round(padMs*ms)), Math.round(maxLeadMs*ms)),
    end: Math.min(len, last + 1 + Math.round(tailMs*ms)),
  };
}

// 소리 크기 맞추기: 가장 큰 windowMs 구간의 평균 크기를 targetDb 로 (짧게 "탁" 하는 소리가 꼬리 때문에 작게 계산되지 않게).
//   단 최대 크기가 peakDb 를 넘지 않게, 키우는 배율은 최대 maxGain
export function loudnessGain(channels, start, end, sampleRate, { targetDb = -20, peakDb = -1, maxGain = 8, windowMs = 50 } = {}){
  let peak = 0;
  for (const d of channels) for (let i=start;i<end;i++){ const a = Math.abs(d[i]); if (a > peak) peak = a; }
  if (end <= start || !peak) return 1;
  const W = Math.max(1, Math.round(windowMs*sampleRate/1000)), step = Math.max(1, Math.round(W/4));
  let best = 0;
  for (let s=start; s<end; s+=step){
    let sum = 0, n = 0;
    for (const d of channels) for (let i=s, e=Math.min(end, s+W); i<e; i++){ sum += d[i]*d[i]; n++; }
    best = Math.max(best, Math.sqrt(sum/n));
  }
  return Math.min(maxGain, dbToAmp(targetDb)/best, dbToAmp(peakDb)/peak);
}

// 끝을 부드럽게: 시작 inMs · 끝 outMs 동안 서서히 (잘린 자리에서 "틱" 소리가 나지 않게)
export function applyFades(d, sampleRate, inMs, outMs){
  const nIn = Math.min(d.length, Math.round(inMs*sampleRate/1000)), nOut = Math.min(d.length, Math.round(outMs*sampleRate/1000));
  for (let i=0;i<nIn;i++) d[i] *= i/nIn;
  for (let i=0;i<nOut;i++) d[d.length-1-i] *= i/nOut;
}

// 누르는 세기 0.4~1: 펜·터치가 압력을 알려 주면 그 값, 아니면 0.85 (0.5 는 압력을 모르는 기기의 기본값)
export function pressStrength({ pointerType, pressure }){
  if ((pointerType === 'pen' || pointerType === 'touch') && pressure > 0 && pressure !== 0.5) return clamp(pressure, 0.4, 1);
  return 0.85;
}

// 좌우 방향: 누른 위치가 화면 가운데면 0, 왼쪽 끝 -0.5, 오른쪽 끝 +0.5
export function panFor(x, rect){ return clamp((x - rect.left)/rect.width - 0.5, -0.5, 0.5); }

// 한 번 재생할 때의 모양: 세면 크고 낮고 밝게, 살살 누르면 작고 높고 부드럽게. rand(0~1) 로 매번 조금씩 다르게
export function hitShape(strength, rand){
  return {
    gain: 0.55 + 0.45*strength,
    rate: 1.06 - 0.10*strength + (rand - 0.5)*0.12,
    cutoff: (3000 + 15000*strength)*(0.85 + 0.3*rand),
  };
}
