import { LocalDiskStorageProvider } from './local-disk.provider';
import type { StorageProvider } from './storage-provider.interface';
import { env } from 'src/shared/env.schema';

export function createStorageProvider(): StorageProvider {
  switch (env.STORAGE_DRIVER) {
    case 'local':
      return new LocalDiskStorageProvider();
    default:
      throw new Error(`STORAGE_DRIVER não suportado: ${env.STORAGE_DRIVER}`);
  }
}
