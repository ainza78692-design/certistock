type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rowCount: number | null }>;
};

export async function cleanupUnusedSuppliers(db: Queryable, companyId: string) {
  const result = await db.query(
    `delete from suppliers s
     where s.company_id = $1
       and not exists (
         select 1
         from transaction_certificates tc
         where tc.company_id = s.company_id
           and tc.supplier_id = s.id
       )`,
    [companyId],
  );
  return result.rowCount || 0;
}

export async function cleanupUnusedCustomers(db: Queryable, companyId: string) {
  const result = await db.query(
    `delete from customers c
     where c.company_id = $1
       and not exists (
         select 1
         from outward_sales os
         where os.company_id = c.company_id
           and os.customer_id = c.id
       )`,
    [companyId],
  );
  return result.rowCount || 0;
}
