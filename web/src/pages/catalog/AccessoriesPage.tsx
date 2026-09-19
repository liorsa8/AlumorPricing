import { useParams } from 'react-router-dom';
import CatalogCrudPage from '../../components/CatalogCrudPage';

export default function AccessoriesPage() {
  const { businessId } = useParams<{ businessId: string }>();
  return (
    <CatalogCrudPage
      title="אביזרים"
      kind="accessories"
      businessId={businessId!}
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
