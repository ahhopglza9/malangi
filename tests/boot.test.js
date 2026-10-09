import { test, eq } from './t.js';
import { markBooted } from '../js/dom.js';

test('부팅되면 실패 안내를 숨긴다 (늦게 떠도)', ()=>{
  const el = document.createElement('div'); el.id = 'bootFail'; el.hidden = false; document.body.appendChild(el);
  markBooted();
  eq([el.hidden, window.__malangiBooted], [true, true]);
  el.remove();
});
