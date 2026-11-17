import sys, numpy as np
from PIL import Image, ImageFilter
src = sys.argv[1]
im = Image.open(src).convert('RGB').filter(ImageFilter.MedianFilter(3))
a = np.array(im).astype(int); R,G,B = a[...,0],a[...,1],a[...,2]
water = (B > R + 8) & (B >= G - 12)
# panels / frame (UI boxes baked into the art) -> treat as ocean
panels = [(0,0,270,240),(0,245,205,830),(0,835,465,1024),(465,945,665,1024),(1065,880,1290,1024),(1285,875,1536,1024),(1295,305,1536,845),(1265,0,1536,300)]
for x0,y0,x1,y1 in panels: water[y0:y1,x0:x1] = True
land = ~water
# terrain classes on land
mx = np.maximum(np.maximum(R,G),B); mn = np.minimum(np.minimum(R,G),B); sat = (mx-mn)/np.maximum(mx,1)
forest = land & (G >= R - 25) & (G > B + 15) & (mx < 170)
mountain = land & ~forest & ((sat < 0.28) | (mx < 95))
desert = land & ~forest & ~mountain
cls = np.zeros(R.shape, np.uint8); cls[desert]=1; cls[forest]=2; cls[mountain]=3
# downsample 2x via majority-ish (mode of 2x2)
h,w = cls.shape
small = cls.reshape(h//2,2,w//2,2).transpose(0,2,1,3).reshape(h//2,w//2,4)
out = np.apply_along_axis(lambda v: np.bincount(v,minlength=4).argmax(), 2, small).astype(np.uint8)
# smooth: majority filter 3x3 via PIL mode filter
img = Image.fromarray(out*60).filter(ImageFilter.ModeFilter(3))
out = (np.array(img)//60).astype(np.uint8)
lat = 90 - (np.arange(out.shape[0])+0.5)/out.shape[0]*180
wgt = np.cos(np.radians(lat))[:,None]*np.ones_like(out,dtype=float)
tot = wgt.sum()*360/270  # off-map 90 degrees assumed ocean
landw = (wgt*(out>0)).sum()
print('land fraction (area-weighted, off-map=ocean): %.3f  water %.3f' % (landw/tot, 1-landw/tot))
for k,n in [(1,'desert/grass'),(2,'forest'),(3,'mountain')]:
  print(n, '%.3f' % ((wgt*(out==k)).sum()/landw))
# palette PNG: 0 water,1 desert,2 forest,3 mountain
pal = Image.fromarray(out, 'P'); pal.putpalette([20,40,60, 200,170,120, 60,110,70, 120,110,100]+[0]*756)
pal.save(sys.argv[2], optimize=True)
