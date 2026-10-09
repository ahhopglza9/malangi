# 1단계: 기반 정리 · 성능 — 설계

날짜: 2026-10-07 · 브랜치: `refactor/foundation`

## 배경

말랑이 공방을 고퀄리티로 발전시키는 3단계 중 첫 단계다.

1. **기반 정리 · 성능** ← 이 문서
2. 만지는 느낌 · 비주얼 (물리, 재질, 조명, 소리 반응)
3. 게임 콘텐츠 (해금, 수집, 도전과제)

지금은 `index.html` 하나(1.8MB)에 설정 · 엔진 2,400줄 · base64 사진/소리가 모두 들어 있다.
2·3단계 기능을 얹기 전에 구조를 나누고, 로딩과 성능을 다듬는다.

## 작업 방식 제약 (사용자)

- 사용자는 Claude에게 "어디를 고칠지" 물어본 뒤 **GitHub 웹 편집기에서 직접 수정**한다.
- 배포는 **Vercel**(GitHub 연결, push 하면 자동 배포). 확인도 Vercel 주소에서 한다.
- 따라서 **빌드 도구 없음**: 파일을 고치면 그대로 동작해야 한다. npm / 번들러 / `package.json` 을 두지 않는다.
- 파일은 GitHub 웹에서 열기 쉽게 작게, 자주 고치는 곳(말랑이 목록)은 한 파일에 모은다.

## 목표 / 성공 기준

- Vercel 주소에서 말랑이 9종이 **지금과 똑같이 보이고, 만져지고, 소리 난다** (아래 "의도한 변화" 제외).
- 첫 화면이 뜨기까지 내려받는 양이 크게 준다 (현재 1.8MB 전부 → 만두 하나 + 썸네일).
- 콘솔 오류 없음.

## 의도한 변화 (이것만 동작이 달라진다)

1. "오늘 만지기 N번" 카운터가 **날짜가 바뀌면 0부터** 다시 센다 (말랑이별).
   - 홈 카드의 "N번 만졌어요"와 10/50/100번째 메시지도 **오늘 횟수** 기준.
   - 크레딧은 지금처럼 누적.
   - 예전 저장값(`malangi_count_<id>`)은 오늘 기록이 아니므로 버린다(읽지 않음).
2. 아무것도 움직이지 않을 때는 화면을 **초당 약 20번**만 다시 그린다 (지금은 60번). 만두 뒷면 반짝이는 느린 애니메이션이라 그대로 보인다.
3. 기기 성능에 따라 렌더링 해상도/메쉬 밀도가 자동으로 낮아질 수 있다 ("높음" 단계 = 지금과 동일).
4. 만두 사진 PNG → WebP (눈으로 구분 안 되는 품질).

## 파일 구조

```
index.html              화면 뼈대(HTML)만. style.css 와 js/main.js 를 불러온다
style.css               지금 <style> 내용 그대로
js/
  config.js             ★ 말랑이 목록 (지금 ① 블록). 사진/소리는 파일 경로로
  main.js               시작점: 모듈들을 이어 붙이고 init
  ui.js                 홈 카드 · 아래 목록 · 카운터(오늘 횟수) · 크레딧 · 메시지
  scene.js              Three.js 장면 · applyMalangi · 매 프레임 루프 · 입력(포인터/쥐기)
  quality.js            품질 단계 고르기 + 프레임 시간 감시
  sound.js              Sound (효과음 로드/재생/합성)
  wax.js                Wax (왁뿌볼: Three.js 연결 부분)
  loader.js             Three.js 로드(cdnjs → jsDelivr), 이미지 로드/캐시
  core/
    squish.js           SquishCore (형태 + 젤리 물리, 순수 JS)
    wax-sim.js          WaxSim (조각 피해/부스러기, 순수 JS)
  render/
    shaders.js          SHADER_SRC · CORE_SRC · SHARD_SRC
  image/
    texture.js          detectBody · prepareTexCanvas
    silhouette.js       makeMask · makeCutoutCanvas · edt · buildSilhouette 등
assets/
  img/                  mandu.webp, gun.webp, bolt.webp, bolt_back.jpg, bubble.webp, ...
                        + 각 말랑이 썸네일 *_thumb.webp
  sfx/                  butter.mp3, bubble.mp3, gun.mp3, ... (중복 제거 후 실제 파일)
```

- 각 파일은 지금 코드를 **옮기기만** 한다. 로직은 위 "의도한 변화"에 필요한 곳 외에는 바꾸지 않는다.
- 모듈 방식: `<script type="module">` + `import/export`. 빌드 없이 브라우저가 직접 읽는다.
- Three.js r128 은 지금처럼 `window.THREE` 로 동적 로드한다 (버전 업그레이드는 2단계에서).
- 순환 참조 금지: `ui.js` ↔ `scene.js` 처럼 서로 부르는 곳은 `main.js` 가 콜백으로 연결한다
  (예: scene 이 "한 번 만졌다"를 알리면 main 이 ui 의 카운터를 올림).
- 루트에 있던 `chicken.webp`, `chicken_thumb.webp` 는 `assets/img/` 로 옮긴다.

## config.js (사용자가 가장 자주 고치는 파일)

- 지금 ① 블록의 설명 주석과 `DEFAULT_SOUNDS`, `FEATURED`, `MALANGIS` 를 그대로 옮기고 `export` 한다.
- `img: 'asset:mandu'` → `img: 'assets/img/mandu.webp'` 처럼 경로로 바꾼다.
  `asset:` 방식(base64 블록)은 없앤다. 주석의 사용법 설명도 경로 방식으로 고친다.
- 같은 소리를 여러 동작에 쓰는 경우 같은 파일을 가리킨다.
  예: `sfx: { press: 'assets/sfx/butter.mp3', rub: 'assets/sfx/butter.mp3', squeeze: 'assets/sfx/butter.mp3' }`
  (Sound 는 같은 경로를 한 번만 받아 디코드하도록 캐시)
- 사진이 지금 썸네일을 런타임에 만들던 말랑이(만두 · 총 · 번개 · 은하계)는
  지금 만들어지는 썸네일과 같은 이미지를 미리 파일로 저장하고 `thumb:` 로 지정한다.

## 에셋 정리

- base64 를 실제 파일로 풀어 `assets/` 에 저장한다 (원본 바이트 그대로; 만두만 WebP 변환).
- 쓰지 않는 5개 삭제: `gun`, `gun_back`, `gun2`, `bolt`, `bolt_back` (설정에서 `gun3`, `bolt2`, `bolt2_back` 만 사용).
  파일 이름은 정리: `gun3` → `gun.webp`, `bolt2` → `bolt.webp`, `bolt2_back` → `bolt_back.jpg`.
- 중복 효과음(같은 내용) 7묶음 → 각 1개 파일:
  butter(press/rub/squeeze), bubble(press/rub/squeeze), gun, bolt, galaxy(press/squeeze), snow, chicken.
  galaxy_release 와 wax_crack 은 별도 파일 유지.

## 지연 로딩

- 첫 화면: HTML/CSS/JS + 썸네일들 + FEATURED(만두) 사진만 받는다.
- 다른 말랑이의 사진 · 소리는 **그 말랑이를 처음 열 때** 받는다 (이미 있는 이미지 캐시 그대로 사용).
- 효과음 파일 로드는 지금처럼 `fetch` + `decodeAudioData`, 경로별 캐시를 추가해 다시 열 때 재다운로드 없음.

## 품질 단계 (quality.js)

| 단계 | pixelRatio | 메쉬 밀도 |
|---|---|---|
| 높음 (= 지금) | min(dpr, 2) | 지금 값 (돔 S=96·L=54, 실루엣 verts 기본 3200/설정값) |
| 보통 | min(dpr, 1.5) | 약 70% |
| 낮음 | 1 | 약 50% |

- 시작 단계 추정: 휴대폰/태블릿(터치 + 작은 화면) 이고 `navigator.hardwareConcurrency <= 4` 또는
  `navigator.deviceMemory <= 4` 이면 "보통", 그 외 "높음".
- 실행 중 감시: 말랑이를 만지는 동안 최근 2초 평균 프레임 시간이 25ms(≈40fps)를 넘으면 한 단계 내린다.
  단계는 내려가기만 하고 다시 올라가지 않는다 (깜빡임 방지). 바뀐 단계는 다음에 말랑이를 열 때 메쉬에,
  pixelRatio 는 즉시 반영.
- 테스트용: 주소에 `?q=low|mid|high` 를 붙이면 그 단계로 고정.
- 메쉬 밀도를 바꾸기 위해 `SquishCore` 의 `S`, `L` 상수를 `create()` 인자로 받을 수 있게 한다
  (기본값은 지금 값). 회전체/상자/실루엣도 각자의 분할 수에 같은 배율을 곱한다.
- 2단계에서 그림자/후처리 같은 효과를 켜고 끌 때도 이 단계 값을 쓴다 (지금은 위 두 가지만).

## 화면 다시 그리기 줄이기

- 매 프레임 판단: 물리가 움직였거나(`res.active`), 회전 드래그 중이거나, 왁스 부스러기가 살아 있거나,
  크기가 바뀌었거나, 말랑이를 막 열었으면 → 바로 그린다.
- 그 외(가만히 있음) → 마지막으로 그린 뒤 50ms 이상 지났을 때만 그린다 (≈20fps, 반짝이 유지).

## 카운터 (ui.js)

- 저장 키: `malangi_today_<id>` = `{"d":"2026-10-07","n":12}` (날짜는 사용자 기기 기준 로컬 날짜).
- 읽을 때 `d` 가 오늘이 아니면 0. 앱을 켜 둔 채 자정이 지나면 다음 터치 때 0부터 다시 센다.
- `localStorage` 접근은 지금처럼 모두 try/catch.

## 오류 처리

- 지금 있는 안내 메시지(3D 엔진 실패, 사진 실패, SecurityError, WebGL 불가)를 그대로 유지.
- 모듈 파일 하나가 404 이면 화면이 비므로, `index.html` 에 짧은 `<noscript>`/로딩 실패 안내를 둔다
  (main.js 가 시작되면 숨김).

## 검증 방법

- 로컬: `python -m http.server` 로 띄워 Claude 브라우저 창에서 확인.
  - 9종 모두 열기 → 로딩 완료, 콘솔 오류 0.
  - 정리 전/후 같은 시점 스크린샷 비교 (9종).
  - 누르기/쥐기/문지르기 소리, 왁뿌볼 깨짐/새로고침, 카운터·크레딧 증가 확인.
  - 날짜 바꾸기: 저장값의 `d` 를 어제로 고쳐 0부터 세는지 확인.
  - `?q=low` / `?q=mid` 에서 정상 동작.
  - 네트워크 탭에서 첫 화면 다운로드 양 비교.
- 순수 로직(SquishCore, WaxSim, 날짜 카운터, 품질 추정)은 브라우저 콘솔에서 돌리는 작은 테스트 페이지
  `tests/index.html` 로 확인 (빌드 없이 모듈 import).
- 브랜치를 push 하면 Vercel 미리보기 주소가 생기므로, main 에 합치기 전에 사용자가 휴대폰/PC로 확인.

## 범위 밖 (이번에 하지 않음)

- Three.js 버전 업그레이드, 새 재질/조명/후처리 (→ 2단계)
- 크레딧 사용처, 해금, 홈 화면 노출 방식 변경 (→ 3단계)
- 물리 파라미터 · 셰이더 로직 변경
