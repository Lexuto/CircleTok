@echo off
cd /d "%~dp0"
call venv\Scripts\activate
python -m moderator_bot.main
pause