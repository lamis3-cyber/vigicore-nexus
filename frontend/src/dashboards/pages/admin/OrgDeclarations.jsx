import OrgQueue from '../../components/OrgQueue';
import { tr } from '../../../i18n/translate.js';

// Administrateur d'établissement : déclarations adressées à « Mon établissement » par ses équipes (données réelles du serveur).
export default function OrgDeclarations() {
  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr("Déclarations")}</h1>
          <div className="u-fs-12 u-c-tertiary" style={{ marginTop: 4 }}>{tr("Envoyées par les équipes de votre établissement.")}</div>
        </div>
      </div>
      <OrgQueue />
    </div>
  );
}
