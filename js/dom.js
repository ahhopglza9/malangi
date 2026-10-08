// 화면 도우미: 요소 찾기 · 잠깐 뜨는 메시지 · 진동
export const $ = (id)=> document.getElementById(id);
let msgTimer = null;
export function showMsg(t){
  const msgEl = $('msg');
  msgEl.textContent = t; msgEl.style.opacity = '1';
  clearTimeout(msgTimer); msgTimer = setTimeout(()=>{ msgEl.style.opacity = '0'; }, 2400);
}
export function haptic(ms){ try{ if (navigator.vibrate) navigator.vibrate(ms); }catch(e){} }
