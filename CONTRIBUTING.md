# Contributing

AgentScope is currently maintained as an active personal project. Public issues
and pull requests are welcome when they stay within the project's safety model.

## Development

Before opening a pull request, run the lightweight local gate:

```powershell
npm run audit:repo
npm run lint
npm run typecheck
npm test
npm run i18n:check
```

For release candidates and desktop packaging work, use the manual release gate:

```powershell
npm run check:release
```

## Safety

Do not include real local session data, credentials, logs, transcripts, SQLite
databases, screenshots with private content, or machine-specific paths in public
issues or pull requests. Use synthetic fixtures and redacted examples.

Session delete, import, restore, Electron shell open/reveal, and Codex Control
changes must preserve backup, journal, evidence, and allowlist boundaries.

## License

No open-source license has been granted yet. Until a `LICENSE` file is added,
do not assume redistribution, commercial use, or derivative-use rights beyond
what GitHub requires for viewing and forking the public repository.
