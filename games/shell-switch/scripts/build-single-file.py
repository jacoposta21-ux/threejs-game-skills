"""Inline dist/ JS and CSS into one self-contained shell-switch.html (opens via file://)."""
import glob
import re

html = open('dist/index.html').read()
js = open(glob.glob('dist/assets/*.js')[0]).read().replace('</script', '<\\/script')
css = open(glob.glob('dist/assets/*.css')[0]).read()
html = re.sub(r'<script type="module" crossorigin src="[^"]+"></script>', '', html)
html = re.sub(r'<link rel="stylesheet" crossorigin href="[^"]+">', '', html)
# Playgama Bridge stays the first script in <head>, inlined.
bridge = open('dist/playgama-bridge.js').read().replace('</script', '<\\/script')
html = html.replace('<script src="./playgama-bridge.js"></script>', f'<script>{bridge}</script>')
html = html.replace('</head>', f'<style>{css}</style>\n</head>')
html = html.replace('</body>', f'<script type="module">{js}</script>\n</body>')
open('shell-switch.html', 'w').write(html)
print('wrote shell-switch.html', len(html), 'bytes')
