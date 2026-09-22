import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

function isPublished(name, version) {
  try {
    const out = execFileSync('npm', ['view', `${name}@${version}`, 'version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    return out.toString().trim() === version;
  } catch {
    return false;
  }
}

const packages = readdirSync('packages')
  .map((dir) => ({ dir: join('packages', dir), pkg: JSON.parse(readFileSync(join('packages', dir, 'package.json'), 'utf8')) }))
  .filter(({ pkg }) => !pkg.private);

const published = [];
for (const { dir, pkg } of packages) {
  const id = `${pkg.name}@${pkg.version}`;
  if (isPublished(pkg.name, pkg.version)) {
    console.log(`skip     ${id} (already on npm)`);
    continue;
  }

  const out = mkdtempSync(join(tmpdir(), 'sentinel-pack-'));
  run('pnpm', ['pack', '--pack-destination', out], dir);
  const tarball = join(out, readdirSync(out)[0]);

  const args = ['publish', tarball, '--access', 'public'];
  if (dryRun) args.push('--dry-run');
  run('npm', args);
  console.log(`${dryRun ? 'dry-run ' : 'publish '} ${id}`);
  published.push(id);
}

if (published.length > 0 && !dryRun) {
  for (const id of published) run('git', ['tag', id]);
  run('git', ['push', 'origin', ...published.map((id) => `refs/tags/${id}`)]);
}
console.log(published.length > 0 ? `${dryRun ? 'Would publish' : 'Published'} ${published.length} package(s).` : 'Nothing to publish.');
