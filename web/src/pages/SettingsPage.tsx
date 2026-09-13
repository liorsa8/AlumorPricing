import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Settings } from '../api/types';
import { resizeImageToDataUrl } from '../lib/imageResize';
import { exportBackup, importBackup } from '../lib/dataBackup';
import { exportCatalog } from '../lib/catalogExport';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Settings>('/api/settings'),
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
  const [imported, setImported] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        labor_pct: String(settings.labor_pct),
        installation_pct: String(settings.installation_pct),
        vat_pct: String(settings.vat_pct),
        company_name: settings.company_name,
        company_phone: settings.company_phone,
        company_address: settings.company_address,
        company_email: settings.company_email,
        company_tax_id: settings.company_tax_id,
        company_logo: settings.company_logo,
        standard_terms: settings.standard_terms,
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put('/api/settings', {
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
      queryClient.invalidateQueries({ queryKey: ['settings'] });
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

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('ייבוא יחליף את כל הנתונים הקיימים באפליקציה (לקוחות, הצעות, קטלוג, הגדרות) בתוכן הקובץ. להמשיך?')) {
      return;
    }
    setBackupError(null);
    try {
      await importBackup(file);
      setImported(true);
      queryClient.invalidateQueries();
      setTimeout(() => setImported(false), 3000);
    } catch {
      setBackupError('קובץ הגיבוי לא תקין או פגום');
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
          <h3 style={{ marginTop: 0 }}>גיבוי ושחזור נתונים</h3>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
            כל הנתונים נשמרים במכשיר הזה בלבד. מומלץ לייצא גיבוי מדי פעם, ולפני מעבר למכשיר אחר.
          </p>
          <button type="button" className="btn" onClick={() => exportBackup()}>
            ייצוא גיבוי
          </button>{' '}
          <label className="btn" style={{ display: 'inline-flex', cursor: 'pointer' }}>
            ייבוא מקובץ גיבוי
            <input type="file" accept="application/json" onChange={handleImportFile} style={{ display: 'none' }} />
          </label>
          {imported && <span style={{ marginInlineStart: 10, color: 'var(--color-success)' }}>יובא בהצלחה ✓</span>}
          {backupError && <div className="error-text">{backupError}</div>}
        </div>

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
          <h3 style={{ marginTop: 0 }}>ייצוא קטלוג</h3>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 0 }}>
            קובץ נפרד עם הקטלוג בלבד (מערכות פרופיל, סוגי זכוכית, אביזרים, סוגי פתחים) — בלי לקוחות והצעות. שימושי להעברת קטלוג למכשיר אחר, או לשמירת עותק לפני עדכון מחירים.
          </p>
          <button type="button" className="btn" onClick={() => exportCatalog()}>
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
