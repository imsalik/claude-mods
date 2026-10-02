# claude-mods

[Claude Code mods](https://code.claude.com/docs/en/plugins/mods/overview) (Claude Code ≥ 2.1.287), packaged as a plugin marketplace named `salik-mods`.

## usage-weather

![usage-weather band above the prompt](usage-weather/screenshots/band.png)

Band above the prompt: context window forecast, plus 5h/7d rate-limit meters with a pace icon, reset countdown, and an "out ~Xm" projection when usage is on track to run out before reset. Toasts at 80% and 90%. Nerd Font icons by default; set the `icons` option to `plain` otherwise.

Reads only what Claude Code already has (`$.session.usage()`, `session.measure`); makes no API calls.

Based on [token-weather](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods/token-weather) (Apache-2.0).

## Install

From GitHub:

```
claude plugin marketplace add imsalik/claude-mods
claude plugin install usage-weather@salik-mods --scope user
```

Or live from a clone, so edits hot-reload. Clone anywhere, then point the `env` block of `~/.claude/settings.json` at the mod folder:

```
git clone https://github.com/imsalik/claude-mods.git <clone-dir>
```

```json
"CLAUDE_CODE_PLUGIN_DIRS": "<clone-dir>/usage-weather"
```

Use one, not both.

## Develop

```
cd usage-weather
claude plugin validate .
claude plugin test .
```
