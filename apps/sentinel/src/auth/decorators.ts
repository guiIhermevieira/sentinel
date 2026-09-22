import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Role } from '../database/entities/api-key.entity';
import { Principal } from './principal';

export const PUBLIC_KEY = 'sentinel:public';
export const ROLES_KEY = 'sentinel:roles';

export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export function requestOf(context: ExecutionContext): { headers: Record<string, string | undefined>; principal?: Principal } {
  return context.getType<string>() === 'graphql'
    ? GqlExecutionContext.create(context).getContext().req
    : context.switchToHttp().getRequest();
}

export const CurrentPrincipal = createParamDecorator((_: unknown, context: ExecutionContext) => requestOf(context).principal);
