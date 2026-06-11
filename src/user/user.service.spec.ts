import * as bcrypt from 'bcrypt';
import { UsersService } from './user.service';

describe('UsersService', () => {
  it('hashes the password before saving a user', async () => {
    const save = jest.fn().mockImplementation((user) => Promise.resolve(user));
    const create = jest.fn().mockImplementation((user) => user);
    const service = new UsersService({
      create,
      save,
    } as any);

    const user = await service.create({
      nome: 'Ivan',
      sobrenome: 'Belshoff',
      email: 'ivan@example.com',
      senha: 'senha-segura',
    });

    expect(user.senha).toBeDefined();
    expect(user.senha).not.toBe('senha-segura');
    expect(user.senha).toMatch(/^\$2[aby]\$/);
    await expect(bcrypt.compare('senha-segura', user.senha!)).resolves.toBe(
      true,
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        senha: expect.not.stringMatching(/^senha-segura$/),
      }),
    );
    expect(save).toHaveBeenCalledWith(user);
  });
});
