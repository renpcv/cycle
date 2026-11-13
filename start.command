#!/bin/sh
# Double-click (Mac) to run the cycle page locally: starts the server and opens it in the browser.
cd "$(dirname "$0")"
(sleep 1; open http://localhost:8080) &
node serve.mjs
