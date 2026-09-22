import { Actor } from '../audit/audit';
import { Role } from '../database/entities/api-key.entity';

export interface Principal {
  id: string;
  name: string;
  role: Role;
}

export function actorOf(principal: Principal): Actor {
  return { type: 'api_key', id: principal.id, name: principal.name };
}
