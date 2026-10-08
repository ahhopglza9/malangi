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
