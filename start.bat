@echo off
echo ============================================
echo  Colony Counter - Starting
echo ============================================

echo Starting backend (FastAPI + YOLOv8)...
start "Colony Counter Backend" cmd /k "cd backend && venv\Scripts\activate && python -m uvicorn main:app --reload --port 8000"

timeout /t 3 /nobreak >nul

echo Starting frontend (React)...
start "Colony Counter Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ============================================
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:5173
echo.
echo  Open http://localhost:5173 in your browser
echo ============================================
timeout /t 5 /nobreak >nul
start http://localhost:5173
