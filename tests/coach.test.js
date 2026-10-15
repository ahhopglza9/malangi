import { test, eq } from './t.js';
import { shouldShowCoach, markCoachSeen } from '../js/coach.js';

function mem(){ const m = new Map(); return { getItem:k=> m.has(k) ? m.get(k) : null, setItem:(k,v)=> m.set(k, String(v)) }; }
test('처음 방문이면 안내를 보여 준다', ()=> eq(shouldShowCoach(mem()), true));
test('한 번 본 뒤에는 안 보여 준다', ()=>{ const s = mem(); markCoachSeen(s); eq(shouldShowCoach(s), false); });
test('저장소가 막혀 있으면 보여 주되 오류는 없다', ()=>{
  const bad = { getItem(){ throw new Error('x'); }, setItem(){ throw new Error('x'); } };
  eq(shouldShowCoach(bad), true); markCoachSeen(bad);
});
test('저장소가 없어도 오류 없음', ()=>{ eq(shouldShowCoach(null), true); markCoachSeen(null); });
