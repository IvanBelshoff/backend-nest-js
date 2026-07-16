jest.mock('../env.schema', () => ({
  env: {
    CONNECTION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  },
}));

import {
  decryptConnectionPassword,
  encryptConnectionPassword,
} from './connection-encryption.util';

describe('connection-encryption.util', () => {
  it('encrypts and decrypts password round-trip', () => {
    const plain = 'super-secret-password';
    const encrypted = encryptConnectionPassword(plain);

    expect(encrypted).not.toContain(plain);
    expect(decryptConnectionPassword(encrypted)).toBe(plain);
  });

  it('encrypts and decrypts empty password round-trip', () => {
    const encrypted = encryptConnectionPassword('');
    expect(decryptConnectionPassword(encrypted)).toBe('');
  });
});
