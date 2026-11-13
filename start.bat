@echo off
rem Double-click to run the cycle page locally: starts the server and opens it in the browser.
cd /d "%~dp0"
start "" http://localhost:8080
node serve.mjs
