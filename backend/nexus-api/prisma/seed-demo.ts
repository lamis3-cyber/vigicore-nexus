import { PrismaClient, Role, EstablishmentType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = 'Demo@12345';

type EstSpec = { key: string; name: string; type: EstablishmentType; departments?: string[]; /** Distributeur déjà VÉRIFIÉ par le staff (démo). */ distributor?: boolean };

const ESTABLISHMENTS: EstSpec[] = [
  { key: 'hospital', name: 'CHU Demo Sétif', type: 'HOSPITAL', departments: ['Cardiologie', 'Urgences', 'Pédiatrie'] },
  { key: 'clinic', name: 'Clinique Demo El Hayat', type: 'CLINIQUE', departments: ['Chirurgie', 'Radiologie'] },
  { key: 'centre', name: 'Centre Médical Demo Ennour', type: 'CENTRE_MEDICAL', departments: ['Médecine générale'] },
  { key: 'officine', name: 'Pharmacie Demo Centrale', type: 'OFFICINE' },
  { key: 'labo', name: 'Laboratoire Demo Biolab', type: 'LABORATOIRE' },
  // Fournisseur / distributeur en gros (rôle FOURNISSEUR) — catégorie DISTRIBUTOR déjà vérifiée pour pouvoir tester les commandes.
  { key: 'provider', name: 'Fournisseur Demo MedSupply', type: 'SUPPLIER', distributor: true },
  // Fabricant (rôle ESTABLISHMENT_ADMIN) : publie ses fiches produits sur /services.
  { key: 'manufacturer', name: 'Fabricant Demo Pharmalab', type: 'SUPPLIER' },
];

type UserSpec = {
  email: string;
  name: string;
  role: Role;
  affiliations: [string, string?][];
  note: string;
  /** Org-level power on every affiliation of this user (default MEMBER). */
  memberRole?: 'ADMIN' | 'MEMBER';
};

const USERS: UserSpec[] = [
  { email: 'patient@demo.vigicore.dz', name: 'Karim Patient', role: 'PATIENT', affiliations: [], note: 'Patient' },
  { email: 'patient2@demo.vigicore.dz', name: 'Amina Patient', role: 'PATIENT', affiliations: [], note: 'Patient 2' },

  { email: 'doctor.hospital@demo.vigicore.dz', name: 'Dr. Yacine Benali', role: 'DOCTOR', affiliations: [['hospital', 'Cardiologie']], note: 'Médecin hôpital Cardiologie' },
  { email: 'doctor.urgences@demo.vigicore.dz', name: 'Dr. Sara Haddad', role: 'DOCTOR', affiliations: [['hospital', 'Urgences']], note: 'Médecin hôpital Urgences' },
  { email: 'doctor.multi@demo.vigicore.dz', name: 'Dr. Mourad Multi', role: 'DOCTOR', affiliations: [['clinic', 'Chirurgie'], ['centre', 'Médecine générale']], note: 'Médecin 2 établissements' },
  { email: 'doctor.solo@demo.vigicore.dz', name: 'Dr. Nadia Libérale', role: 'DOCTOR', affiliations: [], note: 'Médecin libéral' },

  { email: 'pharmacien@demo.vigicore.dz', name: 'Ph. Lotfi Mansouri', role: 'PHARMACIEN', affiliations: [['officine']], note: 'Pharmacien officine' },
  { email: 'pharmacien.solo@demo.vigicore.dz', name: 'Ph. Hanane Indépendante', role: 'PHARMACIEN', affiliations: [], note: 'Pharmacien sans affiliation' },

  { email: 'labo@demo.vigicore.dz', name: 'Samir Technicien Labo', role: 'LABO', affiliations: [['labo']], note: 'Personnel laboratoire' },

  { email: 'staff@demo.vigicore.dz', name: 'Leila Infirmière', role: 'HOSPITAL', affiliations: [['hospital', 'Pédiatrie']], note: 'Personnel médical' },

  { email: 'admin.hospital@demo.vigicore.dz', name: 'Admin CHU Demo', role: 'ORG_ADMIN', affiliations: [['hospital']], memberRole: 'ADMIN', note: 'Admin hôpital' },
  { email: 'admin.clinic@demo.vigicore.dz', name: 'Admin Clinique Demo', role: 'ORG_ADMIN', affiliations: [['clinic']], memberRole: 'ADMIN', note: 'Admin clinique' },
  { email: 'admin.centre@demo.vigicore.dz', name: 'Admin Centre Demo', role: 'ORG_ADMIN', affiliations: [['centre']], memberRole: 'ADMIN', note: 'Admin centre médical' },

  // Fournisseur / distributeur : tableau de bord fournisseur (notifications, incidents, commandes, communication, organisations).
  { email: 'provider@demo.vigicore.dz', name: 'Fournisseur MedSupply', role: 'FOURNISSEUR', affiliations: [['provider']], memberRole: 'ADMIN', note: 'Fournisseur / distributeur' },
  // Fabricant : liste ses produits sur /services. NOT a healthcare admin.
  { email: 'manufacturer@demo.vigicore.dz', name: 'Fabricant Pharmalab', role: 'ESTABLISHMENT_ADMIN', affiliations: [['manufacturer']], memberRole: 'ADMIN', note: 'Fabricant (Services)' },

  // Responsables vigilance des établissements : reçoivent les déclarations « Mon organisation » (File de l'établissement).
  { email: 'vigilance.hospital@demo.vigicore.dz', name: 'Resp. Vigilance CHU', role: 'VIGILANCE_REVIEWER', affiliations: [['hospital']], note: 'Responsable vigilance CHU' },
  { email: 'vigilance.clinic@demo.vigicore.dz', name: 'Resp. Vigilance Clinique', role: 'VIGILANCE_REVIEWER', affiliations: [['clinic']], note: 'Responsable vigilance clinique' },
  { email: 'vigilance.centre@demo.vigicore.dz', name: 'Resp. Vigilance Centre', role: 'VIGILANCE_REVIEWER', affiliations: [['centre']], note: 'Responsable vigilance centre médical' },

  { email: 'reviewer@demo.vigicore.dz', name: 'Reviewer Vigilance', role: 'VIGILANCE_REVIEWER', affiliations: [['__central']], note: 'Reviewer vigilance' },

  { email: 'platform.admin@demo.vigicore.dz', name: 'VigiCore Staff', role: 'PATIENT', affiliations: [], note: 'Staff VigiCore (PLATFORM_ADMIN_EMAILS)' },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  let central = await prisma.establishment.findFirst({ where: { isSystemReserved: true } });
  if (!central) {
    central = await prisma.establishment.create({
      data: { name: 'VigiCore NEXUS — Central Vigilance Queue', type: 'SYSTEM', isSystemReserved: true },
    });
  }

  const est: Record<string, { id: string; deps: Record<string, string> }> = {
    __central: { id: central.id, deps: {} },
  };
  for (const spec of ESTABLISHMENTS) {
    let e = await prisma.establishment.findFirst({ where: { name: spec.name } });
    if (!e) e = await prisma.establishment.create({ data: { name: spec.name, type: spec.type } });
    if (spec.distributor) {
      // Idempotent : une base de démo existante est mise à niveau au prochain `npm run seed:demo`.
      e = await prisma.establishment.update({
        where: { id: e.id },
        data: {
          buyerCategory: 'DISTRIBUTOR', buyerCategoryStatus: 'VERIFIED', buyerCategoryReviewedAt: new Date(), buyerCategoryReviewedBy: 'seed-demo',
          rcNumber: '19/00-0012345 B 19', nifNumber: '001919001234567', phone: '+213 36 00 00 00', address: 'Zone industrielle, Sétif',
        },
      });
    }
    est[spec.key] = { id: e.id, deps: {} };
    for (const depName of spec.departments ?? []) {
      let d = await prisma.department.findFirst({ where: { name: depName, establishmentId: e.id } });
      if (!d) d = await prisma.department.create({ data: { name: depName, establishmentId: e.id } });
      est[spec.key].deps[depName] = d.id;
    }
  }

  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { displayName: u.name, role: u.role },
      create: { email: u.email, displayName: u.name, role: u.role, passwordHash },
    });

    for (let i = 0; i < u.affiliations.length; i++) {
      const [key, depName] = u.affiliations[i];
      const target = est[key];
      const departmentId = depName ? target.deps[depName] ?? null : null;
      await prisma.userEstablishment.upsert({
        where: { userId_establishmentId: { userId: user.id, establishmentId: target.id } },
        update: { departmentId, isActiveContext: i === 0, status: 'ACTIVE', memberRole: u.memberRole ?? 'MEMBER' },
        create: {
          userId: user.id,
          establishmentId: target.id,
          departmentId,
          isActiveContext: i === 0,
          status: 'ACTIVE',
          memberRole: u.memberRole ?? 'MEMBER',
        },
      });
    }
  }

  console.log('\nDemo accounts ready — password for ALL: ' + PASSWORD + '\n');
  console.table(USERS.map((u) => ({ email: u.email, role: u.role, note: u.note })));
}

main()
  .catch((e) => {
    console.error('Demo seed failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());