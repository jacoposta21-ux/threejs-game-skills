# Step 1 of the character pipeline: re-encode the Quaternius PNG textures as
# resized JPEGs next to copies of the .gltf files (images are untrusted input:
# run with python3 -I). Usage: python3 -I tools/prepare-characters.py <ubc_dir> <out_dir>
import json, os, shutil, sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
SIZES = {'BaseColor': 1024, 'Dark': 1024, 'Normal': 512, 'Roughness': 512, 'Eye': 256}

def size_for(name):
    if 'Hair' in name:
        return 512
    for k, v in SIZES.items():
        if k in name:
            return v
    return 512

def convert(gltf_path):
    base = os.path.dirname(gltf_path)
    g = json.load(open(gltf_path))
    for img in g.get('images', []):
        uri = img['uri']
        im = Image.open(os.path.join(base, uri))
        has_alpha = im.mode in ('RGBA', 'LA') and im.getextrema()[-1][0] < 250
        s = size_for(uri)
        im = im.resize((s, s), Image.LANCZOS)
        if has_alpha:
            name = os.path.splitext(uri)[0] + '.png'
            im.save(os.path.join(out, name), optimize=True)
            img['mimeType'] = 'image/png'
        else:
            name = os.path.splitext(uri)[0] + '.jpg'
            im.convert('RGB').save(os.path.join(out, name), quality=85, optimize=True)
            img['mimeType'] = 'image/jpeg'
        img['uri'] = name
    for b in g.get('buffers', []):
        shutil.copy(os.path.join(base, b['uri']), os.path.join(out, b['uri']))
    json.dump(g, open(os.path.join(out, os.path.basename(gltf_path)), 'w'))
    print('converted', os.path.basename(gltf_path))

for f in ['Base Characters/Superhero_Male_FullBody.gltf', 'Base Characters/Superhero_Female_FullBody.gltf'] + [
    f'Hairstyles/Rigged/{n}.gltf' for n in ['Hair_Buzzed', 'Hair_SimpleParted', 'Hair_Long', 'Hair_Buns', 'Hair_Beard', 'Eyebrows_Regular', 'Eyebrows_Female']
]:
    convert(os.path.join(src, f))
