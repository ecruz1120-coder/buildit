"""Builds public/world/ryzen5_terrain.jpg: the atlas with its printed icons, numbers and labels
scrubbed out (so corrected names/numbers aren't contradicted by the art), for the 3D overworld.
Method: light median filter everywhere, heavy median over every printed marker and label.
Run: python3 -I tools/terrain_texture.py public/world/ryzen5_atlas.jpg content/world.json public/world/ryzen5_terrain.jpg
"""
import sys, json
from PIL import Image, ImageFilter, ImageDraw
src, world, out = sys.argv[1:4]
im = Image.open(src).convert('RGB')
w = json.load(open(world))
light = im.filter(ImageFilter.MedianFilter(5))
mask = Image.new('L', im.size, 0)
d = ImageDraw.Draw(mask)
# every printed marker on the atlas (old positions included) + its number to the right
for n in w['nodes']:
    if n['kind'] in ('junction', 'landing', 'port', 'pass'): continue
    x, y = n['px']
    r = 26 if n['kind'] == 'city' else 15
    d.ellipse([x - r, y - r - 4, x + r, y + r], fill=255)
    if n['kind'] == 'outpost': d.rectangle([x + 4, y - 14, x + 30, y + 10], fill=255)
d.rectangle([1086, 372, 1104, 394], fill=255)  # stray "7" by Kessar Bay
d.rectangle([244, 418, 260, 528], fill=255)    # frame sliver in the Western Drift Ocean
# printed text labels
def label(x, y, text, size=11):
    half = len(text) * size * 0.42
    d.rectangle([x - half - 6, y - size - 4, x + half + 6, y + size + 2], fill=255)
for r in w['regions']:
    big = r['name'].upper().startswith('THE MERIDIAN')
    label(r['px'][0], r['px'][1], r['name'], 22 if big else 12)
    if r.get('sub'): label(r['px'][0], r['px'][1] + 18, r['sub'], 8)
for wa in w['waters']:
    if wa['kind'] == 'ocean':  # printed over three lines
        x, y = wa['px']; d.rectangle([x - 60, y - 40, x + 60, y + 48], fill=255)
    else:
        label(wa['px'][0], wa['px'][1], wa['name'], 16 if wa['kind'] == 'sea' else 9)
for n in w['nodes']:
    if n['kind'] == 'hive': label(n['px'][0], n['px'][1] + 30, n['name'], 9)
label(740, 420, 'TITANSPINE MOUNTAINS', 0)  # diagonal label: cover with a band
d.line([(680, 330), (805, 495)], fill=255, width=34)
d.line([(500, 590), (585, 405)], fill=255, width=30)    # RAZORBACK RANGES (diagonal)
d.line([(770, 775), (955, 762)], fill=255, width=26)    # STORMBREAKER RANGE
d.line([(285, 60), (365, 130)], fill=255, width=1)
d.ellipse([290, 75, 360, 135], fill=255)                # compass rose
import numpy as np
hole = np.array(mask.filter(ImageFilter.MaxFilter(5))) > 0
base = np.array(light).astype(np.float32)
# diffusion inpainting: fill holes from their surroundings (coarse-to-fine)
img = base.copy()
small = Image.fromarray(base.astype(np.uint8)).resize((im.width // 4, im.height // 4), Image.BILINEAR)
sh = np.array(Image.fromarray(hole.astype(np.uint8) * 255).resize(small.size, Image.NEAREST)) > 0
sa = np.array(small).astype(np.float32)
for _ in range(400):
    avg = (np.roll(sa, 1, 0) + np.roll(sa, -1, 0) + np.roll(sa, 1, 1) + np.roll(sa, -1, 1)) / 4
    sa[sh] = avg[sh]
up = np.array(Image.fromarray(np.clip(sa, 0, 255).astype(np.uint8)).resize(im.size, Image.BILINEAR)).astype(np.float32)
img[hole] = up[hole]
for _ in range(150):
    avg = (np.roll(img, 1, 0) + np.roll(img, -1, 0) + np.roll(img, 1, 1) + np.roll(img, -1, 1)) / 4
    img[hole] = avg[hole]
# borrow high-frequency grain from nearby unmasked terrain so patches aren't flat
grain = base - np.array(Image.fromarray(base.astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))).astype(np.float32)
todo = hole.copy()
for sh in [(37, 53), (-41, 29), (23, -61), (-57, -33), (71, 11), (-13, 83), (89, -47), (-97, 61)]:
    src_ok = ~np.roll(hole, sh, (0, 1))
    use = todo & src_ok
    img[use] += np.roll(grain, sh, (0, 1))[use] * 0.9
    todo &= ~use
soft = np.array(Image.fromarray((hole * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32)[..., None] / 255
final = base * (1 - soft) + img * soft
Image.fromarray(np.clip(final, 0, 255).astype(np.uint8)).save(out, quality=88)
print('ok', out)
