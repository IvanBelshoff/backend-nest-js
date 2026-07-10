import { StreamableFile } from '@nestjs/common';
import { IS_PUBLIC_KEY } from 'src/shared/decorators/auth-public.decorator';
import { UsersController } from './user.controller';
import type { UserRequest } from 'src/shared/interfaces/UserRequest';

describe('UsersController', () => {
  it('passes the uploaded photo to the create service method', async () => {
    const usersService = {
      create: jest.fn().mockResolvedValue({
        id: 1,
        nome: 'Ivan',
        email: 'ivan@example.com',
      }),
    };
    const controller = new UsersController(usersService as any);
    const dto = {
      nome: 'Ivan',
      sobrenome: 'Belshoff',
      email: 'ivan@example.com',
      senha: 'senha-segura',
    };
    const req = {
      user: { sub: 1, email: 'ivan@example.com', iat: 0, exp: 0 },
    } as UserRequest;
    const foto = {
      filename: 'foto-gerada.png',
      originalname: 'perfil.png',
      mimetype: 'image/png',
      size: 1024,
      path: 'C:\\uploads\\foto-gerada.png',
    } as Express.Multer.File;

    await controller.create(dto, req, foto);

    expect(usersService.create).toHaveBeenCalledWith(dto, req.user, foto);
  });

  it('marks the user photo route as public', () => {
    const metadata = Reflect.getMetadata(
      IS_PUBLIC_KEY,
      UsersController.prototype.findPhoto,
    );

    expect(metadata).toBe(true);
  });

  it('returns a streamable photo file with the stored content type', async () => {
    const usersService = {
      findPhotoFileByUserId: jest.fn().mockResolvedValue({
        path: 'src/shared/data/default/profile.jpg',
        type: 'image/jpeg',
      }),
    };
    const response = {
      set: jest.fn(),
    };
    const controller = new UsersController(usersService as any);

    const result = await controller.findPhoto(1, response as any);

    expect(usersService.findPhotoFileByUserId).toHaveBeenCalledWith(1);
    expect(response.set).toHaveBeenCalledWith({
      'Content-Type': 'image/jpeg',
    });
    expect(result).toBeInstanceOf(StreamableFile);
  });

  it('delegates preference updates to the service', async () => {
    const usersService = {
      updatePreferences: jest.fn().mockResolvedValue({
        version: 1,
        theme: 'dark',
        accentColor: '#0078D4',
        notification: {
          style: 'circularProgress',
          placement: 'bottom-right',
        },
        language: 'pt-BR',
      }),
    };
    const controller = new UsersController(usersService as any);

    const result = await controller.updatePreferences(1, { theme: 'dark' });

    expect(usersService.updatePreferences).toHaveBeenCalledWith(1, {
      theme: 'dark',
    });
    expect(result.theme).toBe('dark');
  });
});
