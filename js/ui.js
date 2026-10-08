// 말랑이 목록 정리 · 홈 카드 · 아래 가로 목록 · 만진 횟수 · 크레딧
import { MALANGIS } from './config.js';
import { $, showMsg } from './dom.js';
import { makeMask, makeCutoutCanvas } from './image/silhouette.js';
import { waxThumb } from './image/texture.js';
import { loadImage } from './loader.js';

const DEFAULTS = {
  tag: '사용 가능',
  messages: { 10:'스트레스가 조금 풀렸나요? 😌', 50:'말랑이 마스터 인정 🏆', 100:'오늘 100번째! 이제 좀 쉬어요 🧘' }
};
function asset(src){
  if (typeof src !== 'string') return '';
  if (src.indexOf('asset:') === 0) return (typeof ASSETS !== 'undefined' && ASSETS[src.slice(6)]) || '';
  return src;
}
const LIST = [];
MALANGIS.forEach((m)=>{
  if (!m || !m.id || !m.name || (!m.img && !m.wax)){ console.warn('[말랑이] id / name / img 는 필수예요. 이 항목은 건너뜁니다:', m); return; }
  if (LIST.some(x=>x.id===m.id)){ console.warn('[말랑이] id 가 중복이에요:', m.id); return; }
  LIST.push(Object.assign({}, DEFAULTS, m));
});

const gridEl = $('grid');

// ---------- 만진 횟수 (말랑이별로 저장) ----------
const counts = {};
function getCount(m){
  if (counts[m.id] == null){
    let n = 0;
    try {
      let v = localStorage.getItem('malangi_count_' + m.id);
      if (v == null && m.id === 'mandu') v = localStorage.getItem('malangi_count');   // 예전 버전 기록 이어받기
      n = parseInt(v || '0', 10) || 0;
    } catch(e){}
    counts[m.id] = n;
  }
  return counts[m.id];
}
function setCount(m, n){
  counts[m.id] = n;
  try { localStorage.setItem('malangi_count_' + m.id, String(n)); } catch(e){}
}
// ---------- 크레딧 (어떤 말랑이를 만지든 터치 한 번에 1개씩 쌓임 · 브라우저에 저장) ----------
const creditEl = $('credit'), creditNumEl = $('creditNum'), creditPlusEl = $('creditPlus');
let credits = 0;
try { const v = parseInt(localStorage.getItem('malangi_credits'), 10); if (v > 0) credits = v; } catch(e){}
function showCredits(bump){
  creditNumEl.textContent = credits.toLocaleString();
  if (bump){                                                      // 숫자가 통통 튀고 +1 이 떠올랐다 사라짐
    creditEl.classList.remove('bump'); creditPlusEl.classList.remove('show');
    void creditEl.offsetWidth;
    creditEl.classList.add('bump'); creditPlusEl.classList.add('show');
  }
}
function addCredit(n){
  credits += n;
  try { localStorage.setItem('malangi_credits', String(credits)); } catch(e){}
  showCredits(true);
}
function bumpCount(m){
  addCredit(1);                                       // 터치 한 번(누르기 1회 · 꽉 쥐기 1회)마다 크레딧 +1
  const n = getCount(m) + 1;
  setCount(m, n); $('count').textContent = n;
  const msg = m.messages && m.messages[n];
  if (msg) showMsg(msg);
}

// ---------- 실루엣 말랑이용 마스크 캐시 ----------
const maskCache = new Map();
function getMask(m, img){
  if (!maskCache.has(m.id)) maskCache.set(m.id, makeMask(img, m.cutout));
  return maskCache.get(m.id);
}

// ---------- 홈 화면 (목록으로 카드 자동 생성) ----------
function refreshTag(m){
  const n = getCount(m);
  m._tagEl.textContent = n > 0 ? (n + '번 만졌어요') : m.tag;
}
function buildHome(onOpen){
  gridEl.textContent = '';
  LIST.forEach((m)=>{
    const btn = document.createElement('button');
    btn.className = 'malangi-card'; btn.type = 'button';
    const th = document.createElement('div'); th.className = 'thumb';
    const im = document.createElement('img'); im.alt = m.name;
    if (m.wax && !m.thumb) im.src = waxThumb(m.wax);                       // 왁뿌볼: 사진 없이 색으로 만든 썸네일
    else if (m.thumb || (m.shape !== 'silhouette' && m.shape !== 'sphere' && m.shape !== 'lathe' && m.shape !== 'box')) im.src = (m.thumb || m.img);
    else loadImage(m).then((img)=>{                                   // 실루엣 말랑이: 배경을 지운 사진을 썸네일로
      if (!img) return;
      setTimeout(()=>{ try { im.src = makeCutoutCanvas(img, getMask(m, img), 160).toDataURL(); } catch(e){ console.warn('[말랑이] 썸네일 생성 실패:', m.id, e); } }, 30);
    });
    th.appendChild(im); m._thumbEl = im;                               // 아래쪽 가로 목록도 이 썸네일을 그대로 써요
    const nm = document.createElement('div'); nm.className = 'name'; nm.textContent = m.name;
    const tg = document.createElement('div'); tg.className = 'tag';
    m._tagEl = tg;
    btn.append(th, nm, tg);
    btn.addEventListener('click', ()=> onOpen(m));
    gridEl.appendChild(btn);
    refreshTag(m);
  });
  const slots = Math.max(4, LIST.length + (LIST.length % 2));      // 빈 칸은 잠금 카드로
  for (let i=LIST.length;i<slots;i++){
    const el = document.createElement('div');
    el.className = 'malangi-card locked';
    el.innerHTML = '<div class="thumb">🔒</div><div class="name">???</div><div class="tag">곧 만나요</div>';
    el.addEventListener('click', ()=>{ el.classList.remove('shake'); requestAnimationFrame(()=> el.classList.add('shake')); });
    gridEl.appendChild(el);
  }
}
// ---------- 아래쪽 가로 말랑이 목록 (config 의 FEATURED 를 켰을 때) ----------
const stripEl = $('strip');
function buildStrip(onOpen){
  stripEl.textContent = '';
  LIST.forEach((m)=>{
    const b = document.createElement('button'); b.className = 'strip-item'; b.type = 'button'; b.title = m.name;
    const th = document.createElement('div'); th.className = 'thumb';
    const im = document.createElement('img'); im.alt = m.name;
    const copy = ()=>{ if (m._thumbEl && m._thumbEl.src) im.src = m._thumbEl.src; };
    if (m._thumbEl){ m._thumbEl.addEventListener('load', copy); copy(); }   // 홈 카드 썸네일이 늦게 만들어져도 따라 바뀜
    th.appendChild(im);
    const nm = document.createElement('div'); nm.className = 'name'; nm.textContent = m.name;
    b.append(th, nm);
    b.addEventListener('click', ()=> onOpen(m));
    m._stripEl = b;
    stripEl.appendChild(b);
  });
}
function markStrip(m){                                              // 지금 열린 말랑이를 표시하고 가운데로 스크롤
  LIST.forEach((x)=>{ if (x._stripEl) x._stripEl.classList.toggle('on', x === m); });
  const el = m._stripEl;
  if (el && stripEl.scrollTo) stripEl.scrollTo({ left: el.offsetLeft - (stripEl.clientWidth - el.offsetWidth)/2, behavior:'smooth' });
}

export { LIST, getMask, buildHome, buildStrip, markStrip, refreshTag, showCredits, bumpCount, getCount };
