import { api } from '../api/client';
import { fetchBusinessCatalog } from './catalogExport';
import { downloadBlob } from './download';

interface BackupFile {
  app: 'AlumorPricing';
  exportedAt: string;
  data: Record<string, unknown>;
}

interface BackupCustomer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes?: string | null;
}

interface BackupOpening {
  opening_type_id: string;
  profile_system_id: string;
  glass_type_id: string;
  label: string;
  width_mm: number;
  height_mm: number;
  quantity: number;
}

interface BackupProject {
  customer_id: string | null;
  title: string;
  status: string;
  notes: string | null;
  discount_pct: number;
  openings: BackupOpening[];
}

// A point-in-time snapshot of everything this business can see (its own letterhead/pricing,
// customers, quotes with their openings, and its merged catalog) as a safety copy outside
// Firebase.
export async function exportBackup(businessId: string): Promise<void> {
  const [business, customers, projects, catalog] = await Promise.all([
    api.get<Record<string, unknown>>(`/businesses/${businessId}`),
    api.get<BackupCustomer[]>(`/businesses/${businessId}/customers`),
    api.get<(BackupProject & { id: string; customer_id: string | null })[]>(`/businesses/${businessId}/projects`),
    fetchBusinessCatalog(businessId),
  ]);

  // The projects list already returns full project rows (openings included); join in each
  // customer's contact fields locally instead of re-fetching every project's detail route
  // just for phone/email/address, since that data is already sitting in `customers`.
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const projectsWithCustomerContact = projects.map((project) => {
    const customer = project.customer_id ? customerById.get(project.customer_id) : undefined;
    return {
      ...project,
      customer_phone: customer?.phone ?? null,
      customer_email: customer?.email ?? null,
      customer_address: customer?.address ?? null,
    };
  });

  const payload: BackupFile = {
    app: 'AlumorPricing',
    exportedAt: new Date().toISOString(),
    data: { business, customers, projects: projectsWithCustomerContact, ...catalog },
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `alumor-pricing-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

export interface ImportBackupResult {
  customersRestored: number;
  projectsRestored: number;
  openingsSkipped: number;
}

// Restores a previously exported backup INTO the given business, recreating its settings,
// customers, and quotes (with openings). Firestore assigns its own document ids on create, so
// restored records get new ids — callers shouldn't assume ids from the backup file still exist
// anywhere. Catalog data isn't restored: it's re-derivable from the shared global catalog plus
// this business's own overrides, which this restore path leaves untouched rather than risk
// forking every global item or clobbering overrides created since the backup was taken.
export async function importBackup(businessId: string, file: File): Promise<ImportBackupResult> {
  const text = await file.text();
  let payload: BackupFile;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('invalid_backup_file');
  }
  if (payload.app !== 'AlumorPricing' || !payload.data) throw new Error('invalid_backup_file');

  const business = payload.data.business as Record<string, unknown> | undefined;
  const customers = (payload.data.customers as BackupCustomer[] | undefined) ?? [];
  const projects = (payload.data.projects as BackupProject[] | undefined) ?? [];

  if (business) {
    await api.put(`/businesses/${businessId}`, {
      labor_pct: business.labor_pct,
      installation_pct: business.installation_pct,
      vat_pct: business.vat_pct,
      company_name: business.company_name,
      company_phone: business.company_phone,
      company_address: business.company_address,
      company_email: business.company_email,
      company_tax_id: business.company_tax_id,
      company_logo: business.company_logo,
      standard_terms: business.standard_terms,
    });
  }

  // Old customer id -> newly created customer id, since Firestore assigns its own doc ids and
  // there's no way to preserve the originals through the existing create-only customers route.
  const customerIdMap = new Map<string, string>();
  for (const c of customers) {
    const created = await api.post<{ id: string }>(`/businesses/${businessId}/customers`, {
      name: c.name,
      phone: c.phone ?? null,
      email: c.email ?? null,
      address: c.address ?? null,
      notes: c.notes ?? null,
    });
    customerIdMap.set(c.id, created.id);
  }

  let openingsSkipped = 0;
  for (const project of projects) {
    const created = await api.post<{ id: string }>(`/businesses/${businessId}/projects`, {
      customer_id: project.customer_id ? (customerIdMap.get(project.customer_id) ?? null) : null,
    });
    await api.put(`/businesses/${businessId}/projects/${created.id}`, {
      title: project.title,
      notes: project.notes,
      discount_pct: project.discount_pct,
    });
    // Openings can only be added while the project is still a draft (firestore.rules'
    // draft-lock) — add them all before restoring a non-draft status below.
    for (const o of project.openings ?? []) {
      try {
        await api.post(`/businesses/${businessId}/projects/${created.id}/openings`, o);
      } catch {
        // A referenced catalog item (business override) may no longer exist if it was deleted
        // after the backup was taken — skip that one opening rather than aborting the whole
        // restore.
        openingsSkipped += 1;
      }
    }
    if (project.status && project.status !== 'draft') {
      await api.put(`/businesses/${businessId}/projects/${created.id}`, { status: project.status });
    }
  }

  return { customersRestored: customers.length, projectsRestored: projects.length, openingsSkipped };
}
