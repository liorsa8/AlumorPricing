import CatalogCrudPage from '../../components/CatalogCrudPage';

export default function GlassTypesPage() {
  return (
    <CatalogCrudPage
      title="סוגי זכוכית"
      endpoint="/api/glass-types"
      queryKey="glass-types"
      addButtonLabel="הוסף סוג זכוכית"
      emptyStateLabel="אין עדיין סוגי זכוכית בקטלוג"
      deleteConfirmText="למחוק את סוג הזכוכית?"
      fields={[
        { key: 'name_he', label: 'שם' },
        { key: 'thickness_mm', label: 'עובי / מפרט' },
        { key: 'price_per_sqm', label: 'מחיר למ"ר (₪)', type: 'number', step: '0.01' },
      ]}
    />
  );
}
