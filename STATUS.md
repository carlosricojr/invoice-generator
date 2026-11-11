# Status — 2026-11-11

## Phase

Maintenance: adopt the canonical handbook review-policy pointer and a shared
agent bootstrap; correct the unsupported Node 18 requirement. Runtime source,
dependencies, billing behavior and estimator selection are unchanged.

## Ball is with

The maintenance coordinator owns review, merge-readiness checks and merged CLI
verification. No customer input or real billing data is needed for this scope.

## Next action

Obtain independent current-diff review and the canonical review of record, then
check readiness. After merge, repeat the build and staged CLI/PDF smoke against
the merged revision. Keep synthetic evidence outside Git and leave existing
customer files and local installations untouched.

## Done

Verified on 2026-11-11:

- Frozen pnpm install and TypeScript build pass on Node 26.13.0 LTS / pnpm
  10.30.0. The official isolated runtime was checksum-verified; the machine's
  default runtime was not changed. The earlier Node 26.12.1 check used a
  pre-LTS release and does not establish LTS compatibility.
- The staged, offline CLI produced a one-page synthetic PDF with 0.2 billed
  hours and a $20.00 total. Quoted CSV fields and nonbillable exclusion passed;
  the rendered page was inspected. No external estimator or retainer write ran.
- Fresh pnpm audit reports two advisories. The
  [csv-parse advisory](https://github.com/adaltas/node-csv/security/advisories/GHSA-8cw4-87c7-c6xx)
  requires duplicate-column grouping, which this parser does not enable.
  A positive control reproduced the affected option combination; the actual
  parser and default options preserved the ordinary object prototype.
  The [esbuild advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-g7r4-m6w7-qqqr)
  concerns its Windows development server; this CLI does not start that server.
  These are finding-specific applicability conclusions, not a clean audit.
- No repository workflows or GitHub deployments exist, and no hosting target
  is documented. Browser/hosting verification is inapplicable to this CLI;
  staged CLI execution and PDF rendering provide the relevant validation.

