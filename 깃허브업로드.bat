@echo off
cd /d "%~dp0"

echo.
echo  =========================================
echo   EduSplit AI  -  GitHub Push
echo  =========================================
echo.
echo  [INFO] Browser will open for GitHub login.
echo  [INFO] Please sign in to authorize the push.
echo.

git push -u origin main

echo.
if %ERRORLEVEL% EQU 0 (
    echo  [SUCCESS] Upload complete!
    echo  https://github.com/crmubicoq/rowfile-cutter
) else (
    echo  [FAILED] Push failed. Exit code: %ERRORLEVEL%
)
echo.
pause