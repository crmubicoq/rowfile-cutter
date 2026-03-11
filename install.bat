@echo off
set "NODE_DIR=C:\Users\Administrator\Desktop\REC_Maker_CRM_low\nodejs"
set "PATH=%NODE_DIR%;%PATH%"
cd /d "D:\rowfile cutter"
node --version > "C:\Users\Administrator\AppData\Local\Temp\install_out.txt" 2>&1
npm --version >> "C:\Users\Administrator\AppData\Local\Temp\install_out.txt" 2>&1
npm install --legacy-peer-deps >> "C:\Users\Administrator\AppData\Local\Temp\install_out.txt" 2>&1
echo EXIT_CODE=%ERRORLEVEL% >> "C:\Users\Administrator\AppData\Local\Temp\install_out.txt"
