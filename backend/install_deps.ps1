# Instalar dependencias básicas
.\venv\Scripts\python.exe -m pip install uvicorn fastapi python-dotenv groq duckduckgo-search pydantic-settings --no-warn-script-location

# Intentar instalar las más pesadas por separado
.\venv\Scripts\python.exe -m pip install sentence-transformers --no-warn-script-location

# Supabase suele dar problemas con pyiceberg en Python 3.14, intentamos instalarlo solo
.\venv\Scripts\python.exe -m pip install "supabase<2.26.0" --no-warn-script-location
