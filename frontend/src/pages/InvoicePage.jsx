import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getInvoice } from '../lib/services.js'
import { fmt, fmtDate } from '../lib/format.js'
import './InvoicePage.css'
import { tr, localeTag } from '../i18n/translate.js';


/** Printable invoice of a PAID order (Ctrl+P → "Save as PDF"). Opens in its own tab from Payments. */
export default function InvoicePage() {
  const { orderId } = useParams()
  const [st, setSt] = useState({ status: 'loading' })

  useEffect(() => {
    let off = false
    getInvoice(orderId).then((r) => { if (!off) setSt(r.ok ? { status: 'ok', inv: r.data.invoice } : { status: 'error', msg: r.error }) })
    return () => { off = true }
  }, [orderId])
  useEffect(() => { if (st.inv) document.title = `Facture ${st.inv.invoiceNo}` }, [st.inv])

  if (st.status === 'loading') return <div className="inv-shell"><p className="inv-note">{tr("Chargement de la facture…")}</p></div>
  if (st.status === 'error') {
    return (
      <div className="inv-shell"><p className="inv-note">{tr(st.msg)}</p>
        <Link className="inv-btn" to="/dashboard/services">{tr("← Retour au tableau de bord")}</Link></div>
    )
  }
  const { inv } = st
  const s = inv.seller
  return (
    <div className="inv-shell">
      <div className="inv-bar">
        <Link className="inv-btn inv-btn--ghost" to="/dashboard/services">{tr("← Tableau de bord")}</Link>
        <button className="inv-btn" onClick={() => window.print()}>{tr("Imprimer / Enregistrer en PDF")}</button>
      </div>

      <article className="inv-sheet">
        <header className="inv-head">
          <div>
            <h1>{tr(s.name)}</h1>
            {s.address && <p>{s.address}</p>}
            {s.contact && <p>{s.contact}</p>}
            <p className="inv-ids">
              {s.nif && <span>{tr("NIF : {0}", [s.nif])}</span>}{s.rc && <span>{tr("RC : {0}", [s.rc])}</span>}{s.nis && <span>{tr("NIS : {0}", [s.nis])}</span>}
            </p>
          </div>
          <div className="inv-title">
            <h2>{tr("FACTURE")}</h2>
            <p><b>N° {inv.invoiceNo}</b></p>
            <p>Date : {fmtDate(inv.issuedAt, 'long', localeTag())}</p>
          </div>
        </header>

        <section className="inv-to">
          <span>{tr("Facturé à")}</span>
          <strong>{tr(inv.buyer.name)}</strong>
        </section>

        <table className="inv-table">
          <thead><tr><th>{tr("Désignation")}</th><th>{tr("Durée")}</th><th className="r">{tr("Montant")}</th></tr></thead>
          <tbody>
            <tr>
              <td>{tr(inv.line.description)}</td>
              <td>{tr("{0} mois", [inv.line.months])}</td>
              <td className="r">{fmt(inv.subtotal)}</td>
            </tr>
          </tbody>
        </table>

        <dl className="inv-totals">
          {inv.discount > 0 && <div><dt>{tr("Remise")}</dt><dd>− {fmt(inv.discount)}</dd></div>}
          {inv.vat && <>
            <div><dt>{tr("Total HT")}</dt><dd>{fmt(inv.vat.ht)}</dd></div>
            <div><dt>{tr("TVA ({0} %)", [inv.vat.rate])}</dt><dd>{fmt(inv.vat.amount)}</dd></div>
          </>}
          <div className="inv-grand"><dt>{inv.vat ? tr("Total TTC") : tr("Total à payer")}</dt><dd>{fmt(inv.total)}</dd></div>
        </dl>

        <footer className="inv-foot">
          <p>{tr("Payé par")} <b>{inv.payment.method}</b> {tr("· Référence")} <b>{inv.payment.reference}</b></p>
          <span className="inv-stamp">{tr("PAYÉE")}</span>
        </footer>
      </article>
    </div>
  )
}
