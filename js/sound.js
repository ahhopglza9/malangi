import { DEFAULT_SOUNDS } from './config.js';

// 같은 key 는 한 번만 불러온다 (실패하면 지워서 다음에 다시 시도)
export function createOnceCache(load){
  const m = new Map();
  return (key)=>{
    if (!m.has(key)) m.set(key, load(key).catch((e)=>{ m.delete(key); throw e; }));
    return m.get(key);
  };
}

// ---------- 소리 (파일이 있으면 파일, 없으면 기본 합성음) ----------
export const Sound = (function(){
  let ctx = null, master = null, noiseBuf = null, bufs = {}, vol = 1, sqInt = 0, token = 0, rub = null, grip = null;
  let level = 1, muted = false;                                   // 전체 볼륨 0~1 / 음소거 (브라우저에 기억)
  const defaultsGlobal = !!DEFAULT_SOUNDS;   // 전체 기본값: 기본(합성) 효과음 사용 여부 — 기본은 꺼짐
  let defaults = defaultsGlobal;                                  // 지금 열려 있는 말랑이의 기본 효과음 사용 여부 (말랑이별 defaultSounds 가 있으면 그 값)
  try {
    const v = parseFloat(localStorage.getItem('malangi_volume'));
    if (!isNaN(v)) level = Math.min(1, Math.max(0, v));
    muted = localStorage.getItem('malangi_muted') === '1';
  } catch(e){}
  function savePrefs(){ try { localStorage.setItem('malangi_volume', String(level)); localStorage.setItem('malangi_muted', muted ? '1' : '0'); } catch(e){} }
  function masterGain(){ return muted ? 0 : level*level; }        // 제곱: 슬라이더가 귀에 자연스럽게 느껴지도록
  function applyMaster(){ if (ctx && master) master.gain.setTargetAtTime(masterGain(), ctx.currentTime, 0.02); }

  function ensure(){
    if (!ctx){
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = masterGain(); master.connect(ctx.destination);   // 모든 소리는 여기를 지난다
        const len = ctx.sampleRate;
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i=0;i<len;i++) d[i] = Math.random()*2-1;
      } catch(e){ ctx = null; master = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
  function decode(ab){
    return new Promise((res, rej)=>{ const p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); });
  }
  const getBuffer = createOnceCache(async (src)=> decode(await (await fetch(src)).arrayBuffer()));
  // 말랑이를 열 때 그 말랑이의 효과음 파일을 미리 읽어 둔다
  async function load(m){
    const my = ++token; bufs = {}; vol = 1;
    defaults = m.defaultSounds != null ? !!m.defaultSounds : defaultsGlobal;   // 이 말랑이에 defaultSounds 가 있으면 그 값, 없으면 전체 기본값
    ensure();
    if (!ctx || !m.sfx) return;
    vol = m.sfx.volume == null ? 1 : m.sfx.volume;
    sqInt = m.sfx.squeezeInterval > 0 ? m.sfx.squeezeInterval : 0;
    for (const key of ['press', 'release', 'rub', 'squeeze', 'crack']){
      const src = m.sfx[key] || '';
      if (!src) continue;
      try {
        const buf = await getBuffer(src);                           // 같은 파일은 한 번만 받아 디코드
        if (my === token) bufs[key] = buf;
      } catch(e){ console.warn('[말랑이] 효과음을 못 읽어서 기본 효과음으로 대체해요:', m.id, key, e); }
    }
  }
  function playSample(buf, gain, rate){
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(g).connect(master); src.start();
  }
  function synthThud(kind, p){
    const now = ctx.currentTime;
    const dur = kind==='press' ? 0.22 : 0.13;
    const baseFreq = kind==='press' ? (95+Math.random()*20) : (260+Math.random()*60);
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq*1.6, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq, now+dur*0.5);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.001, now);
    og.gain.exponentialRampToValueAtTime((kind==='press'?0.35:0.22)*p, now+0.01);
    og.gain.exponentialRampToValueAtTime(0.0008, now+dur);
    osc.connect(og).connect(master);
    osc.start(now); osc.stop(now+dur+0.02);

    const noise = ctx.createBufferSource(); noise.buffer = noiseBuf;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass';
    filt.frequency.value = kind==='press' ? (700+Math.random()*300) : (1400+Math.random()*500);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.001, now);
    ng.gain.exponentialRampToValueAtTime((kind==='press'?0.18:0.1)*p, now+0.008);
    ng.gain.exponentialRampToValueAtTime(0.0006, now+dur*0.85);
    noise.connect(filt).connect(ng).connect(master);
    noise.start(now); noise.stop(now+dur);
  }
  function hit(kind, power){
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const p = power == null ? 1 : power;
    if (bufs[kind]) playSample(bufs[kind], vol*p, 0.94 + Math.random()*0.12);
    else if (defaults) synthThud(kind, p);
  }
  // 문지르는 동안 계속 나는 소리 (파일 rub 이 있으면 반복 재생, 없으면 노이즈)
  function startRub(){
    if (!ctx || rub || (!bufs.rub && !defaults)) return;                // 소리 파일이 없으면(기본 효과음이 꺼져 있을 때) 아무 소리도 내지 않는다
    const g = ctx.createGain(); g.gain.value = 0.0001;
    if (bufs.rub){
      const src = ctx.createBufferSource(); src.buffer = bufs.rub; src.loop = true;
      src.connect(g).connect(master); src.start();
      rub = { src, g, sample:true };
    } else {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.7;
      src.connect(f).connect(g).connect(master); src.start();
      rub = { src, g, f, sample:false };
    }
  }
  function updateRub(deform, speed){
    if (!rub) return;
    const now = ctx.currentTime;
    if (rub.sample){
      rub.g.gain.setTargetAtTime(Math.min(0.9, (0.05 + deform*0.35 + speed*0.0004))*vol, now, 0.04);
      rub.src.playbackRate.setTargetAtTime(0.9 + Math.min(1,deform)*0.25 + Math.min(speed,1500)*0.00008, now, 0.08);
    } else {
      rub.g.gain.setTargetAtTime(Math.min(0.07, 0.02 + deform*0.15 + speed*0.00012), now, 0.03);
      rub.f.frequency.setTargetAtTime(Math.min(2200, 350 + deform*900 + speed*0.6), now, 0.05);
    }
  }
  function stopRub(){
    if (!rub) return;
    const r = rub; rub = null;
    r.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
    setTimeout(()=>{ try{ r.src.stop(); }catch(e){} }, 220);
  }
  // 꽉 쥐는 동안 계속 나는 소리 (파일 squeeze 가 있으면 반복 재생, 없으면 고무 짜는 소리를 합성)
  function gripStart(){
    if (!ctx || grip) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (!bufs.squeeze && !defaults) return;                        // squeeze 소리 파일이 없으면(기본 효과음이 꺼져 있을 때) 조용히
    if (defaults) synthThud('press', 0.55);                        // 움켜쥐는 순간의 "꾹"
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(master);
    if (bufs.squeeze && sqInt > 0){
      grip = { g, sample:true, shots:true, next:0 };                 // 파일을 정해 둔 간격마다 한 번씩 재생
    } else if (bufs.squeeze){
      const src = ctx.createBufferSource(); src.buffer = bufs.squeeze; src.loop = true;
      src.connect(g); src.start();
      grip = { g, src, sample:true };
    } else {
      // 고무가 짜이는 "끼익": 좁은 대역 노이즈(떨림) + 낮게 웅웅거리는 삼각파. 세게 쥘수록 음이 올라간다
      const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 7;
      const boost = ctx.createGain(); boost.gain.value = 4;
      const am = ctx.createGain(); am.gain.value = 0.7;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 6.5;
      const lg = ctx.createGain(); lg.gain.value = 0.3;
      lfo.connect(lg); lg.connect(am.gain);
      n.connect(f); f.connect(boost); boost.connect(am); am.connect(g);
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 62;
      const og = ctx.createGain(); og.gain.value = 0.12;
      o.connect(og); og.connect(g);
      n.start(); lfo.start(); o.start();
      grip = { g, f, o, n, lfo, sample:false };
    }
  }
  function gripUpdate(lv){
    if (!grip) return;
    const now = ctx.currentTime;
    if (grip.shots){                                                 // 간격 재생: 세게 쥘수록 간격이 조금 더 짧아지고 소리가 커진다
      if (now >= grip.next){
        playSample(bufs.squeeze, Math.min(1, 0.5 + 0.5*lv)*vol, 0.94 + Math.random()*0.12 + lv*0.08);
        grip.next = now + sqInt*(1.25 - 0.5*lv);
      }
      return;
    }
    if (grip.sample){
      grip.g.gain.setTargetAtTime(Math.min(1, 0.05 + lv*0.95)*vol, now, 0.05);
      grip.src.playbackRate.setTargetAtTime(0.9 + lv*0.25, now, 0.08);
    } else {
      grip.g.gain.setTargetAtTime(Math.min(0.22, 0.01 + lv*0.2), now, 0.05);
      grip.f.frequency.setTargetAtTime(380 + lv*720, now, 0.08);
      grip.o.frequency.setTargetAtTime(62 + lv*70, now, 0.1);
    }
  }
  function gripStop(){
    if (!grip) return;
    const r = grip; grip = null;
    r.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06);
    setTimeout(()=>{ try{ (r.src || r.n).stop(); if (r.lfo) r.lfo.stop(); if (r.o) r.o.stop(); }catch(e){} }, 260);
    if (defaults) synthThud('release', 0.6);                       // 놓을 때 "퐁"
  }
  // 왁스가 깨지는 "바삭" (파일 crack 이 있으면 파일, 없으면 짧은 파열음을 여러 번 합성)
  function crackSynth(p){
    const t0 = ctx.currentTime, n = 2 + Math.floor(Math.random()*3);
    for (let k=0;k<n;k++){
      const t = t0 + k*(0.010 + Math.random()*0.028);
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = 0.8 + Math.random()*0.8;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500 + Math.random()*2500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime((0.35 + Math.random()*0.3)*p, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.03 + Math.random()*0.03);
      src.connect(hp).connect(g).connect(master); src.start(t, Math.random()*0.5); src.stop(t + 0.09);
    }
    const o = ctx.createOscillator(); o.type = 'sine';                       // 낮은 "딱" 울림
    o.frequency.setValueAtTime(380, t0); o.frequency.exponentialRampToValueAtTime(140, t0 + 0.05);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.22*p, t0 + 0.004); og.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.06);
    o.connect(og).connect(master); o.start(t0); o.stop(t0 + 0.08);
  }
  function crack(p){
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    p = p == null ? 1 : p;
    if (bufs.crack) playSample(bufs.crack, vol*p, 0.92 + Math.random()*0.16); else if (defaults) crackSynth(p);
  }
  function tick(){                                                            // 금이 가기 시작할 때의 작은 "딱"
    if (!ctx || bufs.crack || !defaults) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = 1.2;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.025);
    src.connect(hp).connect(g).connect(master); src.start(t, Math.random()*0.5); src.stop(t + 0.05);
  }    
  
  // 볼륨 · 음소거
  function setVolume(v){ level = Math.min(1, Math.max(0, v)); if (level > 0) muted = false; savePrefs(); applyMaster(); }
  function setMuted(m){ muted = !!m; savePrefs(); applyMaster(); }
  function preview(){                                              // 슬라이더를 놓았을 때 확인용 소리: 이 말랑이의 press 소리 (없으면 기본 효과음을 켰을 때만)
    ensure();
    if (!ctx || muted || level <= 0) return;
    if (bufs.press) playSample(bufs.press, vol*0.8, 1);
    else if (defaults) synthThud('release', 0.8);
  }
  return {
    ensure, load, press:(p)=>hit('press',p), release:()=>hit('release'), startRub, updateRub, stopRub,
    gripStart, gripUpdate, gripStop, crack, tick, setVolume, setMuted, preview,
    getVolume:()=>level, isMuted:()=>muted
  };
})();
