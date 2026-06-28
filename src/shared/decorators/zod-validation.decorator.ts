// shared/decorators/zod-validation.decorator.ts

import { UsePipes } from '@nestjs/common';
import * as zod from 'zod';
import { ZodValidationPipe } from '../ZodValidationPipe';
import { ZodQueryValidationPipe } from '../ZodQueryValidationPipe';

export function ZodValidation(schema: zod.ZodSchema) {
  return UsePipes(new ZodValidationPipe(schema));
}

export function ZodQueryValidation(schema: zod.ZodSchema) {
  return UsePipes(new ZodQueryValidationPipe(schema));
}
