import { test, eq, ok } from './t.js';
import { SquishCore } from '../js/core/squish.js';
import { WaxSim } from '../js/core/wax-sim.js';
import { SHADER_SRC, CORE_SRC, SHARD_SRC } from '../js/render/shaders.js';
import { buildSilhouette, makeMask } from '../js/image/silhouette.js';
import { solidImage, waxThumb } from '../js/image/texture.js';

test('돔 기본 격자 = 원본(96×54)', ()=>{
  SquishCore.setDensity(1);
  const b = SquishCore.create();
  eq(SquishCore.grid(), { S:96, L:54, NV:2+54*96 });
  eq(b.NV, 2+54*96);
});
test('밀도 0.5 → 정점 약 절반', ()=>{
  SquishCore.setDensity(0.5);
  const n = SquishCore.create().NV;
  SquishCore.setDensity(1);
  ok(n > 5186*0.4 && n < 5186*0.6, 'NV=' + n);
});
test('누르면 움직이고, 놓으면 잠든다', ()=>{
  const b = SquishCore.create();
  const c = { ax:0, ay:1, az:0, dx:0, dy:-1, dz:0, r:0.44, h:0.3, depthScale:1, lx:0, ly:0, lz:0 };
  ok(b.step(1/60, [c], 0, 0).active);
  let r; for (let i=0;i<600;i++) r = b.step(1/60, [], 0, i/60);
  eq(r.active, false);
});
test('왁스 조각 48개, 전부 때리면 깨진다', ()=>{
  const s = WaxSim.create(); s.reset(1.25);
  eq(s.N, 48);
  s.hitAll(2); const r = s.step(1/60);
  eq(r.brokeNow, 48); eq(s.nBroken(), 48);
});
test('셰이더 소스 존재', ()=>{
  for (const S of [SHADER_SRC, CORE_SRC, SHARD_SRC]) ok(S.vertex.length > 50 && S.fragment.length > 50);
});
test('실루엣: 원 그림 → 몸통 생성', ()=>{
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#f00'; g.beginPath(); g.arc(64, 64, 50, 0, 7); g.fill();
  c.naturalWidth = 128; c.naturalHeight = 128;
  const geo = buildSilhouette(makeMask(c, {}), {});
  ok(geo.rest.length > 300 && geo.index.length > 300);
});
test('왁스 이미지 도우미', ()=>{
  eq(solidImage('#ff0000').naturalWidth, 32);
  ok(waxThumb({ color:'#f3ead7' }).startsWith('data:image/png'));
});
