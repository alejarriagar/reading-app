$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Push-Location frontend
if (-not (Test-Path "node_modules")) { npm.cmd install }
npm.cmd run build
$buildCode = $LASTEXITCODE
Pop-Location
if ($buildCode -ne 0) { throw "Falló la compilación del frontend." }

Write-Host ""
Write-Host "Atlas disponible en http://127.0.0.1:8000  (Ctrl+C para detener)"
Start-Process -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList '/c timeout /t 3 >nul & start "" http://127.0.0.1:8000'
& .\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000