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
