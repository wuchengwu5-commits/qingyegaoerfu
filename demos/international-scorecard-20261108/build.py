from pathlib import Path
p = Path(__file__).resolve().parent
html = (p/'src/template.html').read_text()
styles = '\n'.join((p/'src'/f).read_text() for f in ['base.css','app.css','members.css'])
scripts = '\n'.join((p/'src'/f).read_text() for f in ['engine.js','members.js','app.js'])
html = html.replace('/*STYLES*/', styles).replace('/*SCRIPT*/', scripts)
(p/'dist/index.html').write_text(html)
print('Built standalone HTML:', len(html.encode()), 'bytes')
