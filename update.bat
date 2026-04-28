@echo off
REM One-command update for Annotate on Windows
echo Pulling latest code...
git pull
echo.
echo Installing dependencies...
call npm install
echo.
echo Starting dev server...
npm run dev
