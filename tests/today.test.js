import { test, eq } from './t.js';
import { localDate, readToday, writeToday } from '../js/today.js';

function mem(){ const m = new Map(); return { getItem:k=> m.has(k) ? m.get(k) : null, setItem:(k,v)=> m.set(k, String(v)), m }; }
const D = (s)=> new Date(s);                        // 로컬 시각

test('localDate 형식', ()=> eq(localDate(D('2026-03-05T09:00:00')), '2026-03-05'));
test('처음엔 0', ()=> eq(readToday(mem(), 'mandu', D('2026-10-07T10:00:00')), 0));
test('같은 날 이어서 센다', ()=>{
  const s = mem(); const t = D('2026-10-07T10:00:00');
  writeToday(s, 'mandu', 3, t);
  eq(readToday(s, 'mandu', D('2026-10-07T23:59:00')), 3);
  eq(s.m.get('malangi_today_mandu'), '{"d":"2026-10-07","n":3}');
});
test('crosses midnight: 다음 날이면 0', ()=>{
  const s = mem(); writeToday(s, 'mandu', 7, D('2026-10-07T23:59:00'));
  eq(readToday(s, 'mandu', D('2026-10-08T00:00:01')), 0);
});
test('말랑이별로 따로', ()=>{
  const s = mem(); const t = D('2026-10-07T10:00:00');
  writeToday(s, 'mandu', 2, t); writeToday(s, 'gun', 5, t);
  eq([readToday(s, 'mandu', t), readToday(s, 'gun', t)], [2, 5]);
});
test('storage throws: 0, 오류 없음', ()=>{
  const bad = { getItem(){ throw new Error('blocked'); }, setItem(){ throw new Error('blocked'); } };
  eq(readToday(bad, 'mandu'), 0);
  writeToday(bad, 'mandu', 1);
});
test('corrupt value: 깨진 값/예전 숫자 형식 → 0', ()=>{
  const s = mem(); const t = D('2026-10-07T10:00:00');
  s.setItem('malangi_today_mandu', '{oops'); eq(readToday(s, 'mandu', t), 0);
  s.setItem('malangi_today_mandu', '12');    eq(readToday(s, 'mandu', t), 0);
  s.setItem('malangi_today_mandu', '{"d":"2026-10-07","n":"x"}'); eq(readToday(s, 'mandu', t), 0);
});
test('예전 키는 읽지 않는다', ()=>{
  const s = mem(); s.setItem('malangi_count_mandu', '40'); s.setItem('malangi_count', '40');
  eq(readToday(s, 'mandu'), 0);
});
