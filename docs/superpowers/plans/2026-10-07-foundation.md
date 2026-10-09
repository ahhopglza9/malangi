# 1단계 기반 정리 · 성능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1.8MB 단일 `index.html` 을 빌드 없는 ES 모듈 + 실제 에셋 파일로 나누고, 지연 로딩 · 품질 단계 · 유휴 렌더 절약 · 매일 초기화 카운터를 넣는다. 보이는 모습은 그대로.

**Architecture:** 원본 코드(커밋 `5344849` 의 `index.html`)를 역할별 파일로 **옮기기만** 한다. 서로 부르는 모듈은 `js/main.js` 가 콜백으로 잇는다(순환 import 금지). 새 로직(오늘 카운터, 품질 단계, 소리 캐시)은 순수 함수로 따로 두고 브라우저 테스트 페이지로 TDD 한다. 원본과 새 버전을 iframe 두 개로 띄워 픽셀을 비교하는 패리티 페이지로 "똑같이 보임"을 검증한다.

**Tech Stack:** 순수 HTML/CSS/JS(ES modules), Three.js r128(CDN, `window.THREE`), Web Audio, 로컬 확인용 `python -m http.server`, 에셋 추출용 Python 3 + Pillow(설치돼 있음, 12.3.0).

**Spec:** `docs/superpowers/specs/2026-10-07-foundation-design.md`

## Global Constraints

- 빌드 도구 없음: npm / 번들러 / `package.json` 금지. 파일을 고치면 그대로 동작해야 한다.
- Three.js 는 r128 그대로, `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` → `https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js` 순서로 동적 로드(`window.THREE`).
- 원본 로직 변경 금지. 허용된 동작 변화는 스펙의 4개뿐: 오늘 카운터 매일 초기화 / 유휴 시 ≈20fps 렌더 / 품질 단계 자동 하향 / 만두 PNG→WebP.
- 순환 import 금지.
- `localStorage` 접근은 전부 try/catch.
- 오늘 카운터 저장 키: `malangi_today_<id>` = `{"d":"YYYY-MM-DD","n":<정수>}`, 날짜는 기기 로컬 날짜. 예전 키 `malangi_count_<id>` / `malangi_count` 는 읽지 않는다. 크레딧 키 `malangi_credits` 는 그대로 누적.
- 품질 단계: 높음 `pixelRatio=min(dpr,2)`·밀도 1 / 보통 `min(dpr,1.5)`·0.7 / 낮음 `1`·0.5. 시작: 터치+작은 화면이고 `hardwareConcurrency<=4` 또는 `deviceMemory<=4` 이면 보통, 아니면 높음. 만지는 동안 최근 2초 평균 프레임 시간 > 25ms 이면 한 단계 하향, 상향 없음. `?q=low|mid|high` 면 고정.
- 유휴 렌더: 움직임이 없으면 마지막 렌더 후 50ms 이상 지났을 때만 렌더.
- 화면 문구(한국어)와 config 주석 스타일 유지. 코드 주석은 원본처럼 한국어.
- 원본 코드는 언제든 `git show 5344849:index.html` 로 본다. 아래 "원본 N–M행" 은 모두 그 파일 기준.

## Review Focus

1. 앱을 켜 둔 채 자정이 지남 → 다음 터치는 1부터 센다 (Task 5 테스트 `crosses midnight`).
2. `localStorage` 가 막힘(사파리 사생활 보호 모드 등, getItem/setItem 이 throw) → 앱은 정상, 카운터 0부터 (Task 5 `storage throws`).
3. 저장값이 깨졌거나 예전 형식(숫자 문자열 `"12"`) → 0 으로 취급, 오류 없음 (Task 5 `corrupt value`).
4. 같은 소리 경로를 여러 동작에 쓰거나 말랑이를 다시 열 때 → 파일을 한 번만 받아 디코드 (Task 6 `once cache`).
5. 탭을 갔다 와서 생긴 거대한 프레임 간격 / 이상한 `?q=` 값 → 품질이 괜히 내려가지 않음 (Task 7 `ignores huge gaps`, `bad q ignored`).

---

## 파일 구조 (최종)

```
index.html              화면 뼈대만 + style.css + js/main.js(module) + 부팅 실패 안내
style.css               원본 7–112행 <style> 안쪽 그대로
js/config.js            원본 140–315행 (설정) + export, 경로 방식으로
js/main.js              시작점: openMalangi, init(원본 2309–2402행 재구성), 모듈 연결
js/dom.js               $, showMsg, haptic
js/today.js             오늘 카운터 (새, 순수)
js/quality.js           품질 단계 (새, 순수)
js/ui.js                LIST 정규화, 홈 카드, 아래 목록, 카운터·크레딧 표시
js/loader.js            Three.js 로드, 이미지 로드/캐시
js/sound.js             Sound + createOnceCache
js/wax.js               Wax (Three.js 연결부)
js/scene.js             3D 장면, applyMalangi, 프레임 루프, 포인터 입력, 꽉 쥐기
js/core/squish.js       SquishCore (원본 328–745행)
js/core/wax-sim.js      WaxSim (원본 1791–1846행 부근, `const WaxSim = (function(){` ~ `})();`)
js/render/shaders.js    SHADER_SRC, CORE_SRC, SHARD_SRC (원본 747–970행)
js/render/uniforms.js   U, uCam, uTime (원본 1956–1960행)
js/image/texture.js     detectBody, prepareTexCanvas (원본 971–1042행) + solidImage, waxThumb (원본 Wax 안 1932–1947행)
js/image/silhouette.js  morph … buildSilhouette (원본 1043–1374행)
assets/img/*.webp|jpg   사진·썸네일
assets/sfx/*.mp3        효과음 (중복 제거)
tests/index.html        브라우저 테스트 러너
tests/t.js              초소형 assert 라이브러리
tests/*.test.js         단위 테스트
tests/parity.html       원본 vs 새 버전 픽셀 비교
tools/extract_assets.py base64 → 파일 (1회용이지만 재현용으로 보관)
.gitignore              _baseline.html, .claude/
```

---

### Task 1: 테스트 러너 · 로컬 서버 · 원본 기준본

**Files:**
- Create: `tests/t.js`, `tests/index.html`, `tests/smoke.test.js`, `.gitignore`, `.claude/launch.json`
- Create (gitignored): `_baseline.html`

**Interfaces:**
- Produces: `tests/t.js` 의 `test(name, fn)`, `eq(actual, expected, msg?)`, `ok(cond, msg?)`, `run()` — 결과를 `#out` 에 `PASS n / FAIL m` 과 실패 목록으로 출력하고 `window.__testResult = { pass, fail }` 를 설정. 로컬 서버 `http://localhost:8765/`.

- [ ] **Step 1: `.gitignore` 작성**

```
_baseline.html
.claude/
```

- [ ] **Step 2: 로컬 서버 설정 `.claude/launch.json`**

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "malangi", "runtimeExecutable": "python", "runtimeArgs": ["-m", "http.server", "8765"], "port": 8765 }
  ]
}
```

- [ ] **Step 3: 원본 기준본 만들기**

```bash
git show 5344849:index.html > _baseline.html
```
`_baseline.html` 은 치킨 사진을 `chicken.webp` 로 부르므로, Task 2 에서 파일을 옮긴 뒤에도 기준본이 동작하도록 Task 2 Step 4 에서 루트에 사본을 남기지 않고 대신 기준본 안의 경로를 바꾼다(그 단계 참조).

- [ ] **Step 4: `tests/t.js`**

```js
// 초소형 테스트 도구 — 빌드 없이 브라우저에서 바로 돌아간다
const cases = [];
export function test(name, fn){ cases.push({ name, fn }); }
export function ok(cond, msg){ if (!cond) throw new Error(msg || 'ok 실패'); }
export function eq(a, b, msg){
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg ? msg + ': ' : '') + sa + ' !== ' + sb);
}
export async function run(){
  let pass = 0, fail = 0; const lines = [];
  for (const c of cases){
    try { await c.fn(); pass++; }
    catch(e){ fail++; lines.push('✗ ' + c.name + ' — ' + e.message); console.error(c.name, e); }
  }
  const out = document.getElementById('out');
  out.textContent = 'PASS ' + pass + ' / FAIL ' + fail + (lines.length ? '\n' + lines.join('\n') : '');
  window.__testResult = { pass, fail };
}
```

- [ ] **Step 5: `tests/index.html`** (테스트 파일은 여기 import 목록에 추가해 나간다)

```html
<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>말랑이 테스트</title>
<style>body{font:14px/1.5 sans-serif;padding:16px;white-space:pre-wrap}</style></head>
<body><div id="out">실행 중…</div>
<script type="module">
  import { run } from './t.js';
  import './smoke.test.js';
  run();
</script></body></html>
```

- [ ] **Step 6: `tests/smoke.test.js`**

```js
import { test, eq } from './t.js';
test('러너 동작', ()=> eq(1 + 1, 2));
```

- [ ] **Step 7: 실행 확인**

`preview_start` name `malangi` → `http://localhost:8765/tests/` 를 열고 `get_page_text`.
Expected: `PASS 1 / FAIL 0`. 그리고 `http://localhost:8765/_baseline.html` 에서 만두가 뜨는지 확인(콘솔 오류 0).

- [ ] **Step 8: Commit**

```bash
git add .gitignore tests/t.js tests/index.html tests/smoke.test.js
git commit -m "Add browser test runner"
```

---

### Task 2: 에셋을 실제 파일로 풀기 (중복 제거 · 미사용 삭제 · 썸네일)

**Files:**
- Create: `tools/extract_assets.py`, `assets/img/*`, `assets/sfx/*`
- Move: `chicken.webp` → `assets/img/chicken.webp`, `chicken_thumb.webp` → `assets/img/chicken_thumb.webp`
- Modify (gitignored): `_baseline.html` (치킨 경로)

**Interfaces:**
- Produces: 아래 경로들 (Task 4 의 config 가 사용)
  - `assets/img/`: `mandu.webp`, `mandu_thumb.webp`, `butter.webp`, `butter_thumb.webp`, `gun.webp`, `gun_thumb.webp`, `bolt.webp`, `bolt_back.jpg`, `bolt_thumb.webp`, `bubble.webp`, `bubble_thumb.webp`, `galaxy.webp`, `galaxy_thumb.webp`, `snow.webp`, `snow_thumb.webp`, `chicken.webp`, `chicken_thumb.webp`
  - `assets/sfx/`: `butter.mp3`, `bubble.mp3`, `gun.mp3`, `bolt.mp3`, `galaxy.mp3`, `galaxy_release.mp3`, `snow.mp3`, `chicken.mp3`, `wax_crack.mp3`

- [ ] **Step 1: `tools/extract_assets.py` 작성**

```python
"""원본 index.html(커밋 5344849)의 ASSETS base64 를 실제 파일로 푼다.
같은 내용의 효과음은 한 파일로, 쓰지 않는 사진(gun, gun_back, gun2, bolt, bolt_back)은 버린다.
만두 PNG 는 WebP 로 바꾸고 160px 썸네일도 만든다.  실행: python tools/extract_assets.py"""
import base64, hashlib, io, re, subprocess
from pathlib import Path
from PIL import Image

SRC = subprocess.run(['git', 'show', '5344849:index.html'], capture_output=True, check=True).stdout.decode('utf-8')
block = SRC[SRC.index('const ASSETS = {'):]
items = dict(re.findall(r'(\w+): "data:[^;]+;base64,([A-Za-z0-9+/=]+)"', block))

# 원본 키 → 새 파일 (None = 버림). 같은 파일로 가는 키들은 내용이 같아야 한다.
OUT = {
  'mandu': 'img/mandu.png',  # 아래에서 webp 로 변환 후 png 삭제
  'gun': None, 'gun_back': None, 'gun2': None, 'bolt': None, 'bolt_back': None,
  'gun3': 'img/gun.webp', 'bolt2': 'img/bolt.webp', 'bolt2_back': 'img/bolt_back.jpg',
  'bubble': 'img/bubble.webp', 'bubble_thumb': 'img/bubble_thumb.webp',
  'galaxy': 'img/galaxy.webp', 'snow': 'img/snow.webp', 'snow_thumb': 'img/snow_thumb.webp',
  'butter': 'img/butter.webp', 'butter_thumb': 'img/butter_thumb.webp',
  'gun_press': 'sfx/gun.mp3', 'gun_squeeze': 'sfx/gun.mp3',
  'bolt_press': 'sfx/bolt.mp3', 'bolt_squeeze': 'sfx/bolt.mp3',
  'bubble_press': 'sfx/bubble.mp3', 'bubble_rub': 'sfx/bubble.mp3', 'bubble_squeeze': 'sfx/bubble.mp3',
  'galaxy_press': 'sfx/galaxy.mp3', 'galaxy_squeeze': 'sfx/galaxy.mp3', 'galaxy_release': 'sfx/galaxy_release.mp3',
  'snow_press': 'sfx/snow.mp3', 'snow_squeeze': 'sfx/snow.mp3',
  'butter_press': 'sfx/butter.mp3', 'butter_rub': 'sfx/butter.mp3', 'butter_squeeze': 'sfx/butter.mp3',
  'wax_crack': 'sfx/wax_crack.mp3',
  'chicken_press': 'sfx/chicken.mp3', 'chicken_squeeze': 'sfx/chicken.mp3',
}
assert set(items) == set(OUT), f'키 불일치: {set(items) ^ set(OUT)}'

root = Path('assets'); written = {}
for key, rel in OUT.items():
    if rel is None: continue
    data = base64.b64decode(items[key])
    h = hashlib.md5(data).hexdigest()
    if rel in written:
        assert written[rel] == h, f'{key}: {rel} 에 내용이 다른 파일이 겹침'
        continue
    p = root / rel; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(data); written[rel] = h

png = root / 'img/mandu.png'
im = Image.open(png); im.load()
im.save(root / 'img/mandu.webp', 'WEBP', quality=92, method=6)
t = im.copy(); t.thumbnail((160, 160), Image.LANCZOS); t.save(root / 'img/mandu_thumb.webp', 'WEBP', quality=90, method=6)
png.unlink()
for rel in sorted(written): print(rel, (root / rel).stat().st_size if (root / rel).exists() else '-')
print('mandu.webp', (root / 'img/mandu.webp').stat().st_size)
```

- [ ] **Step 2: 실행**

```bash
python tools/extract_assets.py
```
Expected: 오류 없이 파일 목록 출력. `assets/sfx/` 에 mp3 9개, `assets/img/` 에 mandu.webp·mandu_thumb.webp 포함. `assert` 가 하나라도 터지면 멈추고 원인(키 이름/중복 내용)을 확인한다.

- [ ] **Step 3: 만두 WebP 품질 눈으로 확인**

`Read` 도구로 `assets/img/mandu.webp` 를 열어 원본(`_baseline.html` 의 만두)과 비교. 눈에 띄는 뭉개짐/테두리 깨짐이 있으면 `quality=95` 로 올려 다시 실행.

- [ ] **Step 4: 치킨 파일 옮기기 + 기준본 경로 수정**

```bash
git mv chicken.webp assets/img/chicken.webp
git mv chicken_thumb.webp assets/img/chicken_thumb.webp
sed -i "s#'chicken.webp'#'assets/img/chicken.webp'#; s#'chicken_thumb.webp'#'assets/img/chicken_thumb.webp'#" _baseline.html
```
Expected: `http://localhost:8765/_baseline.html` 에서 치킨 말랑이가 정상 로딩.

- [ ] **Step 5: 실루엣 말랑이 썸네일 (총·번개·은하계) 저장**

원본은 이 썸네일을 런타임에 만든다(`makeCutoutCanvas(img, mask, 160)`). 같은 이미지를 파일로 저장한다.
브라우저에서 `http://localhost:8765/_baseline.html` 을 열고 5초 기다린 뒤 `javascript_tool`:

```js
Object.fromEntries([...document.querySelectorAll('#grid .malangi-card img')]
  .filter(im => ['총 말랑이','번개말랑이','은하계 말랑이'].includes(im.alt))
  .map(im => [im.alt, im.src]))
```
결과(PNG data URL 3개)를 `tools/thumbs.json` 에 `{"gun": "...", "bolt": "...", "galaxy": "..."}` 형태로 저장(이 파일은 커밋하지 않고 끝나면 삭제)한 뒤:

```bash
python - <<'EOF'
import base64, io, json
from PIL import Image
for k, url in json.load(open('tools/thumbs.json')).items():
    im = Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1])))
    im.save(f'assets/img/{k}_thumb.webp', 'WEBP', quality=90, method=6)
    print(k, im.size)
EOF
rm tools/thumbs.json
```
Expected: `gun_thumb.webp`, `bolt_thumb.webp`, `galaxy_thumb.webp` 생성, 크기 최대 변 160.

- [ ] **Step 6: Commit**

```bash
git add tools/extract_assets.py assets
git commit -m "Extract embedded assets into files; dedupe sounds, drop unused images"
```

---

### Task 3: 순수 엔진 모듈 분리 (물리 · 왁스 시뮬 · 셰이더 · 이미지 처리)

이 단계에서는 새 파일만 만든다. `index.html` 은 아직 원본 그대로라 사이트는 계속 동작한다.

**Files:**
- Create: `js/core/squish.js`, `js/core/wax-sim.js`, `js/render/shaders.js`, `js/image/silhouette.js`, `js/image/texture.js`
- Create: `tests/engine.test.js`; Modify: `tests/index.html` (import 추가)

**Interfaces:**
- Produces:
  - `js/core/squish.js`: `export const SquishCore` — 원본 반환 객체 `{ create, fromGeometry, buildLathe, buildBox, restNormals, fitDome, solveLookY, DEFAULT_DOME, FLOOR_Y, MAX_DEPTH }` + 새 `setDensity(f: number)` (정점 수 배율, 1=원본). 원본 export 의 `S, L, NV` 는 빼고 `grid(): {S, L, NV}` 로 대체.
  - `js/core/wax-sim.js`: `export const WaxSim` — `{ create, N }` 그대로.
  - `js/render/shaders.js`: `export const SHADER_SRC, CORE_SRC, SHARD_SRC`.
  - `js/image/silhouette.js`: `export { morph, labelComponents, parseColor, makeMask, makeCutoutCanvas, edt, buildSilhouette }`.
  - `js/image/texture.js`: `export { detectBody, prepareTexCanvas, solidImage, waxThumb }` — `solidImage(color): HTMLCanvasElement`(원본 Wax.solidImage), `waxThumb(waxCfg): string`(원본 Wax.thumb, data URL).

- [ ] **Step 1: 실패하는 테스트 `tests/engine.test.js`**

```js
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
```
`tests/index.html` 의 import 목록에 `import './engine.test.js';` 추가.

- [ ] **Step 2: 실패 확인**

`http://localhost:8765/tests/` 새로고침 → `get_page_text`.
Expected: 모듈을 못 찾아 `실행 중…` 에서 멈추거나 콘솔에 404. (파일이 없어서 실패)

- [ ] **Step 3: `js/core/squish.js` — 원본 328–745행을 옮긴다**

원본 `const SquishCore = (function(){ … })();` 를 그대로 붙여 넣고 `export const SquishCore = …` 로 바꾼다. 그 안에서 바꿀 곳은 세 군데뿐:

```js
    // (원본) const S = 96; const L = 54; const NV = 2 + L*S;
    let S = 96;               // 경도 방향 분할 (setDensity 로 바뀜)
    let L = 54;               // 위도 링 개수 (극점 제외)
    let NV = 2 + L*S;         // 총 정점 수
    let BOX_STEP_K = 1;       // 상자 격자 간격 배율
    // 품질 단계: f = 정점 수 배율 (1 = 원본). 다음에 만드는 몸통부터 적용
    function setDensity(f){
      const k = Math.sqrt(Math.max(0.1, f || 1));
      S = Math.max(24, Math.round(96*k/4)*4);
      L = Math.max(14, Math.round(54*k));
      NV = 2 + L*S;
      BOX_STEP_K = 1/k;
    }
```
`buildBox(hx, hy, hz, r, step)` 첫 줄에 `step = step*BOX_STEP_K;` 추가.
반환 줄을 다음으로:
```js
    return { create, fromGeometry, buildLathe, buildBox, restNormals, fitDome, solveLookY, setDensity,
             grid:()=>({ S, L, NV }), DEFAULT_DOME, FLOOR_Y, MAX_DEPTH };
```
(원본 반환의 `S, L, NV` 는 밖에서 쓰이지 않음 — 확인됨.) 파일 맨 위에 원본 322–327행의 설명 주석도 같이 옮긴다.

- [ ] **Step 4: `js/core/wax-sim.js`**

원본 1786–1790행 주석 + `const WaxSim = (function(){ … return { create, N }; })();` 블록(원본 1791행 ~ `const Wax = (function(){` 바로 앞 줄)을 옮기고 `export const WaxSim` 으로.

- [ ] **Step 5: `js/render/shaders.js`**

원본 747–970행(`SHADER_SRC`, `CORE_SRC`, `SHARD_SRC` 와 주석)을 옮기고 세 상수 앞에 `export`.

- [ ] **Step 6: `js/image/silhouette.js`**

원본 1043–1374행(`morph` ~ `buildSilhouette` 끝)을 옮긴다. 맨 위에:
```js
import { SquishCore } from '../core/squish.js';
```
맨 아래에:
```js
export { morph, labelComponents, parseColor, makeMask, makeCutoutCanvas, edt, buildSilhouette };
```
`buildSilhouette` 의 기본 정점 수에 품질 배율을 걸 수 있도록, 호출하는 쪽(scene)이 `verts` 를 넘긴다(Task 7). 이 파일 안은 그대로 둔다.

- [ ] **Step 7: `js/image/texture.js`**

원본 971–1042행(`detectBody`, `prepareTexCanvas`) + 원본 Wax 안의 `solidImage`(1932–1937행)와 `thumb`(1938–1947행)을 옮긴다. `thumb` 는 이름을 `waxThumb` 로. 맨 위:
```js
import { morph } from './silhouette.js';
```
맨 아래:
```js
export { detectBody, prepareTexCanvas, solidImage, waxThumb };
```

- [ ] **Step 8: 테스트 통과 확인**

`http://localhost:8765/tests/` 새로고침 → Expected: `PASS 8 / FAIL 0` (smoke 1 + engine 7). 콘솔 오류 0.

- [ ] **Step 9: Commit**

```bash
git add js tests
git commit -m "Split pure engine code into ES modules"
```

---

### Task 4: 앱 모듈 분리 + index.html 교체 (화면 그대로)

**Files:**
- Create: `style.css`, `js/config.js`, `js/dom.js`, `js/render/uniforms.js`, `js/loader.js`, `js/sound.js`, `js/wax.js`, `js/scene.js`, `js/ui.js`, `js/main.js`, `tests/parity.html`
- Modify: `index.html` (전부 교체)

**Interfaces:**
- Consumes: Task 3 의 모듈들, Task 2 의 에셋 경로.
- Produces:
  - `js/config.js`: `export const DEFAULT_SOUNDS, FEATURED, MALANGIS`
  - `js/dom.js`: `export const $ = id => document.getElementById(id)`, `export function showMsg(text)`, `export function haptic(ms)`
  - `js/render/uniforms.js`: `export const uCam, uTime, U` (원본 1956–1960행, 단 `uSites:{ value:null }` — scene 이 `Wax.sites` 로 채움)
  - `js/loader.js`: `export function loadThree(), whenThree(cb: (ok:boolean)=>void), loadImage(m): Promise<HTMLImageElement|HTMLCanvasElement|null>, loadImageBack(m): Promise<HTMLImageElement|null>`
  - `js/sound.js`: `export const Sound` (원본 API 그대로: `ensure, load, press, release, startRub, updateRub, stopRub, gripStart, gripUpdate, gripStop, crack, tick, setVolume, setMuted, preview, getVolume, isMuted`)
  - `js/wax.js`: `export const Wax` = `{ enable, disable, reset, update, onResize, sites, softness, busy, get on }` (`busy()` 는 Task 8 에서 추가; 이 단계에서는 `()=>false`)
  - `js/scene.js`: `export function initScene({ onTouch })`, `isReady()`, `setReady(bool)`, `setActive(bool)`, `applyMalangi(m, img, imgB)`, `resetInteraction()`, `setGrip(on)`, `hasRenderer()`
    - `onTouch()` 는 원본 `bumpCount()` 를 부르던 두 곳(첫 손가락 pointerdown, setGrip(true))에서 호출된다.
  - `js/ui.js`: `export const LIST`, `export function buildHome(onOpen), buildStrip(onOpen), markStrip(m), refreshTag(m), showCredits(bump), bumpCount(m), getCount(m)`
  - `js/main.js`: 부작용만 (init 실행, `window.__malangiBooted = true`)

- [ ] **Step 1: 패리티 페이지 `tests/parity.html` 먼저 만든다**

원본과 새 버전을 같은 크기 iframe 두 개로 띄우고, 말랑이마다 아래 목록 버튼을 눌러 같은 프레임을 캡처해 픽셀 차이를 잰다. WebGL 버퍼는 합성 뒤 지워지므로 `requestAnimationFrame` 콜백 직후 같은 작업 안에서 `toDataURL` 한다.

```html
<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>말랑이 패리티</title>
<style>body{font:13px/1.5 sans-serif;padding:12px}iframe{width:520px;height:760px;border:1px solid #ccc}#out{white-space:pre}</style></head>
<body>
<div><iframe id="a" src="../_baseline.html"></iframe> <iframe id="b" src="../index.html?q=high"></iframe></div>
<div id="out">대기…</div>
<script>
const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
function hook(win){                                   // 렌더 직후 캔버스를 읽는다
  const raf = win.requestAnimationFrame.bind(win);
  win.__want = null;
  win.requestAnimationFrame = (cb)=> raf((t)=>{ cb(t); if (win.__want){
    const url = win.document.getElementById('c').toDataURL('image/png');
    if (url.length > 3000){ const w = win.__want; win.__want = null; w(url); } } });
}
const grab = (win)=> new Promise((res)=>{ win.__want = res; });
function pixels(url){ return new Promise((res)=>{ const im = new Image(); im.onload = ()=>{
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0); res(g.getImageData(0, 0, c.width, c.height)); }; im.src = url; }); }
function diff(p, q){
  if (p.width !== q.width || p.height !== q.height) return Infinity;
  let s = 0; for (let i=0;i<p.data.length;i++) s += Math.abs(p.data[i]-q.data[i]);
  return s / p.data.length;
}
async function main(){
  await sleep(6000);
  const A = document.getElementById('a').contentWindow, B = document.getElementById('b').contentWindow;
  hook(A); hook(B);
  const names = [...A.document.querySelectorAll('.strip-item')].map(b=>b.title);
  const rows = []; let worst = 0;
  for (const n of names){
    for (const W of [A, B]) [...W.document.querySelectorAll('.strip-item')].find(b=>b.title===n).click();
    await sleep(3500);                                 // 로딩 + 출렁임이 멈출 시간
    const [ua, ub] = await Promise.all([grab(A), grab(B)]);
    const d = diff(await pixels(ua), await pixels(ub));
    worst = Math.max(worst, d); rows.push(n.padEnd(10) + ' 평균 차이 ' + d.toFixed(2));
  }
  document.getElementById('out').textContent = rows.join('\n') + '\n최대 ' + worst.toFixed(2);
  window.__parity = { worst, rows };
}
main();
</script></body></html>
```
판정 기준: 각 말랑이 평균 차이 ≤ 1.5 (0~255 스케일, 만두는 WebP 변환과 뒷면 반짝이 시간차 때문에 ≤ 3.0 허용).

- [ ] **Step 2: 패리티가 지금은 실패하는지 확인**

아직 `index.html` 이 원본이므로 두 쪽이 같아야 정상 — 이 단계는 **페이지 자체 검증**이다.
`http://localhost:8765/tests/parity.html` → 약 40초 후 `get_page_text`.
Expected: 9줄 모두 평균 차이 ≤ 1.0 (같은 코드). 만약 캡처가 안 되거나 Infinity 가 나오면 페이지를 고친 뒤 다음으로.

- [ ] **Step 3: `style.css`**

원본 7–112행의 `<style>` 안쪽을 그대로 옮긴다(태그 제외).

- [ ] **Step 4: `js/config.js`**

원본 140–315행(주석 + `DEFAULT_SOUNDS` + `FEATURED` + `MALANGIS`)을 옮기고 세 상수 앞에 `export`. 다음을 바꾼다.

1) 맨 위 설명 주석에서 `img` 설명을 다음으로 교체하고, 맨 아래 "③ 에셋 / base64" 관련 문구와 `'asset:키'` 설명을 모두 경로 방식으로 고친다:
```
 *  │ img    : 사진 파일 경로. 예) 'assets/img/peach.webp'  (https 주소도 OK)
 *  │          → 사진은 assets/img/ 폴더에, 소리는 assets/sfx/ 폴더에 올려 주세요
```
추가 예시(peach)도 `img: 'assets/img/peach.webp'`, `sfx: { press: 'assets/sfx/peach_press.mp3', … }` 로.

2) `MALANGIS` 의 에셋 값을 다음 표대로 교체 (나머지 값·주석은 그대로):

| id | 바꿀 값 |
|---|---|
| mandu | `img: 'assets/img/mandu.webp'`, `thumb: 'assets/img/mandu_thumb.webp'` 추가 |
| butter | `img: 'assets/img/butter.webp'`, `thumb: 'assets/img/butter_thumb.webp'`, `sfx: { press: 'assets/sfx/butter.mp3', rub: 'assets/sfx/butter.mp3', squeeze: 'assets/sfx/butter.mp3', squeezeInterval: 1 }` |
| wax | `sfx: { crack: 'assets/sfx/wax_crack.mp3' }` |
| gun | `img: 'assets/img/gun.webp'`, `imgBack: 'assets/img/gun.webp'`, `thumb: 'assets/img/gun_thumb.webp'` 추가, `sfx: { press: 'assets/sfx/gun.mp3', squeeze: 'assets/sfx/gun.mp3', volume: 0.3, squeezeInterval: 0.15 }` |
| bolt | `img: 'assets/img/bolt.webp'`, `imgBack: 'assets/img/bolt_back.jpg'`, `thumb: 'assets/img/bolt_thumb.webp'` 추가, `sfx: { press: 'assets/sfx/bolt.mp3', squeeze: 'assets/sfx/bolt.mp3' }` |
| bubble | `img: 'assets/img/bubble.webp'`, `thumb: 'assets/img/bubble_thumb.webp'`, `sfx: { press: 'assets/sfx/bubble.mp3', rub: 'assets/sfx/bubble.mp3', squeeze: 'assets/sfx/bubble.mp3', volume: 1, squeezeInterval: 1 }` |
| galaxy | `img: 'assets/img/galaxy.webp'`, `imgBack: 'assets/img/galaxy.webp'`, `thumb: 'assets/img/galaxy_thumb.webp'` 추가, `sfx: { press: 'assets/sfx/galaxy.mp3', release: 'assets/sfx/galaxy_release.mp3', squeeze: 'assets/sfx/galaxy.mp3', squeezeInterval: 0.7 }` |
| snow | `img: 'assets/img/snow.webp'`, `thumb: 'assets/img/snow_thumb.webp'`, `sfx: { press: 'assets/sfx/snow.mp3', squeeze: 'assets/sfx/snow.mp3', volume: 2.5 }` |
| chicken | `img: 'assets/img/chicken.webp'`, `thumb: 'assets/img/chicken_thumb.webp'`, `sfx: { press: 'assets/sfx/chicken.mp3', squeeze: 'assets/sfx/chicken.mp3' }` |

- [ ] **Step 5: `js/dom.js`**

```js
// 화면 도우미: 요소 찾기 · 잠깐 뜨는 메시지 · 진동
export const $ = (id)=> document.getElementById(id);
let msgTimer = null;
export function showMsg(t){
  const msgEl = $('msg');
  msgEl.textContent = t; msgEl.style.opacity = '1';
  clearTimeout(msgTimer); msgTimer = setTimeout(()=>{ msgEl.style.opacity = '0'; }, 2400);
}
export function haptic(ms){ try{ if (navigator.vibrate) navigator.vibrate(ms); }catch(e){} }
```

- [ ] **Step 6: `js/render/uniforms.js`**

```js
// 셰이더 uniform (말랑이별로 값만 교체) — scene 과 wax 가 같이 쓴다
export const uCam = { value: null }, uTime = { value: 0 };
export const U = { /* 원본 1958–1959행의 키들을 그대로, 단 uSites:{ value:null } */ };
```
(`/* … */` 자리는 원본 1958–1959행 객체 내용을 그대로 붙여 넣고 `uSites:{ value:Wax.sites }` 만 `uSites:{ value:null }` 로.)

- [ ] **Step 7: `js/loader.js`**

원본 1512–1558행(Three.js 로드 + 이미지 로드)을 옮기고:
- `asset(spec)` 호출을 `spec || ''` 로 바꾼다 (경로를 그대로 씀). `asset()` 함수는 만들지 않는다.
- `if (src && src.indexOf('data:') !== 0) im.crossOrigin = 'anonymous';` 는 그대로 둔다(같은 출처라 영향 없음).
- `loadImage` 의 `Wax.solidImage(...)` → `solidImage(...)` 로, 맨 위에 `import { solidImage } from './image/texture.js';`
- 맨 아래 `export { loadThree, whenThree, loadImage, loadImageBack };`

- [ ] **Step 8: `js/sound.js`**

원본 1561–1783행(`const Sound = (function(){ … })();`)을 옮기고 `export const Sound`. 바꿀 곳:
- `typeof DEFAULT_SOUNDS !== 'undefined' && !!DEFAULT_SOUNDS` → `!!DEFAULT_SOUNDS`, 맨 위 `import { DEFAULT_SOUNDS } from './config.js';`
- `load(m)` 안 `const src = asset(m.sfx[key]);` → `const src = m.sfx[key] || '';`
(소리 캐시는 Task 6 에서.)

- [ ] **Step 9: `js/wax.js`**

원본 Wax 블록(`const Wax = (function(){` ~ `})();`, 원본 1859–1949행)을 옮기고 `export const Wax`. 맨 위:
```js
import { WaxSim } from './core/wax-sim.js';
import { CORE_SRC, SHARD_SRC } from './render/shaders.js';
import { U, uCam } from './render/uniforms.js';
import { Sound } from './sound.js';
import { $, showMsg, haptic } from './dom.js';
```
`solidImage` / `thumb` 함수 정의는 지우고(Task 3 에서 texture.js 로 감), 반환 객체를:
```js
    return { enable, disable, reset, update, onResize, busy:()=>false, get on(){ return on; }, sites:sim.sites, softness:()=>sim.softness() };
```

- [ ] **Step 10: `js/ui.js`**

원본 1381–1395행(DEFAULTS, LIST 정규화), 1401–1418(카운트), 1421–1444(크레딧, bumpCount), 1446–1451(마스크 캐시), 1453–1511(홈·아래 목록)을 옮긴다. 바꿀 곳:
- 맨 위:
```js
import { MALANGIS } from './config.js';
import { $, showMsg } from './dom.js';
import { makeMask, makeCutoutCanvas } from './image/silhouette.js';
import { waxThumb } from './image/texture.js';
import { loadImage } from './loader.js';
```
- LIST 정규화의 `(typeof MALANGIS !== 'undefined' ? MALANGIS : [])` → `MALANGIS`.
- `bumpCount()` → `bumpCount(m)` 로 인자를 받고, 안의 `current` 를 `m` 으로.
- `buildHome()` → `buildHome(onOpen)`, `btn.addEventListener('click', ()=> openMalangi(m))` → `()=> onOpen(m)`.
- `buildStrip()` → `buildStrip(onOpen)`, `if (current !== m) openMalangi(m)` → `onOpen(m)` (같은 말랑이 재클릭 무시는 main 의 openMalangi 가 처리).
- `buildHome` 의 `Wax.thumb(m.wax)` → `waxThumb(m.wax)`, `asset(m.thumb || m.img)` → `(m.thumb || m.img)`.
- 맨 아래 `export { LIST, getMask, buildHome, buildStrip, markStrip, refreshTag, showCredits, bumpCount, getCount };`
- `countEl` 은 `$('count')` 로 함수 안에서 찾는다.

- [ ] **Step 11: `js/scene.js`**

원본 1953–1968행(장면 상태 변수), 1970–2306행(그림자 텍스처 ~ 프레임 루프)을 옮긴다. 맨 위:
```js
import { SquishCore } from './core/squish.js';
import { SHADER_SRC } from './render/shaders.js';
import { U, uCam, uTime } from './render/uniforms.js';
import { detectBody, prepareTexCanvas } from './image/texture.js';
import { buildSilhouette } from './image/silhouette.js';
import { getMask } from './ui.js';
import { Wax } from './wax.js';
import { Sound } from './sound.js';
import { haptic } from './dom.js';
```
(`ui.js` 는 `scene.js` 를 import 하지 않으므로 순환 아님.)
바꿀 곳:
- 원본 1957–1960행 `const U = …` 정의는 지우고 import 한 `U` 사용. `initRenderer()` 첫머리에 `U.uSites.value = Wax.sites;` 추가.
- 상태 `let ready = false;` 옆에 `let active = false; let onTouch = ()=>{};` 추가.
- 원본에서 `bumpCount()` 를 부르던 두 곳(pointerdown 의 `if (wasEmpty){ bumpCount(); …`, setGrip 의 `if (on){ Sound.ensure(); bumpCount(); …`)을 `onTouch()` 로.
- `playScreen.classList.contains('active')` 두 곳(setGrip, frame)을 `active` 로.
- `stageEl`, `canvas` 는 모듈 맨 위에서 `document.getElementById('stage')`, `document.getElementById('c')` 로.
- 맨 아래:
```js
export function initScene(opts){ onTouch = opts.onTouch; if (!renderer) initRenderer(); }
export const hasRenderer = ()=> !!renderer;
export const isReady = ()=> ready;
export function setReady(v){ ready = v; if (v) last = performance.now(); }
export function setActive(v){ active = v; }
export { applyMalangi, resetInteraction, setGrip };
```

- [ ] **Step 12: `js/main.js`**

원본 2309–2402행(`openMalangi`, `init`)을 옮긴다.
```js
import { FEATURED } from './config.js';
import { $ } from './dom.js';
import { Sound } from './sound.js';
import { Wax } from './wax.js';
import { loadThree, whenThree, loadImage, loadImageBack } from './loader.js';
import { LIST, buildHome, buildStrip, markStrip, refreshTag, showCredits, bumpCount, getCount } from './ui.js';
import { initScene, hasRenderer, setReady, setActive, applyMalangi, resetInteraction, setGrip } from './scene.js';

window.__malangiBooted = true;
let current = null, openToken = 0;
```
바꿀 곳:
- `openMalangi(m)` 첫 줄: `if (current === m && playScreen.classList.contains('active')) return;`
- `ready = false; current = m;` → `setReady(false); current = m; setActive(true);`
- `if (renderer) resetInteraction();` → `if (hasRenderer()) resetInteraction();`
- `if (!renderer) initRenderer();` → `initScene({ onTouch: ()=> bumpCount(current) });`
- 성공 시 `last = performance.now(); ready = true;` → `setReady(true);`
- 돌아가기 버튼: `ready = false;` → `setReady(false); setActive(false);`
- `homeScreen`, `playScreen`, `nameEl`, `countEl`, `msgEl`, `loadingEl` 은 `$()` 로 맨 위에서 잡는다.
- `buildHome()` → `buildHome(openMalangi)`, `buildStrip()` → `buildStrip(openMalangi)`.
- 끝: `if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();`

- [ ] **Step 13: `index.html` 교체**

원본 1–6행(head 메타) + `<link rel="stylesheet" href="style.css">` + 원본 113–137행(body 마크업) + 부팅 실패 안내 + 모듈 스크립트:

```html
<div class="msg" id="bootFail" style="opacity:1" hidden>화면을 불러오지 못했어요. 새로고침해 주세요.</div>
<script>
  setTimeout(function(){ if (!window.__malangiBooted){ var e = document.getElementById('bootFail'); if (e) e.hidden = false; } }, 8000);
</script>
<script type="module" src="js/main.js"></script>
</body>
</html>
```
원본의 `<script id="malangi-config">`, `<script id="malangi-engine">`, `<script id="malangi-assets">` 블록은 전부 없앤다.

- [ ] **Step 14: 동작 확인**

`http://localhost:8765/` 열기 → 만두가 뜨는지, 콘솔 오류 0. 그리고 `javascript_tool` 로 9종 모두 열기:
```js
const out=[]; for (const b of document.querySelectorAll('.strip-item')){ b.click(); await new Promise(r=>setTimeout(r,2500));
  out.push(b.title+': '+(getComputedStyle(document.getElementById('loading')).display==='none'?'OK':document.getElementById('loading').textContent)); } out
```
Expected: 9줄 모두 `OK`.

- [ ] **Step 15: 패리티 확인**

`http://localhost:8765/tests/parity.html` → 40초 후 `get_page_text`.
Expected: 각 말랑이 평균 차이 ≤ 1.5 (만두 ≤ 3.0). 넘으면 해당 말랑이 두 화면을 스크린샷으로 비교해 옮기면서 빠진/바뀐 코드를 찾는다.

- [ ] **Step 16: 단위 테스트 재확인**

`http://localhost:8765/tests/` → `PASS 8 / FAIL 0`.

- [ ] **Step 17: Commit**

```bash
git add index.html style.css js tests/parity.html
git commit -m "Split app into modules and load assets from files"
```

---

### Task 5: 오늘 카운터 (매일 초기화)

**Files:**
- Create: `js/today.js`, `tests/today.test.js`
- Modify: `js/ui.js` (getCount/setCount/bumpCount), `tests/index.html`

**Interfaces:**
- Produces: `localDate(now?: Date): string` ("YYYY-MM-DD"), `readToday(storage, id, now?): number`, `writeToday(storage, id, n, now?): void`

- [ ] **Step 1: 실패하는 테스트 `tests/today.test.js`**

```js
import { test, eq } from './t.js';
import { localDate, readToday, writeToday } from '../js/today.js';

function mem(){ const m = new Map(); return { getItem:k=> m.has(k) ? m.get(k) : null, setItem:(k,v)=> m.set(k, String(v)), m }; }
const D = (s)=> new Date(s);                        // 로컬 시각

test('localDate 형식', ()=> eq(localDate(D('2026-03-05T09:00:00')), '2026-03-05'));
test('처음엔 0', ()=> eq(readToday(mem(), 'mandu', D('2026-10-07T10:00:00')), 0));
test('같은 날 이어서 센다', ()=>{
  const s = mem(); const t = D('2026-10-07T10:00:00');
  writeToday(s, 'mandu', 3, t);
  eq(readToday(s, 'mandu', D('2026-10-07T23:59:00')), 3);
  eq(s.m.get('malangi_today_mandu'), '{"d":"2026-10-07","n":3}');
});
test('crosses midnight: 다음 날이면 0', ()=>{
  const s = mem(); writeToday(s, 'mandu', 7, D('2026-10-07T23:59:00'));
  eq(readToday(s, 'mandu', D('2026-10-08T00:00:01')), 0);
});
test('말랑이별로 따로', ()=>{
  const s = mem(); const t = D('2026-10-07T10:00:00');
  writeToday(s, 'mandu', 2, t); writeToday(s, 'gun', 5, t);
  eq([readToday(s, 'mandu', t), readToday(s, 'gun', t)], [2, 5]);
});
test('storage throws: 0, 오류 없음', ()=>{
  const bad = { getItem(){ throw new Error('blocked'); }, setItem(){ throw new Error('blocked'); } };
  eq(readToday(bad, 'mandu'), 0);
  writeToday(bad, 'mandu', 1);
});
test('corrupt value: 깨진 값/예전 숫자 형식 → 0', ()=>{
  const s = mem(); const t = D('2026-10-07T10:00:00');
  s.setItem('malangi_today_mandu', '{oops'); eq(readToday(s, 'mandu', t), 0);
  s.setItem('malangi_today_mandu', '12');    eq(readToday(s, 'mandu', t), 0);
  s.setItem('malangi_today_mandu', '{"d":"2026-10-07","n":"x"}'); eq(readToday(s, 'mandu', t), 0);
});
test('예전 키는 읽지 않는다', ()=>{
  const s = mem(); s.setItem('malangi_count_mandu', '40'); s.setItem('malangi_count', '40');
  eq(readToday(s, 'mandu'), 0);
});
```
`tests/index.html` 에 `import './today.test.js';` 추가.

- [ ] **Step 2: 실패 확인** — `/tests/` → 모듈 404 로 실패.

- [ ] **Step 3: `js/today.js` 구현**

```js
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
```

- [ ] **Step 4: 통과 확인** — `/tests/` → `PASS 16 / FAIL 0`.

- [ ] **Step 5: `js/ui.js` 에 연결**

원본에서 옮긴 `counts` 캐시 · `getCount` · `setCount` 를 다음으로 교체(예전 키 이어받기 줄은 삭제):
```js
import { readToday, writeToday } from './today.js';
function store(){ try { return window.localStorage; } catch(e){ return null; } }
function getCount(m){ const s = store(); return s ? readToday(s, m.id) : 0; }
function setCount(m, n){ const s = store(); if (s) writeToday(s, m.id, n); }
```
(`window.localStorage` 접근 자체가 throw 하는 브라우저 대비.) `bumpCount(m)` 는 그대로 `getCount(m)+1` → `setCount` 를 쓴다.

- [ ] **Step 6: 브라우저 확인**

`http://localhost:8765/` 에서 만두를 한 번 누름 → "오늘 만지기 1번". `javascript_tool`:
```js
localStorage.setItem('malangi_today_mandu', JSON.stringify({ d:'2000-01-01', n:99 })); location.reload();
```
→ 다시 누르면 "1번" (99 → 0 에서 시작). 크레딧은 계속 늘어나는지 확인.

- [ ] **Step 7: Commit**

```bash
git add js/today.js js/ui.js tests/today.test.js tests/index.html
git commit -m "Reset touch counter daily"
```

---

### Task 6: 효과음 경로별 캐시 (같은 파일은 한 번만)

**Files:**
- Modify: `js/sound.js`
- Create: `tests/sound.test.js`; Modify: `tests/index.html`

**Interfaces:**
- Produces: `export function createOnceCache(load: (key:string)=>Promise<T>): (key:string)=>Promise<T>` — 같은 key 는 같은 Promise 반환, 실패한 key 는 캐시에서 지워 다음에 재시도.

- [ ] **Step 1: 실패하는 테스트 `tests/sound.test.js`**

```js
import { test, eq } from './t.js';
import { createOnceCache } from '../js/sound.js';

test('once cache: 같은 경로는 한 번만 받는다', async ()=>{
  let calls = 0; const get = createOnceCache(async (k)=>{ calls++; return k + '!'; });
  const r = await Promise.all([get('a.mp3'), get('a.mp3'), get('b.mp3')]);
  eq(r, ['a.mp3!', 'a.mp3!', 'b.mp3!']); eq(calls, 2);
  await get('a.mp3'); eq(calls, 2);
});
test('once cache: 실패하면 다음에 다시 시도', async ()=>{
  let calls = 0; const get = createOnceCache(async ()=>{ calls++; if (calls === 1) throw new Error('net'); return 'ok'; });
  let failed = false; try { await get('x'); } catch(e){ failed = true; }
  eq(failed, true); eq(await get('x'), 'ok'); eq(calls, 2);
});
```
`tests/index.html` 에 `import './sound.test.js';` 추가.

- [ ] **Step 2: 실패 확인** — `/tests/` → `createOnceCache` 가 없어 import 오류.

- [ ] **Step 3: 구현** — `js/sound.js` 맨 위(Sound 정의 위)에:

```js
// 같은 key 는 한 번만 불러온다 (실패하면 지워서 다음에 다시 시도)
export function createOnceCache(load){
  const m = new Map();
  return (key)=>{
    if (!m.has(key)) m.set(key, load(key).catch((e)=>{ m.delete(key); throw e; }));
    return m.get(key);
  };
}
```
Sound 안 `load(m)` 의 반복문을 다음으로 교체 (`ensure()` 로 ctx 가 생긴 뒤에만 캐시 사용):
```js
      for (const key of ['press', 'release', 'rub', 'squeeze', 'crack']){
        const src = m.sfx[key] || '';
        if (!src) continue;
        try {
          const buf = await getBuffer(src);
          if (my === token) bufs[key] = buf;
        } catch(e){ console.warn('[말랑이] 효과음을 못 읽어서 기본 효과음으로 대체해요:', m.id, key, e); }
      }
```
Sound 안 변수 선언부에 추가:
```js
    const getBuffer = createOnceCache(async (src)=> decode(await (await fetch(src)).arrayBuffer()));
```

- [ ] **Step 4: 통과 확인** — `/tests/` → `PASS 18 / FAIL 0`.

- [ ] **Step 5: 브라우저 확인**

`http://localhost:8765/` → 버터 열기 → 누르기/문지르기/스페이스바 쥐기 소리가 나는지. `read_network_requests` urlPattern `butter.mp3` → 요청 1번. 다른 말랑이 갔다가 버터로 돌아와도 추가 요청 없음(또는 브라우저 캐시 304 없이 0건).

- [ ] **Step 6: Commit**

```bash
git add js/sound.js tests/sound.test.js tests/index.html
git commit -m "Cache decoded sounds per file path"
```

---

### Task 7: 품질 단계

**Files:**
- Create: `js/quality.js`, `tests/quality.test.js`
- Modify: `js/scene.js` (pixelRatio, 밀도, 프레임 감시), `js/main.js` (시작 단계), `tests/index.html`

**Interfaces:**
- Produces:
  - `TIERS = { high:{ pixelRatioCap:2, density:1 }, mid:{ pixelRatioCap:1.5, density:0.7 }, low:{ pixelRatioCap:1, density:0.5 } }`
  - `initialTier({ search, touch, minSide, cores, memory }): { tier:'high'|'mid'|'low', locked:boolean }`
  - `lowerTier(tier): tier`
  - `createFrameMonitor({ windowMs=2000, limitMs=25, maxGapMs=200 }?)` → `{ add(nowMs, dtMs), reset(), slow(nowMs): boolean }`
  - `js/scene.js`: `setQuality(tier)`, `getQuality()`

- [ ] **Step 1: 실패하는 테스트 `tests/quality.test.js`**

```js
import { test, eq } from './t.js';
import { TIERS, initialTier, lowerTier, createFrameMonitor } from '../js/quality.js';

const pc = { search:'', touch:false, minSide:900, cores:8, memory:8 };
test('PC → 높음', ()=> eq(initialTier(pc), { tier:'high', locked:false }));
test('약한 폰 → 보통', ()=> eq(initialTier({ search:'', touch:true, minSide:390, cores:4, memory:undefined }).tier, 'mid'));
test('좋은 폰 → 높음', ()=> eq(initialTier({ search:'', touch:true, minSide:390, cores:8, memory:8 }).tier, 'high'));
test('?q=low 고정', ()=> eq(initialTier({ ...pc, search:'?q=low' }), { tier:'low', locked:true }));
test('bad q ignored', ()=> eq(initialTier({ ...pc, search:'?q=ultra' }), { tier:'high', locked:false }));
test('lowerTier', ()=> eq([lowerTier('high'), lowerTier('mid'), lowerTier('low')], ['mid', 'low', 'low']));
test('TIERS 값', ()=> eq(TIERS.mid, { pixelRatioCap:1.5, density:0.7 }));
test('느린 2초 → slow', ()=>{
  const m = createFrameMonitor(); let t = 0;
  for (let i=0;i<70;i++){ t += 30; m.add(t, 30); }
  eq(m.slow(t), true);
});
test('빠르면 slow 아님', ()=>{
  const m = createFrameMonitor(); let t = 0;
  for (let i=0;i<130;i++){ t += 16; m.add(t, 16); }
  eq(m.slow(t), false);
});
test('2초 안 됐으면 판단 보류', ()=>{
  const m = createFrameMonitor(); let t = 0;
  for (let i=0;i<20;i++){ t += 40; m.add(t, 40); }
  eq(m.slow(t), false);
});
test('ignores huge gaps (탭 전환)', ()=>{
  const m = createFrameMonitor(); let t = 0;
  for (let i=0;i<130;i++){ t += 16; m.add(t, 16); }
  t += 5000; m.add(t, 5000);
  for (let i=0;i<5;i++){ t += 16; m.add(t, 16); }
  eq(m.slow(t), false);
});
```
`tests/index.html` 에 `import './quality.test.js';` 추가.

- [ ] **Step 2: 실패 확인** — `/tests/` → import 오류.

- [ ] **Step 3: `js/quality.js` 구현**

```js
// 품질 단계: 기기 성능에 맞춰 해상도·메쉬 밀도를 고른다 ("높음" = 원래 품질)
export const TIERS = {
  high: { pixelRatioCap: 2,   density: 1   },
  mid:  { pixelRatioCap: 1.5, density: 0.7 },
  low:  { pixelRatioCap: 1,   density: 0.5 },
};
export function initialTier({ search, touch, minSide, cores, memory }){
  const q = new URLSearchParams(search || '').get('q');
  if (q && Object.prototype.hasOwnProperty.call(TIERS, q)) return { tier: q, locked: true };
  const phone = !!touch && minSide < 820;
  const weak = (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4);
  return { tier: phone && weak ? 'mid' : 'high', locked: false };
}
export const lowerTier = (t)=> t === 'high' ? 'mid' : 'low';
// 최근 windowMs 동안의 평균 프레임 시간이 limitMs 를 넘으면 slow. maxGapMs 보다 긴 간격(탭 전환 등)은 무시
export function createFrameMonitor({ windowMs = 2000, limitMs = 25, maxGapMs = 200 } = {}){
  let s = [];
  return {
    add(now, dt){
      if (dt > maxGapMs){ s = []; return; }
      s.push([now, dt]);
      while (s.length && now - s[0][0] > windowMs) s.shift();
    },
    reset(){ s = []; },
    slow(now){
      if (!s.length || now - s[0][0] < windowMs*0.9) return false;
      return s.reduce((a, x)=> a + x[1], 0) / s.length > limitMs;
    },
  };
}
```

- [ ] **Step 4: 통과 확인** — `/tests/` → `PASS 29 / FAIL 0`.

- [ ] **Step 5: `js/scene.js` 에 연결**

맨 위 `import { TIERS, lowerTier, createFrameMonitor } from './quality.js';` 그리고 상태에:
```js
let quality = 'high', qualityLocked = false;
const monitor = createFrameMonitor();
function applyPixelRatio(){
  if (!renderer) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TIERS[quality].pixelRatioCap));
  resize();
}
export function setQuality(tier, locked){ quality = tier; qualityLocked = !!locked; SquishCore.setDensity(TIERS[tier].density); applyPixelRatio(); }
export const getQuality = ()=> quality;
```
- `initRenderer()` 의 `renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));` → `renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, TIERS[quality].pixelRatioCap));`
- `applyMalangi` 의 실루엣 호출을 `verts: Math.round((m.verts || 3200) * TIERS[quality].density)` 로 (나머지 인자는 그대로).
- `frame(now)` 안, `const dt = …` 바로 앞에:
```js
    if (contacts.size || gripHeld){
      monitor.add(now, now - last);
      if (!qualityLocked && quality !== 'low' && monitor.slow(now)){
        setQuality(lowerTier(quality), false); monitor.reset();
        console.info('[말랑이] 품질 단계를 낮췄어요 →', quality);
      }
    } else monitor.reset();
```
(밀도는 다음에 말랑이를 열 때 메쉬에 반영, pixelRatio 는 즉시.)

- [ ] **Step 6: `js/main.js` 에서 시작 단계 정하기**

`init()` 맨 앞:
```js
  const q = initialTier({
    search: location.search,
    touch: navigator.maxTouchPoints > 0,
    minSide: Math.min(screen.width, screen.height),
    cores: navigator.hardwareConcurrency,
    memory: navigator.deviceMemory,
  });
  setQuality(q.tier, q.locked);
```
import 추가: `import { initialTier } from './quality.js';`, scene import 목록에 `setQuality`.

- [ ] **Step 7: 브라우저 확인**

- `http://localhost:8765/?q=low` → 9종 모두 열림, 만두가 약간 거칠어 보이지만 정상 동작, 콘솔 오류 0.
- `?q=mid` 도 같은 확인.
- `?q=high` 로 패리티 페이지(`/tests/parity.html`) 재실행 → 기준 통과 유지.

- [ ] **Step 8: Commit**

```bash
git add js/quality.js js/scene.js js/main.js tests/quality.test.js tests/index.html
git commit -m "Add automatic quality tiers"
```

---

### Task 8: 가만히 있을 때 렌더 줄이기 (≈20fps)

**Files:**
- Modify: `js/scene.js`, `js/wax.js`

**Interfaces:**
- Consumes: `Wax.busy()` (이 Task 에서 실제 구현)

- [ ] **Step 1: `js/wax.js` — 부스러기가 살아 있는지 알려 주기**

Wax 상태에 `let alive = false;` 추가, `update()` 안 `const r = sim.step(dt);` 다음 줄에 `alive = r.alive > 0;`, `disable()` 와 `reset()` 에 `alive = false;`. 반환 객체의 `busy:()=>false` → `busy:()=> on && alive`.

- [ ] **Step 2: `js/scene.js` — 렌더 조건**

상태에 `let lastRender = 0, needsRender = true;` 추가. `needsRender = true;` 를 `applyMalangi` 끝, `resize()` 끝, `updateCamera()` 안에 넣는다. `frame()` 의 `renderer.render(scene, camera);` 를 다음으로:
```js
    const busy = needsRender || res.active || orbit || contacts.size > 0 || gripLevel > 0 || Wax.busy();
    if (busy || now - lastRender >= 50){                // 가만히 있으면 약 20fps (만두 뒷면 반짝이는 계속 보임)
      renderer.render(scene, camera); lastRender = now; needsRender = false;
    }
```

- [ ] **Step 3: 브라우저 확인**

`http://localhost:8765/` 에서 `javascript_tool`:
```js
let n = 0; const raf = requestAnimationFrame; const gl = document.getElementById('c').getContext('webgl') || document.getElementById('c').getContext('webgl2');
const orig = gl.drawElements.bind(gl); gl.drawElements = (...a)=>{ n++; return orig(...a); };
await new Promise(r=>setTimeout(r, 2000)); n
```
Expected: 가만히 2초 → 대략 40~60회 이하(렌더당 drawElements 1~3회 × 20fps × 2s 범위 안, 이전 60fps 대비 확실히 적음). 만두를 누르고 있는 동안은 부드럽게 움직이는지, 놓은 뒤 출렁임이 끊김 없이 끝나는지 눈으로 확인. 왁뿌볼을 깨서 부스러기가 끝까지 부드럽게 떨어지는지 확인.

- [ ] **Step 4: 패리티 재확인** — `/tests/parity.html` 기준 통과(캡처 훅은 실제로 그린 프레임만 잡도록 이미 빈 캡처를 거름).

- [ ] **Step 5: Commit**

```bash
git add js/scene.js js/wax.js
git commit -m "Throttle rendering to ~20fps while idle"
```

---

### Task 9: 최종 확인 · 정리 · 미리보기 배포

**Files:**
- 없음(확인), 필요하면 수정

- [ ] **Step 1: 전체 테스트** — `/tests/` → `PASS 29 / FAIL 0`.

- [ ] **Step 2: 패리티** — `/tests/parity.html` → 9종 기준 통과.

- [ ] **Step 3: 수동 체크리스트** (`http://localhost:8765/`)
  - 9종 모두: 누르기 소리, 놓기 소리(은하계), 문지르기(버터·뽁뽁이), 스페이스바 쥐기 소리
  - 왁뿌볼: 깨짐 소리·진행률 %·"새 왁뿌볼" 버튼
  - 볼륨 슬라이더·음소거 저장(새로고침 후 유지)
  - 카운터 1씩 증가, 크레딧 증가
  - 휴대폰 크기(`resize_window` preset mobile)에서 레이아웃·아래 목록 스크롤
  - 다크 모드(`resize_window` colorScheme dark)

- [ ] **Step 4: 첫 화면 다운로드 양**

`read_network_requests` 로 첫 로딩 요청 목록을 보고 합계를 계산. Expected: 원본 1.8MB 대비 크게 감소(만두 사진 + 썸네일 + JS/CSS; 소리는 만두에 없음). 숫자를 기록해 사용자에게 보고.

- [ ] **Step 5: 서버 정지 · 작업 트리 확인**

`preview_stop`. `git status` 깨끗한지(`_baseline.html`, `.claude/` 는 무시됨).

- [ ] **Step 6: 브랜치 push (사용자 확인 후)**

사용자에게 push 해도 되는지 묻고, 허락하면:
```bash
git push -u origin refactor/foundation
```
Vercel 이 만든 미리보기 주소를 사용자에게 알려 휴대폰·PC로 확인받는다. `main` 합치기는 사용자가 미리보기를 확인한 뒤 따로 결정한다.
