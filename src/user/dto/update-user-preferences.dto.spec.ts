import { updateUserPreferencesSchema } from './update-user-preferences.dto';

describe('updateUserPreferencesSchema', () => {
  it('accepts valid partial preferences', () => {
    const result = updateUserPreferencesSchema.safeParse({
      theme: 'dark',
      accentColor: '#107C10',
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid accent color', () => {
    const result = updateUserPreferencesSchema.safeParse({
      accentColor: 'green',
    });

    expect(result.success).toBe(false);
  });

  it('rejects empty patch', () => {
    const result = updateUserPreferencesSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it('rejects invalid notification style', () => {
    const result = updateUserPreferencesSchema.safeParse({
      notification: { style: 'invalid-style' },
    });

    expect(result.success).toBe(false);
  });
});
