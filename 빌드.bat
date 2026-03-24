@echo off
if "%~1"=="RUN" goto :run
start "EduSplit AI - Build" cmd /k "%~f0" RUN
exit /b 0
:run
cd /d "%~dp0"

set NEXT_TELEMETRY_DISABLED=1

echo.
echo  =========================================
echo   EduSplit AI  -  Production Build
echo  =========================================
echo.

:: STEP 1: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Node.js not found.
    echo  Install Node.js LTS from https://nodejs.org
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
    npm install
    if %ERRORLEVEL% NEQ 0 (
        echo  [ERROR] npm install failed.
        echo.
        pause
        exit /b 1
    )
    echo  [OK] Dependencies installed.
    echo.
)

:: STEP 3: Build
echo  [..] Building for production...
echo.
npm run build

echo.
if %ERRORLEVEL% EQU 0 (
    echo  [SUCCESS] Build complete!
    echo  Run [Start.bat] to launch the server.
) else (
    echo  [FAILED] Build failed. Exit code: %ERRORLEVEL%
    echo  Check the errors above.
)
echo.
pause