import { chmod, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { env } from 'src/shared/env.schema';
import type {
  StorageProvider,
  StorageStat,
} from './storage-provider.interface';

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

/**
 * Armazenamento local em disco sob `SNAPSHOT_STORAGE_DIR`.
 *
 * Segurança:
 * - `key` é sanitizada e o caminho resolvido precisa permanecer dentro do
 *   diretório base (bloqueio de path traversal).
 * - Diretórios são criados com 0700 e arquivos finalizados com 0600
 *   (best-effort no Windows, onde o modelo de permissões é via ACL).
 */
@Injectable()
export class LocalDiskStorageProvider implements StorageProvider {
  readonly driver = 'local';
  private readonly logger = new Logger(LocalDiskStorageProvider.name);
  private readonly baseDir = resolve(env.SNAPSHOT_STORAGE_DIR);

  private resolveSafePath(key: string): string {
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('Storage key inválida (vazia)');
    }

    const normalizedKey = key.replace(/\\/g, '/');

    if (
      normalizedKey.includes('..') ||
      normalizedKey.startsWith('/') ||
      isAbsolute(normalizedKey) ||
      /[\0]/.test(normalizedKey)
    ) {
      throw new Error(`Storage key inválida: ${key}`);
    }

    const target = resolve(this.baseDir, normalizedKey);
    const rel = relative(this.baseDir, target);

    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`Storage key fora do diretório base: ${key}`);
    }

    return target;
  }

  async resolveWritePath(key: string): Promise<string> {
    const target = this.resolveSafePath(key);
    const dir = target.substring(0, target.lastIndexOf(sep));
    await mkdir(dir, { recursive: true, mode: DIR_MODE });
    return target;
  }

  async finalizeWrite(key: string): Promise<void> {
    const target = this.resolveSafePath(key);
    try {
      await chmod(target, FILE_MODE);
    } catch (error) {
      this.logger.debug(
        `chmod não aplicado em ${key}: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
    }
  }

  resolveReadUri(key: string): string {
    return this.resolveSafePath(key);
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.resolveSafePath(key));
  }

  async stat(key: string): Promise<StorageStat> {
    const info = await stat(this.resolveSafePath(key));
    return { size: info.size };
  }

  async delete(key: string): Promise<void> {
    const target = this.resolveSafePath(key);
    await rm(target, { force: true });
  }

  async listKeys(): Promise<string[]> {
    if (!existsSync(this.baseDir)) {
      return [];
    }

    const entries = await readdir(this.baseDir, {
      recursive: true,
      withFileTypes: true,
    });

    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const parentPath = (entry as unknown as { parentPath?: string; path?: string })
          .parentPath ??
          (entry as unknown as { path?: string }).path ??
          this.baseDir;
        const abs = join(parentPath, entry.name);
        return relative(this.baseDir, abs).replace(/\\/g, '/');
      });
  }
}
