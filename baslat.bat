@echo off
chcp 65001 >nul
title Projection ^& Display Design Studio - Baslatici

echo ========================================================
echo   PROJECTION ^& DISPLAY DESIGN STUDIO BASLATILIYOR...
echo ========================================================

:: 1. Backend API Sunucusunu Baslat (Port 8000)
echo [1/3] Backend API baslatiliyor (http://localhost:8000)...
start "AV Studio - Backend API (Port 8000)" cmd /k "cd /d "%~dp0backend" && .\.venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000"

:: 2. Frontend Web Sunucusunu Baslat (Port 5173)
echo [2/3] Frontend Web baslatiliyor (http://localhost:5173)...
start "AV Studio - Frontend Web (Port 5173)" cmd /k "cd /d "%~dp0frontend" && npm run dev -- --port 5173"

:: 3. Tarayiciyi Ac
echo [3/3] Tarayici aciliyor...
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo Sistem baslatildi! Bu pencereyi kapatabilirsiniz.
timeout /t 2 /nobreak >nul
