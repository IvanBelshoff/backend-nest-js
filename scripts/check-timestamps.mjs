import pg from 'pg'

const client = new pg.Client({
  host: 'localhost',
  user: 'postgres',
  password: 'root',
  database: 'DataDash',
  port: 5432,
})

await client.connect()

const tz = await client.query('SHOW timezone')
console.log('PG timezone:', tz.rows[0].TimeZone)

const timestamptzColumns = await client.query(`
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND data_type = 'timestamp with time zone'
  ORDER BY table_name, column_name
`)
console.log('timestamptz columns:', timestamptzColumns.rowCount)

const plainTimestampColumns = await client.query(`
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND data_type = 'timestamp without time zone'
  ORDER BY table_name, column_name
`)
if (plainTimestampColumns.rowCount > 0) {
  console.log('WARNING: plain timestamp columns still present:')
  console.log(JSON.stringify(plainTimestampColumns.rows, null, 2))
} else {
  console.log('No plain TIMESTAMP columns (OK)')
}

const jobs = await client.query(`
  SELECT id,
         created_at,
         completed_at
  FROM relatorio_jobs
  ORDER BY created_at DESC
  LIMIT 1
`)
console.log('latest job:', JSON.stringify(jobs.rows[0] ?? null, null, 2))

const dash = await client.query(`
  SELECT id, nome, data_criacao
  FROM dashboards
  ORDER BY data_criacao DESC
  LIMIT 1
`)
console.log('latest dashboard:', JSON.stringify(dash.rows[0] ?? null, null, 2))

await client.end()
