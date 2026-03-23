@echo off

:: 창이 닫히지 않도록 새 CMD 창에서 실행
if "%~1"=="RUN" goto :run
cmd /k "%~f0" RUN
exit /b 0

:run
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
    echo  Then restart this file.
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
    echo  [ERROR] Build output not found.
    echo  Please run [빌드.bat] first.
    echo.
    pause
    exit /b 1
)
echo  [OK] Build ready.

:: STEP 3-1: Check .env.local (API Key)
if not exist ".env.local" (
    echo  [ERROR] .env.local 파일이 없습니다.
    echo  프로젝트 루트에 .env.local 파일을 생성하고
    echo  아래 내용을 입력하세요:
    echo.
    echo    GEMINI_API_KEY=your_api_key_here
    echo.
    echo  API 키 발급: https://aistudio.google.com/app/apikey
    echo.
    pause
    exit /b 1
)
echo  [OK] .env.local found.

:: STEP 4: Launch
echo.
echo  [>>] Server starting at http://localhost:%PORT%
echo  [--] Press Ctrl+C to stop.
echo.

start /b cmd /c "timeout /t 4 /nobreak > nul && start http://localhost:%PORT%"

npm start

echo.
echo  [INFO] Server stopped.
pause
