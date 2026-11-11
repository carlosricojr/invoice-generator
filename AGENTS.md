# Invoice Generator

> **Start here.** Read `STATUS.md` next: it holds the current position and who
> owes the next move. Those two files are the whole bootstrap. Read everything
> else on demand.
>
> **Shared conventions** live in the handbook: `$OSPINA_HANDBOOK`, which defaults
> to `../../handbook`. If you have neither, it is
> <https://github.com/ospina-company/handbook>. Clone it rather than skipping a
> rule. House prose rules, including the mandatory humanizer pass on any
> client-facing draft an agent writes, are in `handbook/conventions/prose.md`.

This repository owns the Clockify CSV-to-PDF CLI. `README.md` describes its
commands; `src/` contains parsing, estimation, retainer state and rendering.

- Preserve customer configuration, CSV exports, generated invoices and retainer
  ledgers. Do not use real billing data for maintenance validation.
- Invoice generation can debit retainers. Both retainer lookup and legacy-ledger
  migration resolve paths relative to the source module, not the working
  directory. Test generation from a separate staged copy of the runtime with
  synthetic configuration, CSV and state; changing only `cwd` is insufficient.
- Use `--skip-ai true` for offline synthetic checks. Do not contact clients or
  invoke the external estimator as part of routine maintenance validation.
- Preserve billing arithmetic, rounding and commercial terms unless the task
  explicitly authorizes changing them.
- Install with `pnpm install --frozen-lockfile` and validate with `pnpm build`.
  For CLI/render changes, run a staged synthetic invoice and inspect its PDF.
- Follow `docs/agents/coderabbit-pr-review-loop.md` before pushing or merging.
  Update and commit `STATUS.md` before the final review of a working session.
