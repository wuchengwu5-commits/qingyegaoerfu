#!/bin/zsh
cd "${0:A:h}"
if curl --silent --fail http://127.0.0.1:8769/api/config >/dev/null 2>&1; then
  open 'http://127.0.0.1:8769/'
else
  /usr/bin/python3 server.py --open
fi
