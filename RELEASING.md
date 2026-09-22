# Releasing

The packages in `packages/` are published to npm under the `@sentinel-aml` organization. The app in `apps/sentinel` is private and never published.

## Everyday flow

1. **In every pull request that changes a package**, add a changeset:

   ```bash
   pnpm changeset
   ```

   Pick the packages, the semver bump (`patch`, `minor` or `major`), and write one line for the changelog. Commit the generated file in `.changeset/`. CI fails if a package changed without one. For changes that shouldn't release anything (tests, internal refactors), use `pnpm changeset --empty`.

2. **When you want to release**, open a pull request that applies the pending changesets:

   ```bash
   git checkout -b release
   pnpm version-packages
   git commit -am "Version packages"
   ```

   This bumps versions, updates each package's `CHANGELOG.md`, and refreshes the lockfile. Review the changes like any other pull request.

3. **Merge it.** The Release workflow runs on every push to `main`, builds and tests everything, and publishes each package whose version isn't on npm yet. It then tags each release as `<name>@<version>`. Pushes that don't bump a version publish nothing.

Check what would be published at any time with `pnpm release:dry-run`.

## How publishing is secured

- **No npm tokens.** The workflow authenticates with [npm trusted publishing](https://docs.npmjs.com/trusted-publishers): GitHub Actions proves its identity to npm through OIDC, and npm only accepts publishes from this repository's `release.yml`.
- **Provenance.** Every release carries a signed attestation linking it to the exact commit and workflow run that built it, shown as a verified badge on npm.
- **Protected branch and tags.** `main` only changes through pull requests with passing CI, and release tags can't be moved or deleted (see below).

## One-time setup

### 1. Create the npm organization

Sign in to [npmjs.com](https://www.npmjs.com) with your personal account (with two-factor authentication enabled), then **Add Organization** → `sentinel-aml` → free plan. In the organization's settings, turn on **Require two-factor authentication** for all members.

### 2. Publish the first versions by hand

A trusted publisher can only be configured on a package that already exists, so the very first release is manual. Run it from an up-to-date `main`:

```bash
npm login
pnpm build
for pkg in rules-core store-redis nestjs; do
  (cd packages/$pkg && pnpm publish --access public)
done
```

`pnpm publish` converts `workspace:^` dependencies into real version ranges. If npm asks for a one-time password, add `--otp=<code>` from your authenticator. Provenance is only generated from CI, so this first version won't have the badge; every release after it will.

### 3. Configure trusted publishing

For each of the three packages, on npmjs.com open **Settings → Trusted publishing**, choose **GitHub Actions**, and enter:

| Field | Value |
|---|---|
| Organization or user | `guiIhermevieira` |
| Repository | `sentinel` |
| Workflow filename | `release.yml` |
| Environment | `npm` |

Then, under **Publishing access**, select the option that requires two-factor authentication and disallows tokens. From then on, only the Release workflow (or you, with 2FA) can publish.

### 4. Protect the repository

Push the initial commit first: once the rules are active, `main` no longer accepts direct pushes. Then, with the GitHub CLI authenticated to your personal account:

```bash
./scripts/apply-rulesets.sh
```

It's safe to run again whenever the files in `.github/rulesets/` change. It enables squash merging only, deletes branches after merge, and applies:

- **Protect main:** changes only through pull requests, CI (`build-and-test`) must pass on an up-to-date branch, review conversations must be resolved, linear history, and no force pushes or deletion. Zero approvals are required, since this is a solo project; raise `required_approving_review_count` when collaborators join.
- **Protect release tags:** published version tags can't be deleted or moved.

Optionally, add yourself as a required reviewer on the `npm` environment (**Settings → Environments → npm**). Every publish will then wait for your approval.
