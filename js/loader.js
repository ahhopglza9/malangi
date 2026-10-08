import { solidImage } from './image/texture.js';

// ---------- Three.js 로드 (cdnjs → jsDelivr 순서로 시도) ----------
const THREE_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js'
];
let threeState = window.THREE ? 'ready' : 'idle';
const threeWaiters = [];
function flushThree(){ threeWaiters.splice(0).forEach(cb=>cb(threeState==='ready')); }
function loadThree(){
  if (threeState !== 'idle') return;
  threeState = 'loading';
  (function next(i){
    if (window.THREE){ threeState='ready'; flushThree(); return; }
    if (i >= THREE_URLS.length){ threeState='failed'; flushThree(); return; }
    const s = document.createElement('script');
    s.src = THREE_URLS[i]; s.async = true;
    s.onload  = ()=>{ if (window.THREE){ threeState='ready'; flushThree(); } else next(i+1); };
    s.onerror = ()=> next(i+1);
    document.head.appendChild(s);
  })(0);
}
function whenThree(cb){
  if (threeState==='ready') cb(true);
  else if (threeState==='failed') cb(false);
  else { threeWaiters.push(cb); loadThree(); }
}

// ---------- 이미지 로드 (말랑이별 캐시) ----------
const imgCache = new Map();
function loadImageSrc(key, spec){
  if (!imgCache.has(key)){
    imgCache.set(key, new Promise((res)=>{
      const im = new Image();
      const src = spec || '';
      if (src && src.indexOf('data:') !== 0) im.crossOrigin = 'anonymous';
      im.onload  = ()=> res(im);
      im.onerror = ()=>{ console.warn('[말랑이] 사진을 불러오지 못했어요:', key, spec); res(null); };
      im.src = src;
    }));
  }
  return imgCache.get(key);
}
function loadImage(m){
  if (!m.img && m.wax) return Promise.resolve(solidImage(m.wax.color));       // 왁뿌볼: 사진이 없으면 왁스 색 한 가지로
  return loadImageSrc(m.id, m.img);
}
function loadImageBack(m){ return m.imgBack ? loadImageSrc(m.id + ':back', m.imgBack) : Promise.resolve(null); }

export { loadThree, whenThree, loadImage, loadImageBack };
