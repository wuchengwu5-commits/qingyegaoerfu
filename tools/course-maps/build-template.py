"""Emit one map template into independent WeChat subpackages (no cross-package imports)."""
from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[2]
base=root/'qingye-miniprogram/miniprogram/packages'
for name in ['hole-map','sheshan-map','tianma-map','huakai-map','links-map','meilan-masters-map','meilan-nicklaus-map','qizhong-map']:
 dest=base/name;dest.mkdir(exist_ok=True)
 for p in (root/'templates/course-map').iterdir():
  if p.is_file() and p.suffix in ['.js','.json','.wxml','.wxss']:shutil.copyfile(p,dest/p.name)
 if name!='hole-map':shutil.copytree(base/'hole-map/icons',dest/'icons',dirs_exist_ok=True)
print('Built shared map template for 8 course entries.')
