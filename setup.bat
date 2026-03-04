@echo off
echo ============================================
echo  Colony Counter - Setup
echo ============================================

echo.
echo [1/2] Setting up Python backend...
cd backend

python -m venv venv
call venv\Scripts\activate
pip install -r requirements.txt

echo.
echo [2/2] Setting up React frontend...
cd ..\frontend
npm install

echo.
echo ============================================
echo  Setup complete!
echo  Run start.bat to launch the application.
echo ============================================
pause
