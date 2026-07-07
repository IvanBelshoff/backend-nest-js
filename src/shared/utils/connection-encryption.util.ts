import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../env.schema';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const key = Buffer.from(env.CONNECTION_ENCRYPTION_KEY, 'base64');

  if (key.length !== 32) {
    throw new Error(
      'CONNECTION_ENCRYPTION_KEY deve ser uma string base64 de 32 bytes',
    );
  }

  return key;
}

export function encryptConnectionPassword(plain: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

export function decryptConnectionPassword(encrypted: string): string {
  const [ivB64, tagB64, dataB64] = encrypted.split(':');

  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Formato de senha criptografada inválido');
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
