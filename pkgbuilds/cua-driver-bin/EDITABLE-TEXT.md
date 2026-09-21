# Native editable-text contract

`editable-text-contract.patch` applies after the three patches in PATCHES.md.
It repairs native Linux observations and native replacement without changing Atreyu
or using CDP. Later patches add exact selection/protection checks and a separately
requested foreground route; see [CHROMIUM-REPLACEMENT.md](CHROMIUM-REPLACEMENT.md).

## Observation

`get_window_state.structuredContent.elements` keeps the existing window-bound
element tokens and adds the following native evidence. Unknown optional fields
are omitted except `protected`, which is explicitly null when unknown; they are never fabricated from the role or label.

| Field | Contract |
| --- | --- |
| `editable` | Boolean from native Editable/ReadOnly state, or EditableText evidence if state is unavailable. Omitted if unknown. Does not promise that native replacement is available. |
| `editable_source` | Native evidence used for editability. |
| `value` | Actual string, including `""`. Missing means unreadable/unavailable, not empty. Numeric AT-SPI Value remains a string. |
| `value_complete` | True only when the complete value was read. |
| `value_status` | `complete`, `truncated`, `incomplete`, `changed_during_read`, `protected`, `protection_unknown`, `stale`, `platform_truncated`, `deadline`, `read_failure`, `unavailable`, or `not_applicable`. |
| `value_source` | `atspi.Text.GetText` or `atspi.Value.CurrentValue` when applicable. |
| `protected` | `true` when native evidence establishes protection, `false` only after readable native role/state/attributes establish non-protection, `null` if unknown. Protected/unknown values are omitted. |
| `protection_source` | `atspi.Role/Attributes`, `atspi.Role/State/Attributes`, or `unavailable`. |
| `native_attributes` | Optional object containing only native `id`, `tag`, `xml-roles`, `autocomplete` attributes when present; no inferred identity or arbitrary attribute passthrough. |
| `accessible_name` | Native computed name, when present; separate from current text. |
| `name_source`, `name_complete` | Native name provenance and read completeness. |
| `label`, `label_source` | For fields, supplied only with explicit native attribute/related-element name provenance. Content-derived, placeholder-derived, and unknown names remain `accessible_name`, not an asserted field label. |
| `placeholder`, `placeholder_source` | Native placeholder attribute, when available. |
| `description`, `description_source`, `description_complete` | Separate native description and its provenance/read status. |
| `input_type`, `input_type_source` | Only a native `text-input-type` or `input-type` attribute. No search-purpose inference from role, name, placeholder, or children. |
| `input_type_status` | `known`, `unavailable`, `read_failure`, or `not_applicable`. |
| `attributes_complete` | Whether the native attribute query succeeded. |

Example from the disposable Chromium fixture (identity/geometry fields omitted):

```json
{
  "role": "entry",
  "accessible_name": "Fixture search",
  "name_source": "atspi.name-from:related-element",
  "name_complete": true,
  "label": "Fixture search",
  "label_source": "atspi.name-from:related-element",
  "editable": true,
  "editable_source": "atspi.State.Editable/ReadOnly",
  "value": "",
  "value_complete": true,
  "value_status": "complete",
  "value_source": "atspi.Text.GetText",
  "protected": false,
  "placeholder": "Find fixture items",
  "placeholder_source": "atspi.attribute:placeholder",
  "description": "Editable query description",
  "description_source": "atspi.description-from:aria-description",
  "description_complete": true,
  "input_type": "search",
  "input_type_source": "atspi.attribute:text-input-type",
  "input_type_status": "known",
  "attributes_complete": true
}
```

Text reads compare character counts and two reads, then recheck native
protection/state/attributes before publishing. The cap is 65,536 Unicode scalar
characters; a returned prefix is explicitly `truncated` and incomplete.
Changing reads are omitted. Markdown and native page-query output preserve
the completeness and name/value distinction too.

`verify_state` consumes these observations. Incomplete, protected or protection-unknown values can
prove neither equality nor inequality. Existing web-content trust restrictions
remain: GTK/native widget predicates can verify values, while web-content
predicates still return unknown under that policy.

## Replacement

The default native route of `set_value` uses `EditableText.SetTextContents` for text replacement
or `Value.SetCurrentValue` for numeric controls. The former is the native
[whole-content replacement operation](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/method.EditableText.set_text_contents.html).
The caret-based InsertText fallback is removed. There is no automatic focus,
clear-and-insert sequence, transport fallback or mutation retry.

The existing public action contract reports `effect: "confirmed"` only after
complete fresh native readback equals the requested value and retained-target
identity is revalidated. Unsupported/protected/readonly targets return an
error and `effect: "refused"`. Failures after a mutation attempt return an error
with `outcome_uncertain:` and `effect: "unverifiable"`, with unknown delivery.
Neither response echoes requested text. Cancellation before delivery refuses;
cancellation after an attempt is uncertain. The native worker retains session
admission until it exits.

Chromium in the tested environment exposes readable Text but no EditableText,
even after native activation. Therefore this patch fixes Chromium observation
but **does not enable native `set_value` replacement there**. It explicitly
refuses that unsupported method. GTK's native replacement route was exercised
successfully. Clients must distinguish `editable` from replacement support.

## Validation boundaries

Owned Chromium and GTK fixtures use persistent MCP in Atreyu's sanitized
environment. GTK independently journals widget values; Chromium's loopback
fixture journals its controls without CDP. Tested sequences include empty,
`Deep House`, replacement with `Ambient Drift`, Unicode, and clearing. GTK
`verify_state` confirms each value. A four-character widget limit transforms
`Deep House` into `Deep`: action confirmation is refused and fresh observation
reports the actual value. Protected/readonly targets and stale/wrong-window
tokens refuse. Search/Play activation and numeric slider value 37 still work.

The earlier 1.3 investigation could not prove the personal Suno window identity.
The fifth patch handles the verified deleted-Chromium-executable condition
without restarting the browser. The source candidate then captured Suno's
exact window and complete empty combobox text with native input type `text`.
The actual Suno control exposes Text but not EditableText: native `set_value`
refuses, leaving the independently read empty value unchanged. `verify_state`
continues to report unknown for web content under its existing trust policy.
Current candidate-specific evidence and installation status are recorded in the
local validation report; do not treat earlier fixture success as Suno acceptance.
Cancellation-before-dispatch is unit tested; interrupted D-Bus acknowledgement
is not fault-injected live. Raw browser captures remain private.

## Exact result selection

`click` with a fresh window-bound `element_token` first retains existing safe
activation priority (`press`, `click`, etc.). If none is available, the exact
native Action named `select` is permitted only for `list item`, `tree item`,
`table cell`, `page tab`, or `menu item` with fresh native Selectable state.
Namespaced editor actions, select-all, generic buttons, comboboxes and missing
Selectable state cannot take this route. The current action ordinal, role,
state, PID/connection/window and retained native object are checked before
`Action.DoAction`. There is no select-to-click mapping.

After acknowledgment, the same object's independently read Selected state
must be true for `effect:"confirmed"` with the existing public evidence kind `value_readback` (internal
AccessibilityReadback).
Missing/false state or lost target produces an error and `effect:"unverifiable"`.
A pre-dispatch refusal is `effect:"refused"`; delivery errors/timeouts after an
attempt are uncertain and never replay through synthetic input. Session
admission is retained while native work completes, and cancellation is checked
before delivery and after readback. Fresh snapshots expose `selected` for all
native Selectable objects, including table cells and tree items.

Component-only controls without an Action interface retain their existing
validated coordinate fallback where supported; an advertised select-only
result never takes that fallback. Coordinate requests likewise cannot replay
after an uncertain native attempt.

## Historical 1.4 evidence

The earlier 1.4 local package was installed and `cua-driver.service` was restarted.
Current installed and PR candidate identities are in [VALIDATION.md](VALIDATION.md).
Serving `/usr/lib/cua-driver/cua-driver` SHA256:
`c76579e5487d7035c21d2686eabbf988c0a7369f91e9d36f441a98d7cc4dc1c0`.
195 focused checks and native fixtures pass; owned editable and selection
fixtures were repeated through the installed service socket with serving
executable identity recorded. Package integrity reports 21 files, zero altered.
Atreyu MCP clients must reconnect and obtain fresh snapshots/tokens.
Actual Suno empty readback is complete, but Chromium's missing EditableText
interface still blocks native replacement; full Suno/Jev acceptance is not
established. See the private local validation report for exact evidence paths.
