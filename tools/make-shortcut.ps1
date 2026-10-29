# Creates a "Study Timer" shortcut on the desktop that opens the app with no terminal window.
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File tools\make-shortcut.ps1
$root = Split-Path $PSScriptRoot -Parent
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electron)) { throw "Electron not found. Run 'npm install' in $root first." }

# Electron writes the shortcut itself, because only it can tag the shortcut with the app's ID.
& $electron (Join-Path $PSScriptRoot 'make-shortcut.js') | Write-Output
