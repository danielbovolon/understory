# Regenerates SOUND_CONCEPT in js/guide.js from docs/sonic-concept.md.
# ## headings -> h3, "- **term** — def" lists -> dl, numbered "1. **term** — def" -> dl, **x** -> b, paragraphs -> p.
import re, json
md = open('docs/sonic-concept.md').read().split('\n')
out, para, dl = [], [], []
def inl(t):
    t = t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', re.sub(r'(?<!\*)\*([^*]+?)\*(?!\*)', r'<i>\1</i>', t))
def flush():
    global para, dl
    if para: out.append('<p>' + inl(' '.join(para)) + '</p>'); para = []
    if dl: out.append('<dl>' + ''.join(f'<dt>{inl(a)}</dt><dd>{inl(b)}</dd>' for a, b in dl) + '</dl>'); dl = []
for line in md:
    if line.startswith('# '): continue
    if line.startswith('## '): flush(); out.append('<h3>' + inl(line[3:].strip()) + '</h3>'); continue
    m = re.match(r'^(?:- |\d+\. )\*\*(.+?)\*\*\s*—\s*(.*)$', line)
    if m:
        if para: p = para; para = []; out.append('<p>' + inl(' '.join(p)) + '</p>')
        dl.append((m.group(1), m.group(2))); continue
    if not line.strip(): flush(); continue
    if dl: flush()
    para.append(line.strip())
flush()
html = ''.join(out)
g = open('js/guide.js').read()
i = g.index('const SOUND_CONCEPT = '); j = g.index('";\n', i) + 3
g = g[:i] + 'const SOUND_CONCEPT = ' + json.dumps(html, ensure_ascii=False) + ';\n' + g[j:]
open('js/guide.js', 'w').write(g)
print(len(html))
