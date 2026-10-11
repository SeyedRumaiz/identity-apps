# Vendored packages

`wso2-live-chat-widget-0.2.0.tgz` is `@wso2/live-chat-widget`, the
`<wso2-live-chat>` web component for console-chat-bridge's live-engineer
chat, packed from `cs-tools/apps/live-chat-sdk/widget` with `pnpm pack`. It
bundles `@wso2/live-chat-client`, so nothing else needs installing.

This is a temporary way to consume it until the package is published to an
npm registry. A vendored tarball was chosen because:

- it works from a plain `pnpm install` with no extra setup step, the same
  as any other dependency in this repo;
- it doesn't assume `cs-tools` is checked out at any particular relative
  path on a given machine or in CI;
- it's exactly what a published tarball would contain, so switching to a
  registry dependency later is a one-line change.

## Updating to a new version

```bash
# from cs-tools/apps/live-chat-sdk/widget
pnpm install && pnpm run build && pnpm pack
cp wso2-live-chat-widget-<version>.tgz \
  ../../../../identity-apps/features/admin.copilot.v1/vendor/

# from identity-apps
pnpm install
```

Every build needs a new version number: a file with the same name but
different contents fails pnpm's integrity check. Delete the old tarball,
update the `file:` reference in this package's `package.json`, and add the
new file with `git add -f` (the repository ignores `*.tgz`).
