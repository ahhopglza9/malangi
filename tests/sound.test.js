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
