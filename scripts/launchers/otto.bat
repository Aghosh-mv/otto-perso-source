@echo off
cd /d "%~dp0"
if not exist db\custom.db (
  echo Initializing database...
  mkdir db 2>nul
  call npx prisma db push --accept-data-loss
)
echo Starting Otto...
start /b cmd /c "set PORT=3000 && set NODE_ENV=production && node server.js"
echo Waiting for Otto to wake up...
timeout /t 5 /nobreak >nul
echo Opening browser...
start http://localhost:3000
echo.
echo Otto Perso is running.
echo Open: http://localhost:3000
echo Close this window to stop Otto.
pause >nul
