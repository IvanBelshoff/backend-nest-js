import type { Request } from 'express';
import type { Usuario } from 'src/database/entities/Usuarios';

export interface UserRequest extends Request {
  user?: {
    sub: number;
    email: string;
    iat: number;
    exp: number;
  };
  authUser?: Usuario;
}