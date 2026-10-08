#!/usr/bin/env bash
# 원본(_baseline.html)과 새 버전의 화면을 헤드리스 Chrome 으로 비교한다 (서버: localhost:8765 가 떠 있어야 함)
cd "$(dirname "$0")/.."
out=$(mktemp)
python - "$out" <<'PY' & rcv=$!
import http.server, sys
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        open(sys.argv[1], 'wb').write(self.rfile.read(int(self.headers['Content-Length'])))
        self.send_response(200); self.send_header('Access-Control-Allow-Origin', '*'); self.end_headers()
    def log_message(self, *a): pass
http.server.HTTPServer(('127.0.0.1', 8767), H).handle_request()
PY
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
prof=$(mktemp -d)
"$CHROME" --headless=new --enable-unsafe-swiftshader --use-angle=swiftshader --window-size=1200,900 --user-data-dir="$prof" \
  --remote-debugging-port=0 "http://localhost:8765/tests/parity.html?report=http://127.0.0.1:8767/&t=$RANDOM" >/dev/null 2>&1 & chr=$!
for i in $(seq 1 120); do kill -0 $rcv 2>/dev/null || break; sleep 1; done
taskkill //F //T //PID $chr >/dev/null 2>&1; taskkill //F //T //PID $rcv >/dev/null 2>&1; rm -rf "$prof"
PYTHONIOENCODING=utf-8 python -c "import json,sys; d=json.load(open(sys.argv[1],encoding='utf-8')); print('\n'.join(d['rows'])); print('최대', round(d['worst'],2))" "$out"
