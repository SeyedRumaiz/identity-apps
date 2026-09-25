# Vendored packages

`wso2-live-chat-client-0.1.0.tgz` is `@wso2/live-chat-client` (the
framework-agnostic TypeScript client for console-chat-bridge's generic
`/v1/{tenant}/...` live-engineer-chat API), packed from its source repo
(`cs-tools/apps/live-chat-sdk/sdk-ts`, Stage 2 of that repo's live-chat SDK
extraction) via `pnpm pack`.

This is a **temporary** consumption method until the package is published to
a real npm registry -- see `package.json`'s `"@wso2/live-chat-client":
"file:./vendor/wso2-live-chat-client-0.1.0.tgz"` dependency. A vendored
tarball (not a `workspace:^`/`link:` reference across repos, and not a bare
git-repo dependency) was chosen because:

- it works from a plain `pnpm install` with no extra setup step, the same
  as any other dependency in this repo;
- it doesn't assume `cs-tools` is checked out at any particular relative
  path on a given machine or in CI;
- it's exactly what a real published tarball would contain, so swapping
  this for a real npm dependency later is a one-line version bump, not a
  structural change.

## Regenerating after an SDK change

```bash
# from cs-tools/apps/live-chat-sdk/sdk-ts
pnpm run build
pnpm pack
cp wso2-live-chat-client-0.1.0.tgz \
  ../../../identity-apps/features/admin.copilot.v1/vendor/
rm wso2-live-chat-client-0.1.0.tgz

# from identity-apps
pnpm install
```

If the SDK's own `package.json` version changes, update both the tarball's
filename and the `file:` reference in this package's `package.json`.
