# Chromium Text-only replacement contract (local candidate)

Status: PR candidate 0.28.2-1.6 contains the installed 1.5 implementation plus diagnostic-only failure details. The companion plugin0.26.1-6.1 is installed locally on disk; loading it requires a desktop restart. Deep House passed foreground native/application readback, but a subsequent BMP Unicode replacement stopped partial. Full foreground and Suno acceptance remain incomplete. See [VALIDATION.md](VALIDATION.md) for exact versions and evidence.

## Field capabilities

Linux observation rows distinguish user editability from text replacement routes:

```json
{
  "role": "combo box",
  "editable": true,
  "protected": false,
  "value": "",
  "value_complete": true,
  "value_status": "complete",
  "value_source": "atspi.Text.GetText",
  "input_type": "text",
  "input_type_status": "known",
  "placeholder": "Search for songs, playlists, creators, or genres",
  "placeholder_source": "atspi.attribute:placeholder",
  "text_replacement": {
    "native": {"supported": false, "reason": "editable_text_interface_unavailable"},
    "foreground_keyboard": {
      "supported": true,
      "reason": "requires_explicit_foreground_and_fresh_focus",
      "constraints": {
        "max_characters": 4096,
        "max_distinct_characters": 128,
        "unicode_max": 65535,
        "control_characters": false,
        "excluded_codepoints": [8232, 8233]
      }
    }
  }
}
```

This is a representative contract example, not live candidate evidence. `supported` is boolean or null. True indicates observed field/transport eligibility; every action still revalidates retained identity, protection, focus, offsets and transport admission. Null means evidence is unavailable; it is not permission to attempt another route. With the current old plugin, an eligible Text-only field instead reports foreground `supported:false, reason:"foreground_unicode_transport_unavailable"`. A failed transport probe reports null with `foreground_transport_read_failure`. The probe is HELLO-only, does not claim a lane, and is briefly cached.

Protected fields omit `value`, report incomplete readback and both routes false with reason `protected`. Unknown protection/readback never becomes an empty value or a safe field. Native metadata and current values remain separate; input_type is never inferred as search. Known native EditableText fields advertise the native route. Output schemas advertise these native metadata fields, including description and provenance.

## Invocation

```json
{
  "pid": 1234,
  "window_id": 5678,
  "session": "admitted-session",
  "element_token": "fresh-token-from-this-window",
  "value": "Deep House",
  "replacement_route": "foreground_keyboard",
  "delivery_mode": "foreground"
}
```

Use this as the arguments to `set_value`. The default `replacement_route:"native"` remains native-only. Foreground requires both explicit fields above and an admitted session; a permission downgrade to background refuses. No hidden keyboard fallback, CDP, clipboard, or global virtual input is used.

The route activates the exact target window and leaves it active. It checks the retained field, preflights the whole string, obtains a native full-text selection, then delivers individually guarded Unicode scalars through the compositor. It checks native value, focus, selection and caret before/after each scalar. This is not an atomic browser field-focus lock; any observed loss stops the transaction without replay. There is no automatic retry after uncertain delivery.

Accepted foreground strings: at most 4096 Unicode scalar characters, at most 128 distinct scalars, within the Basic Multilingual Plane (U+0000 through U+FFFF). C0/C1 controls, DEL, U+2028, U+2029 and every non-BMP character are rejected before selection or input. Native EditableText retains its separate full-Unicode contract. A real Chromium test demonstrated truncation of U+1F98A to U+F98A through the keyboard path; the driver detected the mismatch and stopped. This is why the final foreground route refuses non-BMP strings before editing. BMP text such as `café 東京 é` has passed independent native and application readback. Maps are compiled and checked before editing; the original per-resource keymap is restored after each scalar. Empty replacement uses checked deletion of the complete native selection.

## Action result

The existing strict action-result schema is preserved: `effect`, `route`, optional `delivery`, `evidence`, `escalation`. No requested or resulting text is copied into the receipt. A confirmed foreground replacement has route `global_input`, foreground delivery, and native value-readback evidence. Its confirmation requires complete text from the same retained field to exactly match the requested string. A separate fresh `get_window_state` remains the caller's independent observation. Dispatch acknowledgment alone is insufficient.

Refusals before side effects have effect `refused`. Lost acknowledgments, changed focus or failed readback after activation/input are `unverifiable` or `partial`, with acknowledged editing progress where known. Refresh state; never automatically replay an uncertain replacement.

## Diagnostic-only 1.6 addition

Failed replacements now include a static stage and allowlisted reason in the
textual error detail, for example `stage=after_input_readback; reason=native_readback_incomplete`.
That example describes the format, not a demonstrated cause of the observed
Unicode failure. The structured action-result shape and its delivery/effect
accounting remain unchanged. Unknown errors become `unclassified_failure`;
arbitrary native/transport error strings and field text are never included.
This diagnostic change does not add retries or relax any guard.

## Deployment boundary

This route requires a companion local cua-hyprland-plugin patch advertising both `foreground_unicode_scalar:true` and `foreground_unicode_max >= 65535`. Existing plugin ABI/profile and independent-keymaps provenance remain pinned. The old compositor plugin reports upgrade mode desktop_restart; restarting only cua-driver cannot add this capability. A live desktop restart is not performed by these tests.

Text replacement success does not prove result selection, playback, or the entire Atreyu Jev loop.
