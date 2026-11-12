# paseo-tokenflux-usage

A Paseo plugin that shows TokenFlux usage in the Usage screen. [OVERVIEW.md](OVERVIEW.md) describes what it shows and how it finds your API key. [中文说明](OVERVIEW.zh-CN.md).

## Install

```sh
paseo plugin add git:gtoxlili/paseo-tokenflux-usage
```

Needs Paseo 0.11.0 or later. Third-party plugins only run when the Paseo config has `"pluginsEnabled": true`. Run `paseo reload` after changing it.

## Key command

To keep the key in a password manager, create `tokenflux-usage.json` in the Paseo home directory (`~/.paseo`, or `$PASEO_HOME`). Paseo runs the command without a shell and reads the key from stdout.

```json
{
  "keyCommand": ["op", "read", "op://Private/TokenFlux/credential"]
}
```

Without the file, the plugin reads `TOKENFLUX_API_KEY` from the Paseo daemon environment.

## Development

```sh
npm install
npm run typecheck
```

The plugin has no build step. `mapUsage` in `server/usage.ts` turns the usage response into the report Paseo draws.
