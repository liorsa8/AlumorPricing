import CatalogCrudPage from '../../components/CatalogCrudPage';

export default function ProfileSystemsPage() {
  return (
    <CatalogCrudPage
      title="מערכות פרופיל"
      endpoint="/api/profile-systems"
      queryKey="profile-systems"
      addButtonLabel="הוסף מערכת פרופיל"
      emptyStateLabel="אין עדיין מערכות פרופיל בקטלוג"
      deleteConfirmText="למחוק את המערכת?"
      fields={[
        { key: 'name_he', label: 'שם המערכת' },
        { key: 'series_code', label: 'קוד סדרה (למשל 7000)' },
        { key: 'manufacturer', label: 'יצרן (אופציונלי)' },
        { key: 'price_per_meter', label: 'מחיר למטר (₪)', type: 'number', step: '0.01' },
      ]}
    />
  );
}
