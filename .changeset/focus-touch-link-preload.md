---
"@solidjs/router": patch
---

Link preloading on `focusin` and `touchstart` now works. Both went through the click handler's primary-button gate, which `FocusEvent` and `TouchEvent` never pass, so only a resting mouse pointer preloaded. Preload triggers now find the anchor without the button and modifier-key checks; click handling is unchanged.
