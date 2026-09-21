# Local CUA accessibility and replacement patches

This x86_64 experiment rebuilds both the CLI and SDK from checksummed upstream
`cua-driver-rs-v0.28.2` source and retains the matching vendor companion assets.
Apply the following seven patches in order. The companion Hyprland plugin now
has a separately pinned Unicode transport layer; Atreyu code is unchanged.

## Patch stack

1. **chromium-accessibility.patch**: permit uniquely proven Chromium profile/audio
   title decorations and request BrowserRootView attributes for missing children.
   Ambiguous accessible/compositor windows still refuse association.
2. **exact-window-snapshots.patch**: prove the requested root before traversal,
   apply budgets only to its subtree, report partial/limit reasons, and stop
   retrying deterministic exhaustion. Retain native objects bound to snapshot,
   process/connection and exact window so scoped indexes cannot act through an
   unrelated application-wide re-walk. Indexed action consumers share this mapping.
3. **hyprland-unusable-geometry.patch**: preserve discovery of valid windows when
   another client has malformed bounds; unusable clients still participate in
   identity ambiguity checks and cannot be targeted through bad geometry.
4. **editable-text-contract.patch**: read complete native Text values, preserve
   explicitly empty strings, separate editability/name/placeholder/description/value
   and provenance, and remove the append-at-caret replacement fallback. Native
   replacement is confirmed only after independent complete same-field readback.
5. **native-selection-protection.patch**: keep protected/unknown content unreadable,
   distinguish actual native identification evidence, recognize the validated
   deleted Chromium executable case, and support an exact advertised `select`
   action only for eligible native Selectable roles. Selected-state readback is
   required; uncertain activation cannot replay through a coordinate fallback.
6. **chromium-foreground-replacement.patch**: publish native versus foreground
   replacement capabilities. Text-only Chromium fields require explicit
   `replacement_route:foreground_keyboard` and `delivery_mode:foreground`.
   The route preflights the whole string, revalidates retained identity/protection,
   focuses and selects the exact field, delivers guarded scalars through the
   companion plugin, and checks independent native text/caret/focus readback.
   Cancellation, uncertain delivery and mismatches stop without replay. It also
   preserves output-schema properties named `description`.
7. **replacement-failure-diagnostics.patch**: add static failed-stage and
   allowlisted reason labels to failure receipts. It does not change dispatch,
   guards, settling or retry behavior, and never exposes arbitrary errors or
   field content. A regression test checks the diagnostic privacy boundary.

The first six patches reproduce the installed driver 0.28.2-1.5. Patch seven is
new in the PR's **0.28.2-1.6** candidate and has not been installed. The companion
plugin recipe is **0.26.1-6.1**. Its upstream source, ABI profile and existing
independent-keymaps provenance remain pinned; `unicode-text.patch` is a separate
checksummed layer with its own provenance and integrity tests.

## Contracts

- [EDITABLE-TEXT.md](EDITABLE-TEXT.md): native observation, replacement and exact selection.
- [CHROMIUM-REPLACEMENT.md](CHROMIUM-REPLACEMENT.md): explicit foreground invocation,
  capability JSON, text constraints, receipts and deployment requirements.
- [VALIDATION.md](VALIDATION.md): exact artifact identities, tests and unresolved failures.

## Packaging and qualification

Build with `bin/build --package cua-driver-bin`. The recipe builds CLI and SDK
with locked dependencies, runs the relevant contract/cache/token/native/transport
checks, and preserves pacman updater containment. LTO is disabled because GCC
LTO objects from dependencies cannot be consumed by Rust's lld. The source
checksum and each incremental patch are pinned. Automatic updates remain held
with `sync:false` because the existing vendor release hook cannot rebase these
patches or refresh their source checksum.

This is a draft local experiment, not release qualification. Foreground BMP
Unicode replacement has an unresolved partial-delivery failure. Non-BMP input
is explicitly unsupported by this keyboard route. Native EditableText retains
full Unicode support. Full Suno acceptance, runtime foreground cancellation,
ARM and other compositors remain unqualified. Larger-page Jev selection and
Atreyu fallback behavior are separate work. Nothing here requests a merge or
package release.
