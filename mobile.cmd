@echo off
setlocal
if "%~1"=="" (
  echo Usage: mobile.cmd install --frozen-lockfile
  echo        mobile.cmd test
  echo        mobile.cmd run build
  echo        mobile.cmd run preview --port 4173 --strictPort
  exit /b 0
)
set "FISHING_NODE_ROOT=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node"
if exist "%FISHING_NODE_ROOT%\bin\node.exe" if exist "%FISHING_NODE_ROOT%\node_modules\pnpm\bin\pnpm.cjs" goto bundled
where node >nul 2>nul
if errorlevel 1 goto missing
where pnpm >nul 2>nul
if errorlevel 1 goto missing
pushd "%~dp0mobile_pwa"
if errorlevel 1 exit /b 1
call pnpm %*
set "FISHING_EXIT=%ERRORLEVEL%"
popd
exit /b %FISHING_EXIT%
:bundled
set "PATH=%FISHING_NODE_ROOT%\bin;%PATH%"
pushd "%~dp0mobile_pwa"
if errorlevel 1 exit /b 1
"%FISHING_NODE_ROOT%\bin\node.exe" "%FISHING_NODE_ROOT%\node_modules\pnpm\bin\pnpm.cjs" %*
set "FISHING_EXIT=%ERRORLEVEL%"
popd
exit /b %FISHING_EXIT%
:missing
echo Node.js 24 and pnpm 10.28.2 are required. Install them or restore the Codex runtime.
exit /b 1
