@echo off
cd /d "%~dp0"
echo CLPS Dashboard unter http://localhost:8000
python -m http.server 8000
pause
