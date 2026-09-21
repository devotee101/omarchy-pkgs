# Local validation and remaining gaps

## Version boundaries

| Artifact | Status | SHA256 |
| --- | --- | --- |
| Driver 0.28.2-1.5 CLI | Installed and serving after user-authorized upgrade | `cd3814147ad0cab7ccf8344ab79e5faec8962ffa3706895fe60b9aa80e515650` |
| Driver 0.28.2-1.5 package | Six-patch installed baseline | `e0b6307f82393c511846676a094e95cab1e646dce7e1fe5af8e1c5e8310d1bfb` |
| Plugin 0.26.1-6.1 module | Installed on disk; desktop restart needed to load | `7ab81aaf4568ed3e50f7631516175859c164b9650e735666ee043e951a5a46d2` |
| Plugin 0.26.1-6.1 package | Companion candidate | `e2ef5f30c9337c26b32e8ae3ca86f2d0d415ca24b247e59cec43c9b5d931a6fe` |
| Driver 0.28.2-1.6 | PR diagnostic candidate; not installed | 301 build checks passed; see below |

The installed service's `/proc/<pid>/exe` and package executable hashes matched.
A persistent MCP connection to that service's socket passed `health_report`.
This establishes executable identity and prerequisites, not foreground behavior
with the new plugin. Existing MCP clients must reconnect after driver restart.
No compositor restart or live plugin replacement was performed.

## Automated and native validation

- Installed-baseline 1.5 package build passed 300 focused checks: contract/schema,
  AT-SPI/cache, transport, rows/receipts, browser helper guards, token/dispatch,
  startup and lifecycle tests. Companion plugin passed 21 CTests and nine
  packaging integrity tests; pinned source/profile verification passed.
- All seven PR patches apply to pristine upstream source and reproduce the
  14 reviewed source files byte for byte. The diagnostic privacy test passes.
- The exact packaged 1.5 executable passed the complete background/native fixture
  suite over persistent direct MCP: Chromium empty/filled/cleared observation,
  protected/truncated values, numeric slider37, Search/Play fixture activation;
  GTK Deep House → Ambient Drift → café 🦊 → empty with independent native and
  application-journal readback; readonly/protected/stale/wrong-window refusal.
- Earlier traversal fixtures prove sibling growth/reordering does not consume
  the exact target subtree budget or redirect retained-token actions. Duplicate
  titles and destroyed/same-label replacements refuse. These are prior patch
  evidence, not a newly repeated full matrix for 1.6.
- A debug build passed the owned Chromium foreground replacement/guard matrix,
  including BMP Japanese/accented/combining text, clear, unsupported input,
  protected/stale/wrong-window cases and deliberate focus diversion. Decoy
  controls remained unchanged; interrupted operations were never replayed.
  That debug success does not override the packaged failure below.
- Independent source and packaging reviews corrected side-effect accounting and
  verified diagnostic privacy, route constraints and plugin provenance.

## Unresolved packaged foreground failure

With the exact packaged 1.5 executable and companion module in an isolated,
unlocked desktop, `Deep House` completed with independent native and application
readback. The following sanitized fixture request, `café 東京 é`, stopped at
`café 東京 e` after nine acknowledged editing packets. The returned receipt was:

```json
{
  "code": "replacement_delivery_or_readback_uncertain",
  "delivery": {"delivered_count": 9, "mode": "unknown"},
  "effect": "partial",
  "route": "global_input"
}
```

No retry occurred. This does not prove the combining-mark packet was attempted;
the preceding packet's readback could have stopped the loop. Transient text/caret
readback inconsistency is a source-supported hypothesis, not an established
cause. The seventh patch adds diagnostics to distinguish these stages; it does
not fix this unresolved failure or claim new foreground acceptance.

A separate non-BMP keyboard test delivered the wrong character in Chromium.
The final route therefore rejects non-BMP strings before selection/input,
plus controls, DEL, U+2028/U+2029. Native EditableText still supports emoji.

## Environment and acceptance limits

- Some runs correctly refused while the desktop was asleep or Hyprland retained
  an internal session lock. The user recovered the lock through normal desktop
  interaction; no guard was bypassed. A later screensaver focus change also
  caused a zero-input refusal. These runs are not counted as acceptance passes.
- Parent activation of the nested compositor refused exact primary binding.
  The successful ASCII run used independently verified natural focus after
  launch; it does not qualify parent-to-nested activation.
- A public Suno page in an owned temporary profile showed the logged-out landing
  view, not Search. No typing was attempted there. Actual Suno Search replacement,
  result selection, playback and the full Atreyu loop remain unproven.
- Foreground runtime cancellation and the final packaged guard matrix remain
  incomplete. Unit cancellation/no-replay tests pass. Interrupted native D-Bus
  acknowledgments were not fault-injected live.
- The initial nested fixture disturbed the shared AT-SPI socket. Only owned
  fixture processes were stopped; the accessibility service and existing driver
  were restored. Subsequent fixtures used verified private runtime/accessibility
  buses. All owned nested desktops, browsers, buses and test sessions are cleaned up.
- ARM, other compositors/toolkits and broad desktop recording are unqualified.
  Raw browser captures, private logs and package binaries are not published here.

## PR candidate build

The isolated `bin/build --package cua-driver-bin` build completed successfully
with **301 focused checks passed**. This includes the new diagnostic privacy
regression; all other installed-baseline checks remain in the recipe. Both CLI
and SDK were rebuilt. The plugin packaging integrity suite was also repeated:
nine tests passed. Independent review found no remaining blocking source or
packaging findings.

- Driver 1.6 package SHA256: `e6fd6970edd0877eacc6c33fc17dfe826fda91d86482678dc3e34d1a7a68a485`
- Driver 1.6 CLI SHA256: `7c06a4919f2be486615ca64fb9651b319753b353e7eee519b8520ea27aaf3e66`
- Driver 1.6 SDK SHA256: `60389c3dd9ba1ae95ac97396e28997a9bf21b25d132453ecd661a2c9f68659aa`

These artifacts are local and unpublished. Driver 1.6 has not been installed or
live-qualified; the installed driver remains 1.5. No new GUI input was performed
while preparing this PR update.
