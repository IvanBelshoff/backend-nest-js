import { env } from 'src/shared/env.schema';

export const jwtConstants = {
  secret: env.JWT_SECRET,
};
