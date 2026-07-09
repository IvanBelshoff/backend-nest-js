import { LocalDiskStorageProvider } from './local-disk.provider';

describe('LocalDiskStorageProvider', () => {
  const provider = new LocalDiskStorageProvider();

  it('rejects path traversal in storage key', async () => {
    await expect(provider.resolveWritePath('../escape.parquet')).rejects.toThrow(
      'inválida',
    );
  });

  it('rejects absolute storage keys', async () => {
    await expect(
      provider.resolveWritePath('/etc/passwd.parquet'),
    ).rejects.toThrow('inválida');
  });

  it('resolves nested keys to paths containing the key segments', async () => {
    const path = await provider.resolveWritePath('rel_1/file.parquet');
    expect(path.replace(/\\/g, '/')).toContain('rel_1/file.parquet');
  });

  it('resolveReadUri returns path containing the key', () => {
    const uri = provider.resolveReadUri('rel_2/data.parquet');
    expect(uri.replace(/\\/g, '/')).toContain('rel_2/data.parquet');
  });
});
