#!/usr/bin/env bash
# 브라우저 테스트(tests/index.html)를 헤드리스 Chrome 으로 돌려 결과를 출력한다. 통과 = "FAIL 0"
cd "$(dirname "$0")/.."
python -m http.server 8766 >/dev/null 2>&1 & srv=$!
prof=$(mktemp -d)                                    # 매번 새 프로필 (남아 있는 Chrome 과 겹치지 않게)
trap 'taskkill //F //T //PID $srv >/dev/null 2>&1; kill $srv 2>/dev/null; rm -rf "$prof"' EXIT
sleep 1
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
out=$(timeout 60 "$CHROME" --headless=new --disable-gpu --user-data-dir="$prof" --virtual-time-budget=20000 --dump-dom http://localhost:8766/tests/ 2>/dev/null)
res=$(printf '%s' "$out" | tr '\n' '~' | sed -n 's/.*<div id="out">\([^<]*\)<.*/\1/p' | tr '~' '\n')
echo "$res"
printf '%s' "$res" | head -1 | grep -q '^PASS [1-9][0-9]* / FAIL 0$'
