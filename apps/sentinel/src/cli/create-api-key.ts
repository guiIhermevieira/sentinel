import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ApiKeysService } from '../auth/api-keys.service';
import { dataSourceOptions } from '../database/data-source-options';
import { ROLES, Role } from '../database/entities/api-key.entity';

async function main() {
  const [name, role] = process.argv.slice(2);
  if (!name || !ROLES.includes(role as Role)) {
    console.error(`Usage: create-api-key <name> <${ROLES.join('|')}>`);
    process.exit(1);
  }

  const db = await new DataSource(dataSourceOptions).initialize();
  try {
    const created = await new ApiKeysService(db).create(name, role as Role, { type: 'system', id: null, name: 'cli' });
    console.log(`Created ${created.role} key "${created.name}" (${created.id})`);
    console.log(`\n  ${created.key}\n`);
    console.log('Store it now: it cannot be shown again.');
  } finally {
    await db.destroy();
  }
}

void main();
