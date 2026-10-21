@echo off
rem Programmable nonlinear photonics page: start a local server and open it in Microsoft Edge.
rem (Browsers refuse to run the page's JavaScript modules straight from a file, so a tiny local server is used.)
setlocal
set PORT=8137
set PYEXE=%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe
if not exist "%PYEXE%" set PYEXE=py
start "NTT Forum page server (close this window to stop)" /min "%PYEXE%" "%~dp0serve.py" "%~dp0docs" %PORT%
rem wait until the server answers (at most about 20 s) instead of guessing
set /a TRIES=0
:wait
curl -s -o nul "http://127.0.0.1:%PORT%/" && goto open
set /a TRIES+=1
if %TRIES% geq 20 goto open
timeout /t 1 /nobreak >nul
goto wait
:open
start "" msedge "http://127.0.0.1:%PORT%/?motion=full"
