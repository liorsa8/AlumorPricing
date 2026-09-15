import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Business } from '../api/types';
import { resizeImageToDataUrl } from '../lib/imageResize';
import { exportBackup } from '../lib/dataBackup';
import { exportCatalog } from '../lib/catalogExport';

export default function SettingsPage() {
  const { businessId } = useParams<{ businessId: string }>();
  const queryClient = useQueryClient();
  const { data: business } = useQuery({
    queryKey: ['business', businessId],
    queryFn: () => api.get<Business>(`/businesses/${businessId}`),
  });

  const [form, setForm] = useState({
    labor_pct: '',
    installation_pct: '',
    vat_pct: '',
    company_name: '',
    company_phone: '',
    company_address: '',
    company_email: '',
    company_tax_id: '',
    company_logo: '',
    standard_terms: '',
  });
  const [saved, setSaved] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  useEffect(() => {
    if (business) {
      setForm({
        labor_pct: String(business.labor_pct),
        installation_pct: String(business.installation_pct),
        vat_pct: String(business.vat_pct),
        company_name: business.company_name,
        company_phone: business.company_phone,
        company_address: business.company_address,
        company_email: business.company_email,
        company_tax_id: business.company_tax_id,
        company_logo: business.company_logo,
        standard_terms: business.standard_terms,
      });
    }
  }, [business]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put(`/businesses/${businessId}`, {
        labor_pct: Number(form.labor_pct) || 0,
        installation_pct: Number(form.installation_pct) || 0,
        vat_pct: Number(form.vat_pct) || 0,
        company_name: form.company_name,
        company_phone: form.company_phone,
        company_address: form.company_address,
        company_email: form.company_email,
        company_tax_id: form.company_tax_id,
        company_logo: form.company_logo,
        standard_terms: form.standard_terms,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business', businessId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setForm((f) => ({ ...f, company_logo: dataUrl }));
    } catch {
      setLogoError('טעינת הלוגו נכשלה, נסו קובץ אחר');
    }
  }

  async function handleExportBackup() {
    setBackupError(null);
    try {
      await exportBackup(businessId!);
    } catch {
      setBackupError('ייצוא הגיבוי נכשל, נסו שוב');
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>עלויות והגדרות</h2>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>אחוזי תמחור (חלים על הצעות חדשות/בטיוטה)</h3>
        <div className="form-grid">
          <div className="field">
            <label>אחוז עבודה (%)</label>
            <input
              type="number"
              step="0.1"
              value={form.labor_pct}
              onChange={(e) => setForm({ ...form, labor_pct: e.target.value })}
            />
          </div>
          <div className="field">
            <label>אחוז התקנה (%)</label>
            <input
              type="number"
              step="0.1"
              value={form.installation_pct}
              onChange={(e) => setForm({ ...form, installation_pct: e.target.value })}
            />
          </div>
          <div className="field">
            <label>אחוז מע"מ (%)</label>
            <input
              type="number"
              step="0.1"
              value={form.vat_pct}
              onChange={(e) => setForm({ ...form, vat_pct: e.target.value })}
            />
          </div>
        </div>
        <p className="text-muted" style={{ fontSize: 13 }}>
          בדקו שהאחוז מע"מ תואם לשיעור הנוכחי בישראל בעת ההגדרה — שיעור המע"מ משתנה מעת לעת.
        </p>

        <h3>פרטי החברה (מופיעים על גבי ההצעה המודפסת)</h3>
        <div className="form-grid">
          <div className="field">
            <label>שם החברה</label>
            <input
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
            />
          </div>
          <div className="field">
            <label>טלפון</label>
            <input
              value={form.company_phone}
              onChange={(e) => setForm({ ...form, company_phone: e.target.value })}
            />
          </div>
          <div className="field">
            <label>אימייל</label>
            <input
              value={form.company_email}
              onChange={(e) => setForm({ ...form, company_email: e.target.value })}
            />
          </div>
          <div className="field">
            <label>כתובת</label>
            <input
              value={form.company_address}
              onChange={(e) => setForm({ ...form, company_address: e.target.value })}
            />
          </div>
          <div className="field">
            <label>ח.פ / עוסק מורשה</label>
            <input
              value={form.company_tax_id}
              onChange={(e) => setForm({ ...form, company_tax_id: e.target.value })}
            />
          </div>
        </div>

        <div className="field" style={{ maxWidth: 320 }}>
          <label>לוגו</label>
          {form.company_logo && (
            <img
              src={form.company_logo}
              alt="לוגו החברה"
              style={{
                maxHeight: 80,
                maxWidth: '100%',
                objectFit: 'contain',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius)',
                padding: 6,
                background: '#fff',
              }}
            />
          )}
          <input type="file" accept="image/*" onChange={handleLogoChange} />
          {form.company_logo && (
            <button
              type="button"
              className="btn btn-sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setForm((f) => ({ ...f, company_logo: '' }))}
            >
              הסרת לוגו
            </button>
          )}
          {logoError && <div className="error-text">{logoError}</div>}
        </div>

        <h3>הערות ותנאים קבועים (מופיעים בתחתית ההצעה המודפסת)</h3>
        <div className="field">
          <label>שורה אחת לכל סעיף</label>
          <textarea
            value={form.standard_terms}
            onChange={(e) => setForm({ ...form, standard_terms: e.target.value })}
            rows={6}
          />
        </div>

        <button className="btn btn-primary" onClick={() => saveMutation.mutate()}>
          שמור הגדרות
        </button>
        {saved && <span style={{ marginInlineStart: 10, color: 'var(--color-success)' }}>נשמר ✓</span>}

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
          <h3 style={{ marginTop: 0 }}>גיבוי נתונים</h3>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
            כל הנתונים נשמרים בענן (Firebase). מומלץ לייצא גיבוי מדי פעם כעותק בטיחות נוסף.
          </p>
          <button type="button" className="btn" onClick={handleExportBackup}>
            ייצוא גיבוי
          </button>
          {backupError && <div className="error-text">{backupError}</div>}
        </div>

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
          <h3 style={{ marginTop: 0 }}>ייצוא קטלוג</h3>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
            קובץ נפרד עם הקטלוג בלבד (מערכות פרופיל, סוגי זכוכית, אביזרים, סוגי פתחים) — בלי לקוחות והצעות. שימושי להעברת קטלוג למכשיר אחר, או לשמירת עותק לפני עדכון מחירים.
          </p>
          <button type="button" className="btn" onClick={() => exportCatalog(businessId!)}>
            ייצוא קטלוג
          </button>
        </div>

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
          <label
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-text-muted)',
              fontWeight: 700,
            }}
          >
            אודות
          </label>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 14,
              marginTop: 8,
            }}
          >
            <span className="text-muted">גרסה</span>
            <span style={{ fontWeight: 700 }}>{__APP_VERSION__}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
