import pathlib

path = pathlib.Path('assets/jamaica-map.svg')
content = path.read_text()

# Fix 1: Remove conflicting inline style from root SVG element
content = content.replace(' style="height:38px;width:auto;display:block;"', '')

# Fix 2: Add 1px self-colored stroke to all fill paths to eliminate anti-aliasing gaps
content = content.replace('fill="url(#nig)" stroke="none"', 'fill="url(#nig)" stroke="url(#nig)" stroke-width="1"')

path.write_text(content)
print('SVG file fixed successfully')
print(f'File size: {len(content)} bytes')