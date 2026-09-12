import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Settings } from '../api/types';

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
    standard_terms: '',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        labor_pct: String(settings.labor_pct),
        installation_pct: String(settings.installation_pct),
        vat_pct: String(settings.vat_pct),
        company_name: settings.company_name,
        company_phone: settings.company_phone,
        company_address: settings.company_address,
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
        standard_terms: form.standard_terms,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

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
            <label>כתובת</label>
            <input
              value={form.company_address}
              onChange={(e) => setForm({ ...form, company_address: e.target.value })}
            />
          </div>
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
      </div>
    </div>
  );
}
