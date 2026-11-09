# Contact sheet: python3 -I tools/qa/sheet.py <dir> <prefix> <out.png> [cols]
import sys, glob
from PIL import Image
d, prefix, out = sys.argv[1:4]
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 6
files = sorted(glob.glob(f"{d}/{prefix}-*.png"))
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
s = 0.5
tw, th = int(w * s), int(h * s)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (tw * cols, th * rows), (20, 20, 20))
for i, im in enumerate(ims):
    sheet.paste(im.resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
sheet.save(out)
print(out, sheet.size)
