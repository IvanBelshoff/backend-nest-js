/**
 * Abstração de armazenamento dos arquivos de snapshot (Parquet).
 *
 * Hoje só existe a implementação local (disco). A interface já é desenhada
 * para permitir um provider de object storage (S3/Azure/GCS) no futuro sem
 * alterar o worker de geração nem a camada de consulta.
 */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface StorageStat {
  size: number;
}

export interface StorageProvider {
  /** Identificador do driver (ex.: "local", "s3"). */
  readonly driver: string;

  /**
   * Resolve o caminho/URI de escrita para uma key, garantindo que o diretório
   * de destino exista com permissões restritas. Para o driver local retorna um
   * caminho absoluto no filesystem.
   */
  resolveWritePath(key: string): Promise<string>;

  /**
   * Finaliza a escrita de um arquivo já gravado no caminho de `resolveWritePath`
   * (ex.: aplica permissões 0600 no local; faria upload no cloud).
   */
  finalizeWrite(key: string): Promise<void>;

  /**
   * Resolve o caminho/URI de leitura utilizável pelo DuckDB. Para o driver
   * local é um caminho absoluto no filesystem.
   */
  resolveReadUri(key: string): string;

  exists(key: string): Promise<boolean>;
  stat(key: string): Promise<StorageStat>;
  delete(key: string): Promise<void>;

  /** Lista todas as keys atualmente armazenadas (usado na limpeza de órfãos). */
  listKeys(): Promise<string[]>;
}
