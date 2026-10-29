import React from 'react'
import { tr } from '../../i18n/translate.js'
import { productNameMatches } from '../../lib/productMatch.js'

/**
 * « Produit lié dans VigiCore Audit » (ProductStudio, fiches de fabricant seulement).
 * Purement visuel : `info` vient de GET /api/services/audit-products (chargé par la page) ; le serveur revérifie tout.
 *   info = null            → chargement
 *   info.error             → liste indisponible : le lien actuel est gardé tel quel
 *   applicable === false   → fournisseur : rien n'est affiché
 *   manufacturerLinked=false → l'organisation n'est pas encore liée à un fabricant dans Audit
 *   available === false    → Audit injoignable : le lien actuel est gardé
 * Un produit déjà lié à une AUTRE fiche active est grisé (le serveur refuserait : PRODUCT_ALREADY_LINKED).
 * 2026-10-29 :
 *   - statut « commandable » de la fiche : seuls les produits PUBLIÉS dans l'offre en ligne du logiciel (validés, avec
 *     prix, disponibles) sont dans `info.products` ; une fiche est commandable si elle est liée à l'un d'eux ;
 *   - cohérence : si le titre de la fiche ne correspond pas au produit choisi, alerte + case de confirmation explicite
 *     (le serveur refuse le lien sans elle : PRODUCT_MISMATCH).
 */
export default function AuditProductField({ info, value, initialValue, onChange, listingId, inReviewFlow = false, title = '', confirmMismatch = false, onConfirmMismatch }) {
  if (info && info.applicable === false) return null
  const current = value || null
  const box = (children) => (
    <fieldset className="ps-audit">
      <legend>{tr('Linked product in VigiCore Audit')}</legend>
      {children}
    </fieldset>
  )
  const keptNote = current && <p className="if-hint">{tr('Current link kept: {0}', [current])}</p>

  if (!info) return box(<p className="if-hint">{tr('Loading your Audit products…')}</p>)
  if (info.error) return box(<>{<p className="if-hint ps-audit-warn" role="status">{tr('Your Audit products could not be loaded. You can still save: the link is not changed.')}</p>}{keptNote}</>)
  if (info.manufacturerLinked === false) {
    return box(<p className="if-hint" role="status">{tr('Your organization is not linked to a manufacturer in VigiCore Audit yet. Ask VigiCore to link it; you can save this listing without a link meanwhile.')}</p>)
  }
  if (info.available === false) return box(<>{<p className="if-hint ps-audit-warn" role="status">{tr('VigiCore Audit is unavailable right now. You can still save: the link is not changed.')}</p>}{keptNote}</>)

  const products = Array.isArray(info.products) ? info.products : []
  const known = !current || products.some((p) => p.ref === current)
  const changed = (current ?? null) !== (initialValue ?? null)
  const chosen = current ? products.find((p) => p.ref === current) ?? null : null
  const mismatch = !!chosen && !productNameMatches(title, chosen)
  const chosenName = chosen ? (chosen.reference ? `${chosen.name} · ${chosen.reference}` : chosen.name) : ''
  return box(<>
    <label>
      {tr('Product')}
      <select className="ps-select" value={current ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{tr('— Not linked —')}</option>
        {!known && <option value={current}>{tr('Product no longer found in Audit ({0})', [current])}</option>}
        {products.map((p) => {
          const other = p.linkedListing && p.linkedListing.id !== listingId ? p.linkedListing : null
          const name = p.reference ? `${p.name} · ${p.reference}` : p.name
          return (
            <option key={p.ref} value={p.ref} disabled={!!other}>
              {other ? tr('{0} — already linked to « {1} »', [name, other.title]) : name}
            </option>
          )
        })}
      </select>
    </label>
    {products.length === 0 && <p className="if-hint">{tr('No product of your organization was found in VigiCore Audit.')}</p>}
    {/* Statut de commande de la fiche (2026-10-29) : dit au fabricant pourquoi « Commander » apparaît ou non. */}
    {chosen && <p className="if-hint ps-audit-ok" role="status">✓ {tr('Orderable on the site: this product is published in the online offer of VigiCore Audit.')}</p>}
    {!current && <p className="if-hint ps-audit-warn" role="status">{tr('Not orderable online: link this listing to a product published in VigiCore Audit (Commercial › Online offer). Buyers only see « Contact ».')}</p>}
    {!known && <p className="if-hint ps-audit-warn" role="status">{tr('Not orderable online: this product is no longer in the online offer of VigiCore Audit (unpublished, no price, unavailable or not validated). Publish it again in VigiCore Audit, or choose another product.')}</p>}
    {mismatch && (
      <div className="if-hint ps-audit-warn" role="alert">
        <p style={{ margin: '0 0 6px' }}>{tr('Warning: this listing (« {0} ») does not seem to match the product « {1} ». Buyers who click « Order » would order « {1} ».', [title, chosenName])}</p>
        <label style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={!!confirmMismatch} onChange={(e) => onConfirmMismatch?.(e.target.checked)} />
          <span>{tr('I confirm this listing is really this product.')}</span>
        </label>
      </div>
    )}
    <p className="if-hint">{tr('Only products published in the online offer of VigiCore Audit (validated, priced, available) appear in this list.')}</p>
    <p className="if-hint">{tr('With a link, buyers see this listing only if they can order this exact product. Without one, visibility follows your manufacturer’s general rule.')}</p>
    {changed && inReviewFlow && <p className="if-hint ps-audit-warn" role="status">{tr('Changing the link sends the listing back to VigiCore for review.')}</p>}
  </>)
}
