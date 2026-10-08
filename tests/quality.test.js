import { test, eq } from './t.js';
import { TIERS, initialTier, lowerTier, createFrameMonitor } from '../js/quality.js';

const pc = { search:'', touch:false, minSide:900, cores:8, memory:8 };
test('PC → 높음', ()=> eq(initialTier(pc), { tier:'high', locked:false }));
test('약한 폰 → 보통', ()=> eq(initialTier({ search:'', touch:true, minSide:390, cores:4, memory:undefined }).tier, 'mid'));
test('좋은 폰 → 높음', ()=> eq(initialTier({ search:'', touch:true, minSide:390, cores:8, memory:8 }).tier, 'high'));
test('?q=low 고정', ()=> eq(initialTier({ ...pc, search:'?q=low' }), { tier:'low', locked:true }));
test('bad q ignored', ()=> eq(initialTier({ ...pc, search:'?q=ultra' }), { tier:'high', locked:false }));
test('lowerTier', ()=> eq([lowerTier('high'), lowerTier('mid'), lowerTier('low')], ['mid', 'low', 'low']));
test('TIERS 값', ()=> eq(TIERS.mid, { pixelRatioCap:1.5, density:0.7 }));
test('느린 2초 → slow', ()=>{
  const m = createFrameMonitor(); let t = 0;
  for (let i=0;i<70;i++){ t += 30; m.add(t, 30); }
  eq(m.slow(t), true);
});
test('빠르면 slow 아님', ()=>{
  const m = createFrameMonitor(); let t = 0;
  for (let i=0;i<130;i++){ t += 16; m.add(t, 16); }
  eq(m.slow(t), false);
});
test('2초 안 됐으면 판단 보류', ()=>{
  const m = createFrameMonitor(); let t = 0;
  for (let i=0;i<20;i++){ t += 40; m.add(t, 40); }
  eq(m.slow(t), false);
});
test('ignores huge gaps (탭 전환)', ()=>{
  const m = createFrameMonitor(); let t = 0;
  for (let i=0;i<130;i++){ t += 16; m.add(t, 16); }
  t += 5000; m.add(t, 5000);
  for (let i=0;i<5;i++){ t += 16; m.add(t, 16); }
  eq(m.slow(t), false);
});

import { shouldRender } from '../js/quality.js';
test('움직이면 매 프레임 그린다', ()=> eq(shouldRender(true, 1000, 995), true));
test('가만히 있으면 50ms 지나야 그린다', ()=> eq([shouldRender(false, 1030, 1000), shouldRender(false, 1050, 1000)], [false, true]));
