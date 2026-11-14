#!/usr/bin/python3
# coding: utf-8
"""Open the local library and let the user's login session manage its server."""
import argparse
import fcntl
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import time
from urllib.parse import urlparse
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
LABEL = 'com.qingye.course-art-library'
DOMAIN = f'gui/{os.getuid()}'
SERVICE = f'{DOMAIN}/{LABEL}'
PLIST = Path.home() / 'Library/LaunchAgents' / (LABEL + '.plist')
LOGS = Path.home() / 'Library/Logs/QingyeCourseLibrary'
BASE = 'http://127.0.0.1:8769/'


def ready():
    try:
        with urlopen(BASE, timeout=2) as response:
            return '<title>青野 · 球道图库</title>' in response.read(2048).decode('utf-8')
    except (OSError, ValueError):
        return False


def launchctl(*args):
    return subprocess.run(['/bin/launchctl', *args], capture_output=True, text=True)


def ensure_running():
    if not (ROOT / '球道图库.sqlite3').is_file():
        raise RuntimeError('未找到球道图库数据库，请确认图库文件夹没有被移动。')
    LOGS.mkdir(parents=True, exist_ok=True)
    PLIST.parent.mkdir(parents=True, exist_ok=True)
    # Multiple clicks must share one service and one listener.
    with (LOGS / 'launcher.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        config = {
            'Label': LABEL,
            'ProgramArguments': ['/usr/bin/python3', '-u', str(ROOT / 'server.py')],
            'WorkingDirectory': str(ROOT),
            'RunAtLoad': True,
            'KeepAlive': {'SuccessfulExit': False},
            'ThrottleInterval': 15,
            'ProcessType': 'Background',
            'EnvironmentVariables': {'PYTHONDONTWRITEBYTECODE': '1'},
            'StandardOutPath': str(LOGS / 'server.log'),
            'StandardErrorPath': str(LOGS / 'server-error.log'),
        }
        data = plistlib.dumps(config)
        loaded = launchctl('print', SERVICE).returncode == 0
        changed = not PLIST.exists() or PLIST.read_bytes() != data
        if changed:
            if loaded:
                result = launchctl('bootout', SERVICE)
                if result.returncode:
                    raise RuntimeError('图库后台服务更新失败：' + result.stderr.strip())
                loaded = False
            temporary = PLIST.with_suffix('.plist.tmp')
            temporary.write_bytes(data)
            temporary.chmod(0o644)
            temporary.replace(PLIST)
        if not loaded:
            result = launchctl('bootstrap', DOMAIN, str(PLIST))
            if result.returncode and launchctl('print', SERVICE).returncode:
                raise RuntimeError('图库后台服务启动失败：' + result.stderr.strip())
        if not ready():
            launchctl('kickstart', SERVICE)
        for _ in range(100):
            if ready():
                return
            time.sleep(.2)
        raise RuntimeError('图库暂未启动成功，请查看“资料库/Logs/QingyeCourseLibrary”中的运行记录。')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-open', action='store_true')
    parser.add_argument('--url', default=BASE)
    args = parser.parse_args()
    url = urlparse(args.url)
    if url.scheme != 'http' or url.netloc != '127.0.0.1:8769':
        parser.error('只支持本机球道图库地址')
    try:
        ensure_running()
        if not args.no_open:
            subprocess.run(['/usr/bin/open', args.url], check=True)
        print('青野球道图库已就绪。')
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
