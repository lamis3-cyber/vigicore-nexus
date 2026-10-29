import pandas as pd
import numpy as np
import pickle
import os
import json
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
from sqlalchemy import text
from bot.services.memory_service import AsyncSessionLocal
import asyncio
from utils.logger import get_logger

logger = get_logger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "vigibot_ml_model.pkl")
CSV_PATH = os.path.join(os.path.dirname(__file__), "../data/devices.csv")

# ============================================
# MAPPING FAILURE MODE → PROBLEM TYPE
# ============================================

FAILURE_MODE_MAP = {
    "Mechanical/Software": "HARDWARE_FAILURE",
    "Mechanical": "HARDWARE_FAILURE",
    "Software": "SOFTWARE_ISSUE",
    "Human Error": "HUMAN_ERROR",
    "Consumable": "CONSUMABLE_ISSUE",
    "Environmental": "ENVIRONMENTAL",
    "Electrical": "HARDWARE_FAILURE",
    "Calibration": "SOFTWARE_ISSUE",
}

SEVERITY_MAP = {
    "Minor": "MINOR",
    "Moderate": "MODERATE",
    "High": "HIGH",
    "Critical": "CRITICAL",
    "Fatal": "FATAL",
}

# ============================================
# CHARGER DONNÉES CSV
# ============================================

def load_csv_data():
    """Charger et nettoyer le CSV des machines"""
    try:
        df = pd.read_csv(CSV_PATH, sep=';', encoding='latin-1')
        df = df.dropna(subset=['Device Name', 'Typical Incident'])
        df = df[df['Device Name'].str.strip() != '']

        # Créer texte combiné pour l'entraînement
        df['text'] = (
            df['Device Name'].fillna('') + ' ' +
            df['Category'].fillna('') + ' ' +
            df['Department'].fillna('') + ' ' +
            df['Typical Incident'].fillna('') + ' ' +
            df['Failure Mode'].fillna('')
        )

        # Mapper failure mode vers problem type
        df['problem_type'] = df['Failure Mode'].map(
            lambda x: next((v for k, v in FAILURE_MODE_MAP.items() if k.lower() in str(x).lower()), 'UNKNOWN')
        )

        # Mapper severity
        df['severity_mapped'] = df['Severity'].map(
            lambda x: next((v for k, v in SEVERITY_MAP.items() if k.lower() in str(x).lower()), 'MODERATE')
        )

        df = df[df['problem_type'] != 'UNKNOWN']
        logger.info(f"CSV loaded: {len(df)} valid records")
        return df

    except Exception as e:
        logger.error(f"CSV load error: {e}")
        raise

# ============================================
# CHARGER DONNÉES POSTGRESQL (rapports réels)
# ============================================

async def load_db_data():
    """Charger les rapports réels depuis PostgreSQL"""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT
                        r.description,
                        r.severity::text,
                        d.model as device_model,
                        d.manufacturer,
                        r.type::text
                    FROM reports r
                    LEFT JOIN devices d ON d.id = r."deviceId"
                    WHERE r.description IS NOT NULL
                    AND length(r.description) > 10
                """)
            )
            rows = result.fetchall()

        records = []
        for row in rows:
            text_combined = f"{row[0]} {row[2] or ''} {row[3] or ''} {row[4] or ''}"
            records.append({
                'text': text_combined,
                'severity_mapped': row[1],
                'problem_type': detect_problem_type_from_text(row[0])
            })

        logger.info(f"DB loaded: {len(records)} real reports")
        return pd.DataFrame(records)

    except Exception as e:
        logger.error(f"DB load error: {e}")
        return pd.DataFrame()

def detect_problem_type_from_text(description: str) -> str:
    """Détecter le type de problème depuis le texte"""
    desc = description.lower()
    if any(w in desc for w in ['câble', 'cable', 'inversé', 'manipulation', 'erreur', 'mauvais', 'wrong']):
        return 'HUMAN_ERROR'
    elif any(w in desc for w in ['composant', 'usure', 'surchauffe', 'overheat', 'panne', 'failure', 'hardware']):
        return 'HARDWARE_FAILURE'
    elif any(w in desc for w in ['firmware', 'logiciel', 'software', 'calibration', 'calibrage', 'update']):
        return 'SOFTWARE_ISSUE'
    elif any(w in desc for w in ['réactif', 'reactif', 'lot', 'expiré', 'expired', 'consommable']):
        return 'CONSUMABLE_ISSUE'
    elif any(w in desc for w in ['température', 'temperature', 'humidité', 'humidity', 'vibration']):
        return 'ENVIRONMENTAL'
    return 'HARDWARE_FAILURE'

# ============================================
# ENTRAÎNER LE MODÈLE
# ============================================

async def train():
    """Entraîner le modèle ML sur CSV + données réelles"""
    logger.info("🤖 Starting VigiBot ML training...")

    # 1. Charger données CSV
    csv_df = load_csv_data()

    # 2. Charger données réelles PostgreSQL
    db_df = await load_db_data()

    # 3. Combiner les deux sources
    if not db_df.empty:
        combined_df = pd.concat([csv_df[['text', 'problem_type', 'severity_mapped']], db_df], ignore_index=True)
        logger.info(f"Combined dataset: {len(combined_df)} records (CSV + DB)")
    else:
        combined_df = csv_df[['text', 'problem_type', 'severity_mapped']]
        logger.info(f"Using CSV only: {len(combined_df)} records")

    # 4. Préparer features et labels
    X = combined_df['text'].fillna('')
    y = combined_df['problem_type']

    # 5. Split train/test
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    # 6. Pipeline TF-IDF + Random Forest
    pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(
            max_features=5000,
            ngram_range=(1, 2),
            stop_words=None,
            min_df=1
        )),
        ('clf', RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            random_state=42,
            class_weight='balanced'
        ))
    ])

    # 7. Entraîner
    pipeline.fit(X_train, y_train)

    # 8. Évaluer
    y_pred = pipeline.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    report = classification_report(y_test, y_pred, output_dict=True)

    logger.info(f"✅ Model trained — Accuracy: {accuracy:.2%}")
    logger.info(f"Report: {json.dumps(report, indent=2)}")

    # 9. Sauvegarder le modèle
    model_data = {
        'pipeline': pipeline,
        'accuracy': accuracy,
        'classes': list(pipeline.classes_),
        'report': report,
        'total_samples': len(combined_df)
    }
    with open(MODEL_PATH, 'wb') as f:
        pickle.dump(model_data, f)

    logger.info(f"✅ Model saved to {MODEL_PATH}")

    # 10. Sauvegarder version en base
    from bot.models.ml_model import save_model_version
    await save_model_version(
        "ML",
        round(accuracy * 100, 2),
        {
            "total_samples": len(combined_df),
            "csv_samples": len(csv_df),
            "db_samples": len(db_df),
            "classes": list(pipeline.classes_),
            "accuracy": accuracy
        }
    )

    return {
        "accuracy": accuracy,
        "total_samples": len(combined_df),
        "classes": list(pipeline.classes_)
    }

# ============================================
# PRÉDIRE AVEC LE MODÈLE ML
# ============================================

def predict_with_ml(description: str, device_model: str = "") -> dict:
    """Prédire le type de problème avec le modèle ML"""
    try:
        if not os.path.exists(MODEL_PATH):
            return None

        with open(MODEL_PATH, 'rb') as f:
            model_data = pickle.load(f)

        pipeline = model_data['pipeline']
        text = f"{description} {device_model}"

        # Prédiction + probabilités
        prediction = pipeline.predict([text])[0]
        probabilities = pipeline.predict_proba([text])[0]
        confidence = float(max(probabilities))

        return {
            "problem_type": prediction,
            "confidence": confidence,
            "all_probabilities": {
                cls: float(prob)
                for cls, prob in zip(pipeline.classes_, probabilities)
            },
            "model_accuracy": model_data.get('accuracy', 0),
            "modelType": "ML"
        }

    except Exception as e:
        logger.error(f"ML prediction error: {e}")
        return None

# ============================================
# IMPORTER MACHINES EN BASE
# ============================================

async def import_devices_to_db():
    """Importer les machines du CSV en base PostgreSQL"""
    try:
        csv_df = load_csv_data()
        inserted = 0
        skipped = 0

        async with AsyncSessionLocal() as session:
            for _, row in csv_df.iterrows():
                device_id = str(row.get('Device ID', '')).strip()
                device_name = str(row.get('Device Name', '')).strip()

                if not device_id or not device_name:
                    continue

                # Vérifier si déjà existant
                existing = await session.execute(
                    text('SELECT id FROM devices WHERE "serialNumber" = :sn'),
                    {"sn": device_id}
                )
                if existing.fetchone():
                    skipped += 1
                    continue

                await session.execute(
                    text("""
                        INSERT INTO devices (id, "serialNumber", model, manufacturer, status, "createdAt", "updatedAt")
                        VALUES (gen_random_uuid(), :sn, :model, :manufacturer, 'ACTIVE', now(), now())
                    """),
                    {
                        "sn": device_id,
                        "model": device_name,
                        "manufacturer": str(row.get('Manufacturer Examples', 'Unknown')).strip()
                    }
                )
                inserted += 1

            await session.commit()

        logger.info(f"Devices imported: {inserted} inserted, {skipped} skipped")
        return {"inserted": inserted, "skipped": skipped, "total": len(csv_df)}

    except Exception as e:
        logger.error(f"Import devices error: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(train())
