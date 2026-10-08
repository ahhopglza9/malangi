#!/usr/bin/env bash
# 브라우저 테스트(tests/index.html)를 헤드리스 Chrome 으로 돌려 결과를 출력한다. 통과 = "FAIL 0"
cd "$(dirname "$0")/.."
python -m http.server 8766 >/dev/null 2>&1 & srv=$!
trap 'kill $srv 2>/dev/null' EXIT
sleep 1
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
out=$("$CHROME" --headless=new --disable-gpu --virtual-time-budget=20000 --dump-dom http://localhost:8766/tests/ 2>/dev/null)
res=$(printf '%s' "$out" | sed -n 's/.*<div id="out">\([^<]*\).*/\1/p'; printf '%s' "$out" | tr '\n' '~' | sed -n 's/.*<div id="out">\([^<]*\)<.*/\1/p' | tr '~' '\n' | tail -n +2)
echo "$res"
printf '%s' "$res" | grep -q 'FAIL 0$\|FAIL 0 *$' && printf '%s' "$res" | head -1 | grep -q '^PASS [1-9]'
