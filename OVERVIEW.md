TokenFlux usage adds a TokenFlux card to Paseo's Usage screen. It shows the subscription's monthly plan usage and the daily or weekly limits when the plan sets them, the API key's rolling 5-hour, 1-day, and 7-day limits, the key's total quota or wallet balance, and request and token totals for today and all time. Each limit row has a percent used and a reset time when TokenFlux reports one.

The plugin reads the account from TokenFlux's usage endpoint with your own API key. Paseo draws the card and refreshes it with its other usage sources.

## Setup

Paseo 0.11.0 or later. The plugin takes the API key from the first of these that exists.

1. A key command in `tokenflux-usage.json` in the Paseo home directory. Paseo runs it without a shell and reads the key from its output. For 1Password that is `["op", "read", "op://Private/TokenFlux/credential"]`.
2. The `TOKENFLUX_API_KEY` environment variable in the Paseo daemon.

With neither, no card appears. The key must belong to the TokenFlux account whose usage you want to see.

`tokenflux-usage.json` is optional and has one field, `keyCommand`, the command array described above. Reload the plugin after editing the file.

## Data and limits

The key goes only to `https://tokenflux.dev/v1/usage`, as a bearer token, on each refresh. The plugin stores nothing and has no screen of its own; Paseo draws the card. The key command runs with the daemon's permissions, like all plugin server code.

The card shows the global usage of the configured key. Agent sessions do not contribute a login, so the per-agent context meter shows no TokenFlux quota. Subscription limits and usage come from the same endpoint, in the unit TokenFlux reports (Credits for most accounts). Request, token, and cost totals appear as text rows.

This plugin is independent of TokenFlux.
