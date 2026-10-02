# claude-mods

Personal [Claude Code mods](https://code.claude.com/docs/en/plugins/mods/overview) (Claude Code ≥ 2.1.287), as a local plugin marketplace named `salik-mods`.

## usage-weather

Band above the prompt: context window forecast, plus 5h/7d rate-limit meters with a pace icon, reset countdown, and an "out ~Xm" projection when usage is on track to run out before reset. Toasts at 80% and 90%. Nerd Font icons by default; set the `icons` option to `plain` otherwise.

Reads only what Claude Code already has (`$.session.usage()`, `session.measure`); makes no API calls.

Based on [token-weather](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods/token-weather) (Apache-2.0).

## Install

Live from disk (edits hot-reload), in the `env` block of `~/.claude/settings.json`:

```json
"CLAUDE_CODE_PLUGIN_DIRS": "~/personal/claude-mods/usage-weather"
```

Or as a marketplace install (cached copy; `claude plugin update` after edits):

```
claude plugin marketplace add ~/personal/claude-mods
claude plugin install usage-weather@salik-mods --scope user
```

Use one, not both.

## Develop

```
cd usage-weather
claude plugin validate .
claude plugin test .
```
