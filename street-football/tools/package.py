# Package dist/ as the CrazyGames upload zip and sanity-check the build.
# Usage: npm run package   (runs the production build first)
import json, os, re, sys, zipfile

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dist = os.path.join(root, 'dist')
version = json.load(open(os.path.join(root, 'package.json')))['version']
out_dir = os.path.join(root, 'release')
os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, f'rua10-crazygames-v{version}.zip')

problems = []
files = []
total = 0
for d, _, names in os.walk(dist):
    for n in names:
        p = os.path.join(d, n)
        rel = os.path.relpath(p, dist)
        files.append(rel)
        total += os.path.getsize(p)
        if n.endswith('.map'):
            problems.append(f'source map shipped: {rel}')
        if n.endswith(('.js', '.html', '.css')):
            txt = open(p, encoding='utf-8', errors='ignore').read()
            for pat in ['127.0.0.1', 'localhost:', '__THREE_GAME_TEST_HOOKS__ =']:
                if pat in txt and pat != '__THREE_GAME_TEST_HOOKS__ =':
                    problems.append(f'{rel} contains {pat!r}')
            if n == 'index.html' and re.search(r'(src|href)="/(?!/)', txt):
                problems.append('index.html uses absolute paths (needs relative base)')

with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for rel in sorted(files):
        z.write(os.path.join(dist, rel), rel)

zsize = os.path.getsize(out)
print(f'files: {len(files)}  unpacked: {total / 1e6:.2f} MB  zip: {zsize / 1e6:.2f} MB')
print(f'wrote {os.path.relpath(out, root)}')
if 'index.html' not in files:
    problems.append('index.html missing at the zip root')
for p in problems:
    print('PROBLEM:', p)
sys.exit(1 if problems else 0)
