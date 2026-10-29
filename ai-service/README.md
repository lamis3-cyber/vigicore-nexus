# VigiCore — Service d'IA (`ai-service`)

FastAPI (Python 3.12). Port **8000**. Docs interactives : `http://localhost:8000/docs`.

## Lancer
```bash
cp .env.example .env
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
Redis (voir `docker-compose.dev.yml` à la racine) est nécessaire pour VigiBot.

## Structure
```
main.py           application FastAPI + montage des routes
routers/          /ai/scoring · /ai/patterns · /ai/insights
services/         logique de scoring, détection de patterns, insights
bot/              VigiBot
  routers/        /bot/chat · analyze · predict · alerts · knowledge · admin
  services/       LLM, mémoire, base de connaissances, prédiction, alertes proactives
  models/         modèle ML (vigibot_ml_model.pkl) + script d'entraînement
  data/           devices.csv, base de connaissances
  crons/          tâches planifiées
utils/            logger
```
