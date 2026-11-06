import sys
from PIL import Image, ImageDraw, ImageFont
S=sys.argv[1]
F='/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf'
def make(src, W, H, crop, out, fs):
    import os; os.makedirs(out, exist_ok=True)
    base = Image.open(src).convert('RGB').crop(crop).resize((W,H), Image.LANCZOS)
    font = ImageFont.truetype(F, fs)
    txt = 'PLAY FREE IN YOUR BROWSER'
    for i in range(90):
        z = 1 + 0.06*i/89
        w,h = int(W*z), int(H*z)
        im = base.resize((w,h), Image.BICUBIC).crop(((w-W)//2,(h-H)//2,(w-W)//2+W,(h-H)//2+H))
        d = ImageDraw.Draw(im)
        t = min(1, max(0,(i-8)/10))
        if t>0:
            s = 0.6+0.4*min(1,t*1.15)
            tw = d.textbbox((0,0),txt,font=font)[2]
            bw,bh = int((tw+90)*s), int((fs+50)*s)
            cx, cy = W//2, int(H*0.88) - int((1-t)*40)
            lay = Image.new('RGBA',(W,H),(0,0,0,0)); ld=ImageDraw.Draw(lay)
            ld.rounded_rectangle((cx-bw//2, cy-bh//2+10, cx+bw//2, cy+bh//2+10), radius=int(26*s), fill=(36,29,56,int(255*t)))
            ld.rounded_rectangle((cx-bw//2, cy-bh//2, cx+bw//2, cy+bh//2), radius=int(26*s), fill=(255,207,58,int(255*t)), outline=(36,29,56,int(255*t)), width=6)
            f2 = ImageFont.truetype(F, int(fs*s))
            ld.text((cx, cy+2), txt, font=f2, fill=(47,42,82,int(255*t)), anchor='mm')
            im = Image.alpha_composite(im.convert('RGBA'), lay).convert('RGB')
        im.save(f'{out}/e{i:03d}.jpg', quality=92)
make(f'{S}/covers/landscape.jpg', 1920,1080,(0,0,1920,1080), f'{S}/trailer/end_land', 64)
make(f'{S}/covers/portrait.jpg', 1080,1620,(0,180,1080,1800), f'{S}/trailer/end_port', 56)
