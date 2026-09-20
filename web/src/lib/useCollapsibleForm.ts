import { useRef, useState } from 'react';

// List-first pages (catalogs, customers): the add/edit form stays hidden behind an "add" button,
// so on a phone the list is what you see first. `onClose` resets the page's own form state.
export function useCollapsibleForm(onClose: () => void) {
  const [formOpen, setFormOpen] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  function openForm() {
    setFormOpen(true);
    // The form renders after this handler; scroll once it exists (also covers "edit" from a
    // row far down the list).
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function closeForm() {
    setFormOpen(false);
    onClose();
  }

  return { formOpen, formRef, openForm, closeForm };
}
