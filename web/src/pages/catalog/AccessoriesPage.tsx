import CatalogCrudPage from '../../components/CatalogCrudPage';

export default function AccessoriesPage() {
  return (
    <CatalogCrudPage
      title="אביזרים"
      endpoint="/api/accessories"
      queryKey="accessories"
      addButtonLabel="הוסף אביזר"
      emptyStateLabel="אין עדיין אביזרים בקטלוג"
      deleteConfirmText="למחוק את האביזר?"
      fields={[
        { key: 'name_he', label: 'שם האביזר' },
        { key: 'unit', label: 'יחידת מידה', defaultValue: 'יחידה' },
        { key: 'price_per_unit', label: 'מחיר ליחידה (₪)', type: 'number', step: '0.01' },
      ]}
    />
  );
}
