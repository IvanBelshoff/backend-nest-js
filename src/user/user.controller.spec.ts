import { StreamableFile } from '@nestjs/common';
import { IS_PUBLIC_KEY } from 'src/shared/decorators/public';
import { UsersController } from './user.controller';

describe('UsersController', () => {
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
});
