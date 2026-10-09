// 화면 도우미: 요소 찾기 · 잠깐 뜨는 메시지 · 진동
export const $ = (id)=> document.getElementById(id);
let msgTimer = null;
export function showMsg(t){
  const msgEl = $('msg');
  msgEl.textContent = t; msgEl.style.opacity = '1';
  clearTimeout(msgTimer); msgTimer = setTimeout(()=>{ msgEl.style.opacity = '0'; }, 2400);
}
export function haptic(ms){ try{ if (navigator.vibrate) navigator.vibrate(ms); }catch(e){} }
// 시작이 늦어 "불러오지 못했어요" 안내가 이미 떴더라도, 시작되면 숨긴다
export function markBooted(){
  window.__malangiBooted = true;
  const el = document.getElementById('bootFail'); if (el) el.hidden = true;
}
