"""원본 index.html(커밋 5344849)의 ASSETS base64 를 실제 파일로 푼다.
같은 내용의 효과음은 한 파일로, 쓰지 않는 사진(gun, gun_back, gun2, bolt, bolt_back)은 버린다.
만두 PNG 는 WebP 로 바꾸고 160px 썸네일도 만든다.  실행: python tools/extract_assets.py"""
import base64, hashlib, re, subprocess
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
