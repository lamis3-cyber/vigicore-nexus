import { Link } from 'react-router-dom'
import { LEGAL, legalIncomplete } from '../config/legal.js'
import { tr } from '../i18n/translate.js';

// Legal pages: structure and factual description of what the application actually does.
// They are NOT legal advice and do not assert compliance: points marked "À valider" need review by
// the operator's legal adviser (notably Algerian Law No. 18-07 on personal-data protection).
const Missing = () => <em style={{ color: '#ffb74d' }}>{tr("[à renseigner par l’exploitant]")}</em>
const V = ({ v }) => (v ? <>{v}</> : <Missing />)
const Review = ({ children }) => (
  <p style={{ borderLeft: '3px solid #ffb74d', paddingLeft: 12, color: 'rgba(255,220,170,.95)' }}>
    <b>{tr("À valider juridiquement :")}</b> {children}
  </p>
)

function Legal() {
  return (<>
    <h1>{tr("Mentions légales")}</h1>
    <h2>{tr("Éditeur du site")}</h2>
    <p>{tr("Éditeur :")} <V v={LEGAL.publisher} /><br />{tr("Adresse :")} <V v={LEGAL.address} /><br />{tr("Immatriculation (RC / NIF) :")} <V v={LEGAL.registration} /><br />{tr("Contact :")} <V v={LEGAL.contactEmail} /></p>
    <h2>{tr("Hébergement")}</h2>
    <p><V v={LEGAL.host} /></p>
    <h2>{tr("Nature du service")}</h2>
    <p>{tr("VigiCore NEXUS est une plateforme de déclaration et de suivi de vigilance sanitaire (matériovigilance, pharmacovigilance, chémovigilance, cosmétovigilance, réactovigilance). Elle ne fournit ni diagnostic ni avis médical : les informations affichées sont indicatives et ne remplacent pas l’avis d’un professionnel de santé. En cas d’urgence, contactez les services de secours.")}</p>
  </>)
}

function Privacy() {
  return (<>
    <h1>{tr("Politique de confidentialité")}</h1>
    <p>{tr("Responsable du traitement :")} <V v={LEGAL.publisher} />{tr(". Contact « données personnelles » :")} <V v={LEGAL.dataProtectionContact || LEGAL.contactEmail} />.</p>
    <h2>{tr("Données que l’application traite réellement")}</h2>
    <ul>
      <li><b>{tr("Compte")}</b> {tr(": nom, adresse e-mail, rôle, rattachement à un établissement, mot de passe (conservé uniquement sous forme de hachage bcrypt).")}</li>
      <li><b>{tr("Déclarations de vigilance")}</b> {tr(": description de l’incident, produit, numéro de lot, gravité déclarée, rôle et nom d’affichage du déclarant. Elles sont transmises au système de vigilance de l’organisation destinataire (communication serveur à serveur authentifiée).")} <i>{tr("Ces données peuvent être des données de santé.")}</i></li>
      <li><b>{tr("Messagerie et appels")}</b> {tr(": les messages et pièces jointes de la messagerie sont enregistrés sur le serveur ; les appels audio/vidéo utilisent WebRTC (signalisation via le serveur ; relais TURN si configuré).")}</li>
      <li><b>{tr("Marketplace")}</b> {tr(": fiches produits, commandes, justificatifs de paiement (images) téléversés par les organisations.")}</li>
      <li><b>{tr("Formulaire de contact")}</b> {tr(": transmis par e-mail à l’exploitant, non conservé par l’application.")}</li>
    </ul>
    <h2>{tr("Services d’IA tiers")}</h2>
    <p>{tr("Pour les fiches produits, le texte saisi (titre, catégorie, caractéristiques) peut être envoyé à un fournisseur de modèle de langage (Anthropic) ; les images produits peuvent être envoyées à un service de détourage (Bria). Ne saisissez aucune donnée de patient dans ces champs.")}</p>
    <p>{tr("Si l’assistant VigiCore AI est configuré avec un modèle de langage (Anthropic), votre question, la discussion en cours et un résumé limité de votre compte (références, statuts et destinataires de vos déclarations, compteurs de messagerie — sans identité de patient ni texte libre de déclaration) lui sont envoyés pour rédiger la réponse. Sans cette configuration, l’assistant répond uniquement à partir de règles internes.")}</p>
    <Review>{tr("ces envois vers des prestataires hors d’Algérie peuvent constituer un transfert de données à l’étranger soumis à autorisation ou information préalable de l’autorité de protection des données (ANPDP).")}</Review>
    <h2>{tr("Cookies et stockage local")}</h2>
    <p>{tr("Un cookie de session strictement nécessaire (")}<code>vg_session</code>{tr(", httpOnly, 7 jours) maintient votre connexion. Le navigateur conserve aussi vos préférences (thème, langue) et, sur votre appareil uniquement, des brouillons de déclaration. Aucun cookie publicitaire ni outil de mesure d’audience n’est utilisé par l’application.")}</p>
    <h2>{tr("Durées de conservation")}</h2>
    <p>{tr("Durées à définir par l’exploitant :")} <Missing />{tr(". Les déclarations de vigilance sont conservées avec leur historique afin d’assurer la traçabilité ; la désactivation d’un compte n’efface pas ces données.")}</p>
    <h2>{tr("Vos droits")}</h2>
    <p>{tr("Accès, rectification, opposition et suppression dans les conditions prévues par la loi applicable, en écrivant à")} <V v={LEGAL.dataProtectionContact || LEGAL.contactEmail} />.</p>
    <Review>{tr("conformité à la loi n° 18-07 (consentement, déclaration/autorisation préalable auprès de l’ANPDP pour le traitement de données de santé, désignation d’un responsable, mesures de sécurité, droits des personnes). Cette page décrit les traitements ; elle n’atteste d’aucune conformité.")}</Review>
  </>)
}

function Terms() {
  return (<>
    <h1>{tr("Conditions générales d’utilisation")}</h1>
    <p>{tr("Éditeur :")} <V v={LEGAL.publisher} />.</p>
    <h2>{tr("Objet")}</h2>
    <p>{tr("Les présentes conditions encadrent l’usage de VigiCore NEXUS par les patients, professionnels de santé, établissements et fournisseurs de produits.")}</p>
    <h2>{tr("Compte et sécurité")}</h2>
    <p>{tr("Vous êtes responsable de la confidentialité de votre mot de passe et des actions réalisées depuis votre compte. Signalez immédiatement tout accès non autorisé.")}</p>
    <h2>{tr("Déclarations")}</h2>
    <p>{tr("Une déclaration n’est considérée comme reçue par la vigilance que lorsque l’application l’indique expressément. Une déclaration « enregistrée » mais non confirmée n’a pas encore été reçue. Les informations fournies doivent être exactes.")}</p>
    <h2>{tr("Marketplace et paiements")}</h2>
    <p>{tr("Les paiements par virement sont confirmés manuellement par l’exploitant ; une facture n’est émise qu’après confirmation du paiement.")}</p>
    <h2>{tr("Limitation")}</h2>
    <p>{tr("Le service est fourni à titre informatif et ne remplace pas l’avis d’un professionnel de santé.")}</p>
    <Review>{tr("clauses de responsabilité, droit applicable, juridiction compétente et conditions commerciales (à rédiger avec le conseil juridique de l’exploitant).")}</Review>
  </>)
}

export default function LegalPage({ kind }) {
  const Body = { legal: Legal, privacy: Privacy, terms: Terms }[kind] || Legal
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg, #00131f)', color: 'var(--white, #eaf6ff)', fontFamily: "'Inter', sans-serif", lineHeight: 1.65 }}>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '48px 24px 96px' }}>
        <Link to="/" style={{ color: 'var(--cyan, #00e5ff)', textDecoration: 'none' }}>{tr("← VigiCore NEXUS")}</Link>
        {legalIncomplete && (
          <p role="status" style={{ margin: '20px 0', padding: 12, border: '1px solid #ffb74d', borderRadius: 8, color: '#ffcc80' }}>
            {tr("Les informations légales de l’exploitant ne sont pas encore toutes renseignées : les champs concernés sont signalés ci-dessous.")}
          </p>
        )}
        <Body />
        <p style={{ marginTop: 40, fontSize: 13, color: 'rgba(200,230,245,.6)' }}>{tr("Dernière mise à jour :")} <V v={LEGAL.lastUpdated} /></p>
        <nav style={{ marginTop: 16, display: 'flex', gap: 16, fontSize: 14 }}>
          <Link to="/legal">{tr("Mentions légales")}</Link><Link to="/privacy">{tr("Confidentialité")}</Link><Link to="/terms">{tr("Conditions d’utilisation")}</Link>
        </nav>
      </div>
    </main>
  )
}
