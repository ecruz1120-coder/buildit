import sys, numpy as np
from PIL import Image
from collections import deque
a = (np.array(Image.open(sys.argv[1])) > 0)  # land
h, w = a.shape
seen = np.zeros_like(a); keep = np.zeros_like(a)
for y in range(h):
  for x in range(w):
    if a[y,x] and not seen[y,x]:
      q=deque([(y,x)]); seen[y,x]=1; comp=[]
      while q:
        cy,cx=q.popleft(); comp.append((cy,cx))
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
          ny,nx=cy+dy,cx+dx
          if 0<=ny<h and 0<=nx<w and a[ny,nx] and not seen[ny,nx]: seen[ny,nx]=1; q.append((ny,nx))
      if len(comp) >= 400:
        for p in comp: keep[p]=1
keep[:, 620:] = 0; keep[:12, :] = 0; keep[505:, :] = 0  # legend frame lines baked into the art
img = Image.fromarray((keep*255).astype(np.uint8), 'L').convert('1')
img.save(sys.argv[2], optimize=True)
lat = 90 - (np.arange(h)+0.5)/h*180
wg = np.cos(np.radians(lat))[:,None]*np.ones((h,w))
mapw = wg.sum(); landw = (wg*keep).sum()
print('land share of mapped 270deg: %.3f' % (landw/mapw))
print('land share of planet if off-map 90deg is ocean: %.3f' % (landw/(mapw*360/270)))
print('flat pixel land share of map image: %.3f' % keep.mean())
