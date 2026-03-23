@echo off
cd /d "%~dp0"

set PORT=3001
set NEXT_TELEMETRY_DISABLED=1
set NODE_ENV=production

echo.
echo  =========================================
echo   EduSplit AI  -  Production Server
echo   http://localhost:%PORT%
echo  =========================================
echo.

:: STEP 1: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Node.js not found.
    echo  Install Node.js LTS from https://nodejs.org
    echo  Then run this file again.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER%

:: STEP 2: Install dependencies if missing
if not exist "node_modules" (
    echo  [..] Installing dependencies...
    echo.
    npm install --production
    if %ERRORLEVEL% NEQ 0 (
        echo  [ERROR] npm install failed.
        echo.
        pause
        exit /b 1
    )
    echo  [OK] Dependencies installed.
    echo.
)

:: STEP 3: Check production build
if not exist ".next" (
    echo  [ERROR] Build not found. Run [build.bat] first.
    echo.
    pause
    exit /b 1
)
echo  [OK] Build ready.

:: STEP 3-1: Check .env.local
if not exist ".env.local" (
    echo  [ERROR] .env.local file is missing!
    echo.
    echo  Create a file named [.env.local] in this folder with:
    echo    GEMINI_API_KEY=your_api_key_here
    echo.
    echo  Get API key: https://aistudio.google.com/app/apikey
    echo.
    pause
    exit /b 1
)
echo  [OK] .env.local found.

:: STEP 4: Launch
echo.
echo  [>>] Starting server at http://localhost:%PORT%
echo  [--] Press Ctrl+C to stop.
echo.

start /b cmd /c "timeout /t 4 /nobreak > nul && start http://localhost:%PORT%"

npm start

echo.
echo  [INFO] Server stopped.
pause
