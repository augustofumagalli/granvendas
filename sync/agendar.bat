@echo off
rem Agenda a sincronizacao automatica no Windows: todo dia as 07:00.
rem Rode este arquivo UMA vez (duplo clique). Para mudar o horario, edite /ST abaixo.
schtasks /Create /F /SC DAILY /ST 07:00 /TN "GranVendas Sincronizacao" /TR "\"%~dp0sincronizar.bat\""
if %errorlevel%==0 (
  echo.
  echo Tarefa criada! A sincronizacao roda todo dia as 07:00.
  echo O resultado de cada rodada fica em sincronizacao.log nesta pasta.
) else (
  echo.
  echo Nao consegui criar a tarefa. Tente clicar com o botao direito e "Executar como administrador".
)
pause
