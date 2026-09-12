# Maintainer workflow

## Reviewing changes

Prefer a focused pull request with a concrete before/after behavior and a reproduction or regression test. Check whether the change preserves authentication, network policy, credential isolation, and bounded execution. The [engineering standards](ENGINEERING.md) define the invariants and required area-specific checks.

Review generated code with the same standard as handwritten code. Avoid adding dependencies or abstractions without a demonstrated need. Keep operator-specific configuration, personal agent instructions, and temporary investigation output out of the repository.

## Merging

Require green Cloud QA and Repository quality results for the exact commit being merged. Dependency updates need the same review as application changes; do not merge an update just because it is automated. For changes to live services, distinguish fixture coverage from verification against a configured environment.

When changing a file location, update scripts, imports, documentation, and build configuration in the same change. `npm run verify:repo` checks common repository inconsistencies.

## Preparing a release

1. Choose a semantic version and keep `package.json`, `package-lock.json`, and `VERSION` consistent.
2. Write release notes around behavior, compatibility, migration steps, and known limitations.
3. Run `npm run check` and the relevant integration checks. Confirm both GitHub workflows pass.
4. Verify the first-run instructions from a clean checkout.
5. Review the exact artifacts and dependency licenses before publishing a package or image.

The root application package is private to prevent accidental npm publication. That flag does not change the repository's MIT license. SDK package publication, repository tags, GitHub releases, and deployment are explicit maintainer actions; CI does not perform them automatically.

## Database changes

Keep schema changes under `database/`. Use a disposable database to verify migrations and document the upgrade order and recovery strategy. Renaming or reorganizing migration files alone is not a reason to run them again.
