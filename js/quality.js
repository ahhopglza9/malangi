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
// 최근 windowMs 동안의 평균 프레임 시간이 limitMs 를 넘으면 slow. maxGapMs 보다 긴 간격(탭 전환 등)은 무시
export function createFrameMonitor({ windowMs = 2000, limitMs = 25, maxGapMs = 200 } = {}){
  let s = [];
  return {
    add(now, dt){
      if (dt > maxGapMs){ s = []; return; }
      s.push([now, dt]);
      while (s.length && now - s[0][0] > windowMs) s.shift();
    },
    reset(){ s = []; },
    slow(now){
      if (!s.length || now - s[0][0] < windowMs*0.9) return false;
      return s.reduce((a, x)=> a + x[1], 0) / s.length > limitMs;
    },
  };
}
// 움직이는 게 있으면 매 프레임, 가만히 있으면 50ms(≈20fps)마다 한 번만 그린다 (만두 뒷면 반짝이는 계속 보임)
export const shouldRender = (busy, now, lastRender)=> busy || now - lastRender >= 50;
