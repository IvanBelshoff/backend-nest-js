import { SetMetadata } from '@nestjs/common';

export const RESOURCE_OWNER_KEY = 'resourceOwner';

export interface ResourceOwnerMetadata {
  param: string;
  roles?: string[];
}

export const SelfOrAdmin = (param = 'id') =>
  SetMetadata(RESOURCE_OWNER_KEY, {
    param,
    roles: [],
  } satisfies ResourceOwnerMetadata);

export const SelfOrRoles = (roles: string[], param = 'id') =>
  SetMetadata(RESOURCE_OWNER_KEY, {
    param,
    roles,
  } satisfies ResourceOwnerMetadata);
