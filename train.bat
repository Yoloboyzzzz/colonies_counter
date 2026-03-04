@echo off
echo ============================================
echo  Colony Counter - Train Model
echo ============================================
echo.
echo Options:
echo   1) Train from scratch (yolov8n base, 100 epochs)
echo   2) Fine-tune existing best.pt (100 epochs)
echo   3) Resume last interrupted training
echo   4) Custom (edit train_model.py flags)
echo.
set /p choice="Choose [1-4]: "

cd backend
call venv\Scripts\activate

if "%choice%"=="1" (
    python train_model.py --epochs 100
) else if "%choice%"=="2" (
    python train_model.py --epochs 100 --finetune
) else if "%choice%"=="3" (
    python train_model.py --resume
) else (
    python train_model.py %*
)

echo.
pause
