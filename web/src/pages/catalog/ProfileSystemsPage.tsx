import { useParams } from 'react-router-dom';
import CatalogCrudPage from '../../components/CatalogCrudPage';

export default function ProfileSystemsPage() {
  const { businessId } = useParams<{ businessId: string }>();
  return (
    <CatalogCrudPage
      title="מערכות פרופיל"
      kind="profile-systems"
      businessId={businessId!}
      queryKey="profile-systems"
      addButtonLabel="הוסף מערכת פרופיל"
      emptyStateLabel="אין עדיין מערכות פרופיל בקטלוג"
      deleteConfirmText="למחוק את המערכת?"
      // A pure display label now — no price here anymore. The series/manufacturer show as
      // "סדרה" on the printed quote; price lives on the opening type + glass type instead.
      fields={[
        { key: 'name_he', label: 'שם המערכת' },
        { key: 'series_code', label: 'קוד סדרה (למשל 7000)' },
        { key: 'manufacturer', label: 'יצרן (אופציונלי)' },
      ]}
    />
  );
}
