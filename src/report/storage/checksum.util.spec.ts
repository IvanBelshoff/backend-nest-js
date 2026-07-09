import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sha256File } from './checksum.util';

describe('checksum.util', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'checksum-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('computes SHA-256 of a file', async () => {
    const content = 'hello parquet snapshot';
    const filePath = join(dir, 'sample.parquet');
    await writeFile(filePath, content);

    const expected = createHash('sha256').update(content).digest('hex');
    await expect(sha256File(filePath)).resolves.toBe(expected);
  });
});
