#!/usr/bin/env python3
"""Bundle dist/ into one self-contained file: release/too-slow.html (run after `npm run build`)."""
import base64
import os
import re

d = 'dist'
html = open(f'{d}/index.html').read()
css_path = re.search(r'href="\./(assets/[^"]+\.css)"', html).group(1)
js_path = re.search(r'src="\./(assets/[^"]+\.js)"', html).group(1)
css = open(f'{d}/{css_path}').read()


def font(match):
    name = os.path.basename(match.group(1))
    if not name.endswith('.woff2'):
        return match.group(0)
    data = base64.b64encode(open(f'{d}/assets/{name}', 'rb').read()).decode()
    return f'url(data:font/woff2;base64,{data})'


css = re.sub(r'url\(([^)]+)\)', lambda m: font(m) if 'woff' in m.group(1) else m.group(0), css)
css = re.sub(r',\s*url\([^)]*\.woff\)\s*format\("woff"\)', '', css)
js = open(f'{d}/{js_path}').read().replace('</script', '<\\/script')
html = re.sub(r'<link rel="stylesheet"[^>]*>', lambda m: '<style>' + css + '</style>', html)
html = re.sub(r'<script type="module"[^>]*></script>', '', html)
i = html.rindex('</body>')
html = html[:i] + '<script type="module">' + js + '</script>' + html[i:]
os.makedirs('release', exist_ok=True)
open('release/too-slow.html', 'w').write(html)
print(f'release/too-slow.html  {len(html) // 1024} KB')
