// 처음 방문했을 때만 "꾹 눌러 보세요" 안내를 한 번 보여 준다 (본 뒤에는 브라우저에 기억)
const KEY = 'malangi_coach_seen';
export function shouldShowCoach(storage){
  try { return !storage || storage.getItem(KEY) !== '1'; } catch(e){ return true; }
}
export function markCoachSeen(storage){
  try { if (storage) storage.setItem(KEY, '1'); } catch(e){}
}
