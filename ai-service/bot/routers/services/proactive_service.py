from datetime import datetime, timedelta
from sqlalchemy import text
from bot.services.memory_service import AsyncSessionLocal
from bot.services.prediction_service import predict_device_failure
from utils.logger import get_logger

logger = get_logger(__name__)

# ============================================
# VÉRIFICATION ALERTES PROACTIVES
# ============================================

async def check_device_risks():
    """Vérifier les risques de pannes sur tous les devices actifs"""
    try:
        async with AsyncSessionLocal() as session:
            # Récupérer tous les devices actifs avec leur orgId
            result = await session.execute(
                text("""
                    SELECT d.id, d."orgId", d.model
                    FROM devices d
                    WHERE d.status = 'ACTIVE'
                """)
            )
            devices = result.fetchall()

        for device in devices:
            deviceId, orgId, model = str(device[0]), str(device[1]), device[2]
            prediction = await predict_device_failure(deviceId, "FR")

            if prediction.get("riskLevel") in ["HIGH", "CRITICAL"]:
                await create_proactive_alert(
                    orgId=orgId,
                    deviceId=deviceId,
                    reportId=None,
                    alert_type="PANNE_RISK",
                    message=f"⚠️ Risque {prediction['riskLevel']} détecté sur {model} — Score: {prediction['riskScore']}/100",
                    confidence=prediction["confidence"]
                )
                logger.info(f"Proactive alert created for device {deviceId}")

    except Exception as e:
        logger.error(f"Check device risks error: {e}")

async def check_stale_reports():
    """Vérifier les rapports CRITICAL sans action depuis 48h"""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT r.id, r."orgId", r.severity
                    FROM reports r
                    WHERE r.severity IN ('CRITICAL', 'FATAL')
                    AND r.status IN ('OPEN', 'ANALYZING')
                    AND r."updatedAt" < :since
                """),
                {"since": datetime.utcnow() - timedelta(hours=48)}
            )
            stale_reports = result.fetchall()

        for report in stale_reports:
            reportId, orgId = str(report[0]), str(report[1])
            await create_proactive_alert(
                orgId=orgId,
                deviceId=None,
                reportId=reportId,
                alert_type="REPORT_STALE",
                message=f"🚨 Rapport {report[2]} sans action depuis plus de 48h — Action requise immédiatement",
                confidence=0.95
            )

    except Exception as e:
        logger.error(f"Check stale reports error: {e}")

async def check_expiring_products():
    """Vérifier les produits qui expirent dans 30 jours"""
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    SELECT p.id, p."orgId", p.name, p."expiryDate"
                    FROM products p
                    WHERE p."expiryDate" IS NOT NULL
                    AND p."expiryDate" <= :soon
                    AND p."expiryDate" >= :now
                """),
                {
                    "soon": datetime.utcnow() + timedelta(days=30),
                    "now": datetime.utcnow()
                }
            )
            expiring = result.fetchall()

        for product in expiring:
            productId, orgId, name, expiry = str(product[0]), str(product[1]), product[2], product[3]
            days_left = (expiry - datetime.utcnow()).days
            await create_proactive_alert(
                orgId=orgId,
                deviceId=None,
                reportId=None,
                alert_type="EXPIRY_SOON",
                message=f"⏰ Produit '{name}' expire dans {days_left} jours — Vérification requise",
                confidence=1.0
            )

    except Exception as e:
        logger.error(f"Check expiring products error: {e}")

# ============================================
# CRÉATION ALERTE PROACTIVE
# ============================================

async def create_proactive_alert(
    orgId: str,
    deviceId,
    reportId,
    alert_type: str,
    message: str,
    confidence: float
):
    """Créer une alerte proactive + notification existante"""
    try:
        async with AsyncSessionLocal() as session:
            # Vérifier si alerte déjà envoyée aujourd'hui pour ce device/rapport
            check_col = '"deviceId"' if deviceId else '"reportId"'
            check_val = deviceId if deviceId else reportId

            if check_val:
                existing = await session.execute(
                    text(f"""
                        SELECT id FROM bot_proactive_alerts
                        WHERE {check_col} = :val
                        AND type = :type
                        AND "sentAt" >= :today
                    """),
                    {
                        "val": check_val,
                        "type": alert_type,
                        "today": datetime.utcnow().replace(hour=0, minute=0, second=0)
                    }
                )
                if existing.fetchone():
                    return  # Déjà envoyé aujourd'hui

            # Récupérer les Responsables de l'organisation
            responsables = await session.execute(
                text("""
                    SELECT DISTINCT u.id FROM users u
                    JOIN user_roles ur ON ur."userId" = u.id
                    JOIN roles r ON r.id = ur."roleId"
                    JOIN org_members om ON om."userId" = u.id
                    WHERE om."orgId" = :orgId
                    AND r."roleName" IN ('ResponsableQualite', 'Pharmacovigilance', 'Admin')
                    AND u.status = 'ACTIVE'
                """),
                {"orgId": orgId}
            )
            user_ids = [str(row[0]) for row in responsables.fetchall()]

            for userId in user_ids:
                # Créer notification dans le système existant
                notif_result = await session.execute(
                    text("""
                        INSERT INTO notifications
                        (id, "userId", message, channel, "isRead", "sentAt", "createdAt")
                        VALUES (gen_random_uuid(), :userId, :message, 'IN_APP', false, now(), now())
                        RETURNING id
                    """),
                    {"userId": userId, "message": message}
                )
                notificationId = str(notif_result.scalar())

                # Créer alerte proactive bot
                await session.execute(
                    text("""
                        INSERT INTO bot_proactive_alerts
                        (id, "userId", "deviceId", "reportId", "notificationId", type, message, confidence, "isSeen", "sentAt")
                        VALUES (gen_random_uuid(), :userId, :deviceId, :reportId, :notificationId, :type, :message, :confidence, false, now())
                    """),
                    {
                        "userId": userId,
                        "deviceId": deviceId,
                        "reportId": reportId,
                        "notificationId": notificationId,
                        "type": alert_type,
                        "message": message,
                        "confidence": confidence
                    }
                )

            await session.commit()
            logger.info(f"Proactive alert sent to {len(user_ids)} users")

    except Exception as e:
        logger.error(f"Create proactive alert error: {e}")
        raise

# ============================================
# RUN ALL CHECKS
# ============================================

async def run_all_checks():
    """Lancer toutes les vérifications proactives"""
    logger.info("🤖 VigiBot — Running proactive checks...")
    await check_device_risks()
    await check_stale_reports()
    await check_expiring_products()
    logger.info("✅ VigiBot — Proactive checks completed")
