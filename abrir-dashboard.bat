@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Iniciando servidor local do dashboard...
start "" "http://127.0.0.1:8080/exemplo.html"
node scripts\serve.js
