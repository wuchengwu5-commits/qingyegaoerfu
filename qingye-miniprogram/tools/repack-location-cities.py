"""Losslessly repack the existing city boundary bytes to preserve main-package headroom."""
from pathlib import Path
import base64
import re
import zlib

path = Path(__file__).resolve().parents[1] / 'miniprogram/packages/location-data/location-cities-data.js'
source = path.read_text()
match = re.search(r"const base64='([^']+)'", source)
packed = base64.b64decode(match[1])
raw = zlib.decompress(packed, 31)
compressor = zlib.compressobj(9, zlib.DEFLATED, 31, 8, zlib.Z_FILTERED)
optimized = compressor.compress(raw) + compressor.flush()
assert zlib.decompress(optimized, 31) == raw
if len(optimized) < len(packed):
    replacement = base64.b64encode(optimized).decode('ascii')
    path.write_text(source[:match.start(1)] + replacement + source[match.end(1):])
    print('Saved', len(match[1]) - len(replacement), 'bytes; decoded data unchanged.')
else:
    print('Already packed; decoded data unchanged.')
