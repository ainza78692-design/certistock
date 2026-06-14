const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/certistock_local' });
c.connect().then(() => 
  c.query("SELECT tc_number, COUNT(*) FROM transaction_certificates GROUP BY tc_number HAVING COUNT(*) > 1")
    .then(r => console.log('Duplicates:', r.rows))
    .then(() => c.query("SELECT uploaded_file_id, tc_number, created_at FROM transaction_certificates ORDER BY created_at DESC LIMIT 10"))
    .then(r => console.log('Recent TCs:', r.rows))
    .finally(() => c.end())
);
