/** Доступ к разделу «Ипотека» совпадает с backend `canAccessMortgageApi`: руководители + ипотечный брокер. */
export function canAccessMortgageSection(role: string | null | undefined, accessLevel: number): boolean {
  const r = String(role || '');
  if (accessLevel >= 90 || r === 'admin' || r === 'director') return true;
  return ['commercial', 'head_sales', 'sales_manager', 'mortgage_broker'].includes(r);
}
