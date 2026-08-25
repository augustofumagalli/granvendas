@echo off
rem Roda a sincronizacao e guarda o resultado em sincronizacao.log
cd /d %~dp0
echo. >> sincronizacao.log
echo ===== %date% %time% ===== >> sincronizacao.log
node sincronizar.js >> sincronizacao.log 2>&1
