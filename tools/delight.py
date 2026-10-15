"""전개도 사진에서 흰 부분의 찍힌 그림자(밝기 얼룩)를 지운다. 작은 질감은 살리고, 색이 있거나 어두운 부분(단추·당근·목도리)은 그대로.
실행: python tools/delight.py assets/img/snow.webp assets/img/snow_clean.webp"""
import sys
import numpy as np
from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.float32)/255.0
mx, mn = a.max(2), a.min(2)
v = mx                                                   # 밝기
s = np.where(mx > 0, (mx - mn)/np.maximum(mx, 1e-6), 0)  # 채도
# 흰 눈 부분: 채도 낮고 밝은 곳 (부드러운 경계)
def smooth(e0, e1, x): t = np.clip((x - e0)/(e1 - e0), 0, 1); return t*t*(3 - 2*t)
mask = (1 - smooth(0.10, 0.22, s))*smooth(0.40, 0.60, v)
mask_img = Image.fromarray((mask*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))
mask = np.asarray(mask_img).astype(np.float32)/255.0
# 큰 얼룩(저주파 밝기)만 구한다: 흰 부분만으로 평균 (단추 등이 섞이지 않게)
R = 40
num = np.asarray(Image.fromarray((v*mask*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(R))).astype(np.float32)/255.0
den = np.asarray(Image.fromarray((mask*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(R))).astype(np.float32)/255.0
low = num/np.maximum(den, 1e-3)
target, detail = 0.94, 0.6
v_new = target*(1 + detail*(v/np.maximum(low, 1e-3) - 1))
scale = np.clip(v_new/np.maximum(v, 1e-3), 0.5, 2.0)
out = a*(1 - mask[..., None]) + np.clip(a*scale[..., None], 0, 1)*mask[..., None]
Image.fromarray((out*255).round().astype(np.uint8)).save(dst, 'WEBP', quality=90, method=6)
w = mask > 0.9
print('흰 부분 밝기 편차: %.3f → %.3f' % (v[w].std(), out.max(2)[w].std()))
