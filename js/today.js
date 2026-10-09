// 오늘 만진 횟수 (말랑이별) — 날짜가 바뀌면 0부터. 저장: malangi_today_<id> = {"d":"YYYY-MM-DD","n":N}
export function localDate(now = new Date()){
  const p = (x)=> String(x).padStart(2, '0');
  return now.getFullYear() + '-' + p(now.getMonth()+1) + '-' + p(now.getDate());
}
export function readToday(storage, id, now = new Date()){
  try {
    const v = JSON.parse(storage.getItem('malangi_today_' + id));
    return v && typeof v === 'object' && v.d === localDate(now) && Number.isInteger(v.n) && v.n >= 0 ? v.n : 0;
  } catch(e){ return 0; }
}
export function writeToday(storage, id, n, now = new Date()){
  try { storage.setItem('malangi_today_' + id, JSON.stringify({ d: localDate(now), n })); } catch(e){}
}
// 저장소가 막혀 있거나(사생활 보호 모드 등) 가득 차도 세션 안에서는 계속 세도록, 메모리에 같이 들고 있는다
//   getStore : 저장소를 돌려주는 함수 (접근 자체가 실패하면 null)
export function createTodayCounter(getStore){
  const mem = {};                                                 // id → { d, n }
  return {
    get(id, now = new Date()){
      const d = localDate(now);
      if (!mem[id]){ const s = getStore(); mem[id] = { d, n: s ? readToday(s, id, now) : 0 }; }
      return mem[id].d === d ? mem[id].n : 0;
    },
    set(id, n, now = new Date()){
      mem[id] = { d: localDate(now), n };
      const s = getStore(); if (s) writeToday(s, id, n, now);
    },
  };
}
