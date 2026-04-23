@echo off
REM Lance Chrome sur le Profile 7 avec remote debugging port 9222
REM A utiliser uniquement pour permettre a Claude Code de piloter ton Chrome authentifie
REM FERME Chrome completement avant de lancer ce script (sinon Chrome ignore le port)

echo Fermeture de Chrome existant...
taskkill /F /IM chrome.exe /T 2>nul
timeout /t 2 /nobreak >nul

echo Lancement de Chrome Profile 7 avec debug port 9222...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --profile-directory="Profile 7" --user-data-dir="C:\Users\takih\AppData\Local\Google\Chrome\User Data" --no-first-run --no-default-browser-check https://grist.playwubo.com/o/docs/cmTvfM75iZzS8eRsPAJdpy

echo.
echo Chrome lance. Claude peut maintenant s'y connecter.
echo Pour fermer cette session : ferme simplement Chrome.
