import { test, eq, ok } from './t.js';
import { findBounds, loudnessGain, applyFades, pressStrength, panFor, hitShape } from '../js/audio-prep.js';

const SR = 1000;                                       // 테스트용: 1샘플 = 1ms
function sig(parts){ const a = []; for (const [n, v] of parts) for (let i=0;i<n;i++) a.push(v*(i%2?1:-1)); return new Float32Array(a); }

test('앞뒤 무음 경계 찾기', ()=>{
  const d = sig([[130, 0.001], [300, 0.5], [200, 0.0005]]);
  const b = findBounds([d], SR, { padMs: 0, tailMs: 0 });
  eq([b.start, b.end], [130, 430]);
});
test('경계에 여유를 둔다 (앞 3ms, 뒤 30ms)', ()=>{
  const d = sig([[130, 0], [300, 0.5], [200, 0]]);
  const b = findBounds([d], SR);
  eq([b.start, b.end], [127, 460]);
});
test('앞 무음은 최대 250ms 까지만 자른다', ()=>{
  const d = sig([[600, 0], [100, 0.5]]);
  eq(findBounds([d], SR).start, 250);
});
test('스테레오: 어느 한쪽이라도 소리가 나면 소리로 본다', ()=>{
  const l = sig([[100, 0], [50, 0.5], [50, 0]]), r = sig([[60, 0], [140, 0.5]]);
  const b = findBounds([l, r], SR, { padMs: 0, tailMs: 0 });
  eq([b.start, b.end], [60, 200]);
});
test('전부 무음이면 자르지 않는다', ()=>{
  const d = new Float32Array(100);
  eq(findBounds([d], SR), { start: 0, end: 100 });
});
test('작은 소리는 키우고 큰 소리는 줄여 목표 크기로', ()=>{
  const quiet = sig([[1000, 0.01]]), loud = sig([[1000, 0.5]]);
  const gq = loudnessGain([quiet], 0, 1000, SR), gl = loudnessGain([loud], 0, 1000, SR);
  ok(gq > 1 && gl < 1, gq + ' ' + gl);
  ok(Math.abs(20*Math.log10(0.5*gl) - (-20)) < 0.1, 'loud → -20dB');
});
test('키워도 최대 크기(-1dB)를 넘지 않는다', ()=>{
  const spiky = new Float32Array(1000); spiky[10] = 0.9; for (let i=100;i<1000;i++) spiky[i] = 0.003*(i%2?1:-1);
  const g = loudnessGain([spiky], 0, 1000, SR);
  ok(0.9*g <= Math.pow(10, -1/20) + 1e-6, 'peak ' + 0.9*g);
});
test('키우는 배율은 최대 8배', ()=>{
  eq(loudnessGain([sig([[1000, 0.0001]])], 0, 1000, SR), 8);
});
test('끝을 부드럽게: 처음과 마지막 샘플이 0 으로', ()=>{
  const d = new Float32Array(100).fill(1);
  applyFades(d, SR, 2, 15);
  eq([d[0], d[99], d[50]], [0, 0, 1]);
  ok(d[90] > 0 && d[90] < 1);
});
test('누르는 세기: 펜/터치 압력이 있으면 그 값', ()=>{
  eq(pressStrength({ pointerType:'pen', pressure:0.9 }), 0.9);
  eq(pressStrength({ pointerType:'touch', pressure:0.2 }), 0.4);       // 최소 0.4
});
test('누르는 세기: 마우스나 압력 없는 터치는 기본 0.85', ()=>{
  eq(pressStrength({ pointerType:'mouse', pressure:0.5 }), 0.85);
  eq(pressStrength({ pointerType:'touch', pressure:0 }), 0.85);
  eq(pressStrength({ pointerType:'touch', pressure:0.5 }), 0.85);     // 0.5 = 압력을 모르는 기기의 기본값
});
test('좌우 방향: 가운데 0, 끝은 ±0.5', ()=>{
  const r = { left: 100, width: 400 };
  eq([panFor(300, r), panFor(100, r), panFor(500, r), panFor(900, r)], [0, -0.5, 0.5, 0.5]);
});
test('세게 누르면 크고 낮게, 살살 누르면 작고 높고 부드럽게', ()=>{
  const hard = hitShape(1, 0.5), soft = hitShape(0.4, 0.5);
  ok(hard.gain > soft.gain && hard.rate < soft.rate && hard.cutoff > soft.cutoff, JSON.stringify([hard, soft]));
});
test('매번 조금씩 다르게: 같은 세기도 rand 에 따라 음높이·밝기가 달라진다', ()=>{
  const a = hitShape(0.8, 0), b = hitShape(0.8, 1);
  ok(a.rate !== b.rate && a.cutoff !== b.cutoff);
  ok(Math.abs(a.rate - b.rate) <= 0.13, 'rate spread');
});

test('크기는 가장 큰 50ms 구간 기준 (짧게 "탁" 하는 소리가 꼬리 때문에 작게 계산되지 않게)', ()=>{
  const hit = sig([[50, 0.2], [950, 0.002]]);           // 50ms 크게 + 긴 조용한 꼬리
  const g = loudnessGain([hit], 0, 1000, SR);
  ok(Math.abs(20*Math.log10(0.2*g) - (-20)) < 0.5, 'window → -20dB, got ' + (20*Math.log10(0.2*g)).toFixed(1));
});
