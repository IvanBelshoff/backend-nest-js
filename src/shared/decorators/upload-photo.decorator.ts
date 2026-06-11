import {
  applyDecorators,
  BadRequestException,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';

const USER_PHOTOS_PATH = join(
  process.cwd(),
  'src',
  'shared',
  'data',
  'fotos-usuarios',
);

const MAX_PHOTO_SIZE = 4 * 1024 * 1024;

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

mkdirSync(USER_PHOTOS_PATH, { recursive: true });

export function UploadPhoto(fieldName: string) {
  return applyDecorators(
    UseInterceptors(
      FileInterceptor(fieldName, {
        storage: diskStorage({
          destination: USER_PHOTOS_PATH,
          filename: (_request, file, callback) => {
            callback(null, `${randomUUID()}${extname(file.originalname)}`);
          },
        }),
        limits: {
          fileSize: MAX_PHOTO_SIZE,
        },
        fileFilter: (_request, file, callback) => {
          if (!ALLOWED_PHOTO_TYPES.includes(file.mimetype)) {
            return callback(
              new BadRequestException(
                'A foto deve ser uma imagem JPEG, PNG ou WebP',
              ),
              false,
            );
          }

          callback(null, true);
        },
      }),
    ),
  );
}
