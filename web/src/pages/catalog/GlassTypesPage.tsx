import { useParams } from 'react-router-dom';
import CatalogCrudPage from '../../components/CatalogCrudPage';

export default function GlassTypesPage() {
  const { businessId } = useParams<{ businessId: string }>();
  return (
    <CatalogCrudPage
      title="סוגי זכוכית"
      kind="glass-types"
      businessId={businessId!}
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
