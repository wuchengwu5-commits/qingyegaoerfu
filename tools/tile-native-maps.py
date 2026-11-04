"""Lossless JPEG coefficient crops; keep original pixels/coordinates and a 16px seam guard."""
from pathlib import Path
import json, subprocess, hashlib, shutil
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'qingye-miniprogram/miniprogram'
ASSETS = ROOT / 'qingye-miniprogram/cloud-assets/media-v1'
BACKUP = ROOT / 'outputs/package-quality-2026-11-03/before/images'
JPEGTRAN = Path('/Users/wuchengwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/bin/jpegtran')
report = []
for package in (BASE / 'packages').iterdir():
    if not (package / 'course-config.js').exists():
        continue
    manifest = {}
    originals = list(package.glob('*.jpg'))
    originals += [BASE / p.relative_to(BACKUP) for p in (BACKUP / package.relative_to(BASE)).glob('*.jpg') if not (BASE / p.relative_to(BACKUP)).exists()]
    for original in originals:
        saved = BACKUP / original.relative_to(BASE)
        source = saved if saved.exists() else original
        if source.stat().st_size <= 200 * 1024:
            continue
        if not saved.exists():
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(original, saved)
        with Image.open(saved) as image:
            width, height = image.size
        dest = ASSETS / package.relative_to(BASE) / (original.stem + '-tiles')
        dest.mkdir(parents=True, exist_ok=True)
        tiles = []
        for old in dest.glob('*.jpg'):
            old.unlink()  # Only this script's generated crops.
        def emit(x, y, w, h):
            left, top = max(0, x - 16), max(0, y - 16)
            right, bottom = min(width, x+w+16), min(height, y+h+16)
            target = dest / f'{x}-{y}.jpg'
            subprocess.run([str(JPEGTRAN), '-copy', 'none', '-optimize', '-progressive', '-crop', f'{right-left}x{bottom-top}+{left}+{top}', '-outfile', str(target), str(saved)], check=True)
            if target.stat().st_size > 192 * 1024:
                target.unlink()
                if w >= h:
                    split = (w//2//16)*16
                    emit(x,y,split,h); emit(x+split,y,w-split,h)
                else:
                    split = (h//2//16)*16
                    emit(x,y,w,split); emit(x,y+split,w,h-split)
                return
            tiles.append({'src': '/' + str(target.relative_to(ASSETS)), 'x': x, 'y': y, 'width': w, 'height': h, 'left': left, 'top': top})
        for y in range(0, height, 1024):
            for x in range(0, width, 1024):
                emit(x,y,min(1024,width-x),min(1024,height-y))
        manifest['/' + str(original.relative_to(BASE))] = {'width': width, 'height': height, 'tiles': tiles}
        report.append({'source': str(original.relative_to(BASE)), 'sha256': hashlib.sha256(saved.read_bytes()).hexdigest(), 'width': width, 'height': height, 'beforeBytes': saved.stat().st_size, 'afterBytes': sum((ASSETS / t['src'].lstrip('/')).stat().st_size for t in tiles), 'tiles': len(tiles)})
        # Original remains in the backup outside the upload root.
        if original.exists():
            original.unlink()
    (package / 'image-tiles.js').write_text('module.exports=' + json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + ';\n')
(ROOT / 'outputs/package-quality-2026-11-03/map-tiles.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False, indent=2))
