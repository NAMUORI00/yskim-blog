@echo off
setlocal

set "INSTALL_URL=https://yskim-blog.pages.dev/downloads/hugo-git-publisher/install.ps1"
set "INSTALL_SCRIPT=%TEMP%\hugo-git-publisher-install.ps1"

echo Downloading Hugo Git Publisher installer...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri '%INSTALL_URL%' -OutFile '%INSTALL_SCRIPT%'"
if errorlevel 1 (
  echo Failed to download installer.
  pause
  exit /b 1
)

echo Running installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_SCRIPT%"
if errorlevel 1 (
  echo Installer failed.
  pause
  exit /b 1
)

echo Done.
pause
