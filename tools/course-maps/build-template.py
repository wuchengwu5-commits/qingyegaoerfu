"""Emit one map template into independent WeChat subpackages (no cross-package imports)."""
from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[2]
base=root/'qingye-miniprogram/miniprogram/packages'
shutil.copy2(root/'templates/map-ui/atlas-hud.js',root/'templates/course-map/atlas-hud.js')
for name in ['hole-map','sheshan-map','tianma-map','huakai-map','links-map','meilan-masters-map','meilan-nicklaus-map','qizhong-map','jiulongshan-map']:
 dest=base/name;dest.mkdir(exist_ok=True)
 for p in (root/'templates/course-map').iterdir():
  if p.is_file() and p.suffix in ['.js','.json','.wxml','.wxss']:shutil.copyfile(p,dest/p.name)
 shutil.copy2(root/'templates/map-ui/gps-maps.js',dest/'gps-maps.js')
# Map controls reference /assets/map-icons in the main package; avoid duplicating
# the same control PNGs in every independently loaded course subpackage.
print('Built shared map template for 9 course entries.')

# Continuous GPS map pages use the same template across the two courses.
import runpy
runpy.run_path(str(root/'tools/gps-atlas/build-template.py'))
