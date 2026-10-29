#!/usr/bin/env node
/**
 * Hygiène du dépôt : empêche de versionner ou d'envoyer par erreur des fichiers lourds ou sensibles.
 *
 *   node scripts/repo-hygiene.mjs check        liste ce qui ne doit PAS être dans le dépôt (code de sortie 1 s'il y en a)
 *   node scripts/repo-hygiene.mjs pack [out]   crée une archive PROPRE (défaut : ../vigicore-clean-YYYYMMDD.zip)
 *
 * Pourquoi : une archive faite à la main embarquait .venv (16 000+ fichiers), prisma/dev.db (comptes + hachages de mots de passe),
 * prisma/test.db, storage/attachments/*.enc (pièces jointes chiffrées) et une sauvegarde SQL. Rien de tout cela n'a sa place
 * dans un zip partagé ni dans git. `pack` applique les mêmes exclusions que .gitignore, sans dépendre de git.
 * `check` regarde ce que GIT suit (git ls-files) ; hors dépôt git, il regarde l'arborescence.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Dossiers jamais parcourus ni archivés (dépendances, builds, environnements, données runtime).
// (frontend/public/imgly est recopié depuis node_modules par le postinstall du frontend. Pas de « models » ici : ce nom
// désigne aussi ai-service/bot/models, qui contient du CODE et le modèle .pkl livré.)
const SKIP_DIRS = new Set(['node_modules', '.venv', 'venv', '__pycache__', 'dist', '.git', '.idea', '.vscode', 'storage', 'backups', 'logs', 'imgly']);
// Fichiers sensibles ou générés (tests sur le chemin relatif, séparateur « / »).
const FORBIDDEN = [
  [/(^|\/)\.env(\.(?!example$)[^/]*)?$/, 'fichier .env (secrets) — seul .env.example est versionné'],
  [/\.(db|sqlite|sqlite3)(-journal|-wal|-shm)?$/i, 'base de données locale (comptes, hachages de mots de passe)'],
  [/\.db\.bak$/i, 'sauvegarde de base de données'],
  [/(^|\/)database\/backups\/[^/]+\.(sql|dump)$/i, 'sauvegarde SQL'],
  [/\.(dump)$/i, 'dump de base de données'],
  [/(^|\/)storage\//, 'stockage runtime (pièces jointes chiffrées)'],
  [/(^|\/)(\.venv|venv)\//, 'environnement virtuel Python'],
  [/(^|\/)node_modules\//, 'node_modules'],
  [/\.(pem|key|p12|pfx)$/i, 'clé / certificat privé'],
  [/\.(zip|tar\.gz|tgz)$/i, 'archive'],
];
// Exceptions voulues : le modèle ML livré avec le service IA, et les échantillons de config.
const ALLOW = [/(^|\/)ai-service\/bot\/models\/[^/]+\.pkl$/, /\.env\.example$/, /(^|\/)\.env\.production\.example$/];

const forbiddenReason = (rel) => (ALLOW.some((r) => r.test(rel)) ? null : FORBIDDEN.find(([re]) => re.test(rel))?.[1] ?? null);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    const st = statSync(abs);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(abs, out); else out.push({ rel: `${rel}/`, skipped: true }); }
    else out.push({ rel });
  }
  return out;
}

function trackedFiles() {
  try {
    const raw = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8');
    return { source: 'git', files: raw.split('\0').filter(Boolean) };
  } catch {
    // Pas de dépôt git : on inspecte l'arborescence, y compris les dossiers normalement exclus (pour les signaler).
    const all = [];
    const scan = (dir) => {
      for (const name of readdirSync(dir)) {
        const abs = path.join(dir, name);
        const rel = path.relative(ROOT, abs).split(path.sep).join('/');
        if (name === 'node_modules' || name === '.git') { if (name === 'node_modules') all.push(`${rel}/x`); continue; }
        if (statSync(abs).isDirectory()) {
          if (['.venv', 'venv', 'storage'].includes(name)) all.push(`${rel}/x`); else scan(abs);
        } else all.push(rel);
      }
    };
    scan(ROOT);
    return { source: 'dossier', files: all };
  }
}

function check() {
  const { source, files } = trackedFiles();
  const bad = new Map();
  for (const rel of files) {
    const why = forbiddenReason(rel);
    if (!why) continue;
    const key = rel.replace(/^(.*?\/(?:\.venv|venv|node_modules|storage)\/).*/, '$1');
    if (!bad.has(key)) bad.set(key, why);
  }
  if (bad.size === 0) { console.log(`OK : rien de sensible (${files.length} fichiers vus via ${source}).`); return 0; }
  console.error(`${bad.size} élément(s) à ne pas versionner (vus via ${source}) :`);
  for (const [rel, why] of bad) console.error(`  - ${rel}  →  ${why}`);
  console.error(source === 'git' ? '\nCorrection : git rm -r --cached <chemin>  puis commit (les fichiers restent sur votre disque).' : "\nCes éléments restent sur votre disque ; 'pack' ne les met pas dans l'archive.");
  return 1;
}

function pack(outArg) {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const out = path.resolve(outArg ?? path.join(ROOT, '..', `vigicore-clean-${stamp}.zip`));
  const files = walk(ROOT).filter((f) => !f.skipped && !forbiddenReason(f.rel)).map((f) => f.rel);
  const prefix = path.basename(ROOT);
  const dir = mkdtempSync(path.join(tmpdir(), 'vg-pack-'));
  const list = path.join(dir, 'list.txt');
  writeFileSync(list, files.join('\n') + '\n');
  if (existsSync(out)) rmSync(out);
  // 1) bsdtar (Windows 10+, macOS) : tar -a choisit le format zip d'après l'extension ; 2) zip (Linux).
  let r = spawnSync('tar', ['-a', '-cf', out, '-T', list, '-C', ROOT, '-s', `|^|${prefix}/|`], { cwd: ROOT, stdio: 'pipe' });
  if (r.status !== 0 || !existsSync(out)) r = spawnSync('zip', ['-q', out, '-@'], { cwd: ROOT, input: files.join('\n'), stdio: ['pipe', 'pipe', 'pipe'] });
  rmSync(dir, { recursive: true, force: true });
  if (r.status !== 0 || !existsSync(out)) { console.error("Impossible de créer l'archive (ni « tar -a » ni « zip » disponibles).", String(r.stderr ?? '')); return 1; }
  console.log(`Archive propre : ${out}  (${files.length} fichiers, ${(statSync(out).size / 1048576).toFixed(1)} Mo)`);
  return 0;
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'check') process.exit(check());
else if (cmd === 'pack') process.exit(pack(arg));
else { console.error('Usage : node scripts/repo-hygiene.mjs check | pack [sortie.zip]'); process.exit(2); }
