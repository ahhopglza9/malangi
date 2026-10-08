// 시작점: 모듈을 이어 붙이고 화면을 띄운다
import { FEATURED } from './config.js';
import { $ } from './dom.js';
import { Sound } from './sound.js';
import { Wax } from './wax.js';
import { loadThree, whenThree, loadImage, loadImageBack } from './loader.js';
import { LIST, buildHome, buildStrip, markStrip, refreshTag, showCredits, bumpCount, getCount } from './ui.js';
import { initScene, hasRenderer, setReady, setActive, applyMalangi, resetInteraction, setGrip, setQuality } from './scene.js';
import { initialTier } from './quality.js';

window.__malangiBooted = true;
const homeScreen = $('homeScreen'), playScreen = $('playScreen');
const loadingEl = $('loading'), countEl = $('count'), msgEl = $('msg'), nameEl = $('playName');
let current = null, openToken = 0;

function openMalangi(m){
  if (current === m && playScreen.classList.contains('active')) return;   // 지금 보고 있는 말랑이를 다시 누르면 무시
  Sound.ensure();                                   // 카드 클릭 = 사용자 제스처 → 오디오 켜기
  homeScreen.classList.remove('active');
  playScreen.classList.add('active');
  nameEl.textContent = m.name;
  countEl.textContent = getCount(m);
  msgEl.style.opacity = '0';
  setReady(false); current = m; setActive(true);
  if (document.body.classList.contains('featured')) markStrip(m);
  if (hasRenderer()) resetInteraction();
  loadingEl.style.display = 'flex';
  loadingEl.textContent = '3D 말랑이 빚는 중… 🫧';
  const my = ++openToken;
  Sound.load(m);
  Promise.all([loadImage(m), loadImageBack(m), new Promise(res=>whenThree(res))]).then(([img, imgB, ok])=>{
    if (my !== openToken) return;                   // 그 사이 돌아갔거나 다른 말랑이를 열었음
    if (!ok){ loadingEl.textContent = '3D 엔진을 불러오지 못했어요.\n인터넷 연결을 확인하고 다시 들어와 주세요 🥲'; return; }
    if (!img){ loadingEl.textContent = '말랑이 사진을 불러오지 못했어요 🥲\n(config 의 img 경로를 확인해 주세요)'; return; }
    try {
      initScene({ onTouch: ()=> bumpCount(current) });
      applyMalangi(m, img, imgB);
      loadingEl.style.display = 'none';
      setReady(true);
    } catch(err){
      console.error(err);
      loadingEl.textContent = (err && err.name==='SecurityError')
        ? '사진 픽셀을 읽지 못했어요 🥲\n파일을 더블클릭하지 말고 웹 주소(Vercel 또는 로컬 서버)로 열어 주세요'
        : '이 기기에서는 3D(WebGL)를 켤 수 없어요 🥲';
    }
  });
}
function init(){
  const q = initialTier({                                         // 기기 성능에 맞는 시작 품질 (주소에 ?q=low|mid|high 로 고정 가능)
    search: location.search,
    touch: navigator.maxTouchPoints > 0,
    minSide: Math.min(screen.width, screen.height),
    cores: navigator.hardwareConcurrency,
    memory: navigator.deviceMemory,
  });
  setQuality(q.tier, q.locked);
  buildHome(openMalangi);
  showCredits(false);                               // 저장해 둔 크레딧 표시
  $('backBtn').addEventListener('click', ()=>{
    openToken++;                                    // 진행 중이던 로딩 취소
    setReady(false); setActive(false);
    setGrip(false);
    if (hasRenderer()) resetInteraction();
    playScreen.classList.remove('active');
    homeScreen.classList.add('active');
    if (current) refreshTag(current);
  });

  // 꽉 쥐기: 스페이스바를 누르고 있는 동안 / 화면의 ✊ 버튼을 누르고 있는 동안
  const playActive = ()=> playScreen.classList.contains('active');
  window.addEventListener('keydown', (e)=>{
    if (e.code !== 'Space' || !playActive()) return;
    e.preventDefault();                             // 페이지 스크롤 / 버튼 클릭 방지
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
    if (!e.repeat) setGrip(true);
  });
  window.addEventListener('keyup', (e)=>{
    if (e.code !== 'Space') return;
    if (playActive()) e.preventDefault();
    setGrip(false);
  });
  window.addEventListener('blur', ()=> setGrip(false));
  document.addEventListener('visibilitychange', ()=>{ if (document.hidden) setGrip(false); });
  const gb = $('gripBtn');
  gb.addEventListener('pointerdown', (e)=>{ e.preventDefault(); try { gb.setPointerCapture(e.pointerId); } catch(_){} Sound.ensure(); setGrip(true); });
  ['pointerup','pointercancel','lostpointercapture'].forEach((ev)=> gb.addEventListener(ev, ()=> setGrip(false)));
  gb.addEventListener('contextmenu', (e)=> e.preventDefault());

  // 볼륨: 슬라이더 + 음소거 토글 (설정은 브라우저에 기억)
  const volEl = $('volRange'), muteEl = $('muteBtn');
  function refreshVol(){
    const v = Sound.getVolume(), m = Sound.isMuted();
    volEl.value = Math.round(v*100);
    muteEl.textContent = (m || v === 0) ? '🔇' : (v < 0.5 ? '🔉' : '🔊');
    muteEl.setAttribute('aria-pressed', m ? 'true' : 'false');
    volEl.style.opacity = m ? 0.45 : 1;
  }
  volEl.addEventListener('input', ()=>{ Sound.setVolume(volEl.value/100); refreshVol(); });
  volEl.addEventListener('change', ()=> Sound.preview());
  muteEl.addEventListener('click', ()=>{
    if (Sound.getVolume() === 0){ Sound.setVolume(0.8); Sound.setMuted(false); }
    else Sound.setMuted(!Sound.isMuted());
    refreshVol(); muteEl.blur();
  });
  refreshVol();

  const wr = $('waxReset');                        // 왁뿌볼: 새 왁스 입히기
  if (wr) wr.addEventListener('click', ()=>{ Wax.reset(); wr.blur(); });
  const featured = FEATURED ? LIST.find((x)=> x.id === FEATURED) : null;
  if (featured){                                    // 시작하자마자 이 말랑이를 보여주고, 아래에 가로 목록을 둔다
    document.body.classList.add('featured');
    buildStrip(openMalangi);
    openMalangi(featured);
  }
  loadThree();                                      // 홈 화면에서 미리 받아 둠
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
