// 품질 단계: 기기 성능에 맞춰 해상도·메쉬 밀도를 고른다 ("높음" = 원래 품질)
export const TIERS = {
  high: { pixelRatioCap: 2,   density: 1   },
  mid:  { pixelRatioCap: 1.5, density: 0.7 },
  low:  { pixelRatioCap: 1,   density: 0.5 },
};
export function initialTier({ search, touch, minSide, cores, memory }){
  const q = new URLSearchParams(search || '').get('q');
  if (q && Object.prototype.hasOwnProperty.call(TIERS, q)) return { tier: q, locked: true };
  const phone = !!touch && minSide < 820;
  const weak = (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4);
  return { tier: phone && weak ? 'mid' : 'high', locked: false };
}
export const lowerTier = (t)=> t === 'high' ? 'mid' : 'low';
// 만지는 동안 최근 windowMs 의 평균 프레임 시간이 limitMs 를 넘고, 가만히 있을 때(기기 기본 속도)보다도 확실히 느리면 slow.
//   절전 모드처럼 화면 자체가 30Hz 로 묶인 기기는 가만히 있을 때도 33ms 라서 품질을 낮추지 않는다.
//   maxGapMs 보다 긴 간격(탭 전환 등)은 무시
export function createFrameMonitor({ windowMs = 2000, limitMs = 25, maxGapMs = 200, ratio = 1.3 } = {}){
  let s = [], base = 1000/60;                                     // base: 가만히 있을 때의 프레임 간격 (평균)
  return {
    idle(dt){ if (dt > 0 && dt <= maxGapMs) base += (dt - base)*0.05; },
    add(now, dt){
      if (dt > maxGapMs){ s = []; return; }
      s.push([now, dt]);
      while (s.length && now - s[0][0] > windowMs) s.shift();
    },
    reset(){ s = []; },
    slow(now){
      if (!s.length || now - s[0][0] < windowMs*0.9) return false;
      const avg = s.reduce((a, x)=> a + x[1], 0) / s.length;
      return avg > limitMs && avg > base*ratio;
    },
  };
}
// 움직이는 게 있으면 매 프레임, 가만히 있으면 50ms(≈20fps)마다 한 번만 그린다 (만두 뒷면 반짝이는 계속 보임)
export const shouldRender = (busy, now, lastRender)=> busy || now - lastRender >= 50;
