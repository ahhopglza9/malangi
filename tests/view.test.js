import { test, eq } from './t.js';
import { bleedZoom } from '../js/render/view.js';

test('캔버스를 1.4배로 넓히면 카메라는 1/1.4 로 당겨서 말랑이 크기를 그대로', ()=> eq(bleedZoom(400, 560), 400/560));
test('넓히지 않았으면 그대로 1', ()=> eq(bleedZoom(400, 400), 1));
test('크기를 아직 모르면 1 (0 나누기 방지)', ()=> eq([bleedZoom(0, 0), bleedZoom(400, 0)], [1, 1]));
