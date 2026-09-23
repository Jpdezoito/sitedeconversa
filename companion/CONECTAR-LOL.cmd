@echo off
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Instale Node.js 22 ou superior pelo site https://nodejs.org e abra novamente.
  pause
  exit /b 1
)
node.exe connect.mjs
echo.
pause
