import { MongoClient } from 'mongodb';

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/datadash_reports';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('audit:clear is disabled in production');
  }

  const uri = process.env.MONGO_URI ?? DEFAULT_URI;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const dbName = new URL(uri).pathname.replace(/^\//, '') || 'datadash_reports';
    const db = client.db(dbName || undefined);
    const result = await db.collection('user_audit_logs').deleteMany({});

    console.log(`Removed ${result.deletedCount ?? 0} audit log(s) from user_audit_logs`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
