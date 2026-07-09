# Panic Kill Feature Explanation

The **Panic Kill** (or "Anti-Preview Strict Security Masking") feature in this application is a strict, privacy-focused security mechanism designed to instantly hide and destroy the chat interface the moment the application loses focus or is hidden by the operating system.

## Purpose
The primary purpose is to prevent **shoulder-surfing** and to block the operating system from capturing **app preview snapshots** (such as the recent apps screen on iOS/Android or the Alt+Tab menu on desktop). By immediately clearing the screen when the app is no longer the active foreground window, it ensures sensitive chat contents are never accidentally exposed or cached by the OS.

## How It Works

The feature listens for several aggressive browser events to detect when the user is no longer actively looking at or focusing on the application.

### Event Triggers
1. **`visibilitychange` (Hidden):** Triggers when the document's visibility state becomes `hidden` (e.g., switching to another tab or minimizing the browser).
2. **`blur`:** Triggers the moment the window loses exact focus (e.g., clicking the desktop taskbar, receiving a system notification that steals focus, or pressing Alt+Tab).
3. **`pagehide`:** A mobile-specific event that fires right before the page is suspended or unloaded by the mobile OS.
4. **`beforeunload`:** A fallback that triggers when the user is trying to navigate away or refresh the page.

### Execution (`triggerPanicLogout`)
When any of the above events are detected, the `triggerPanicLogout()` function executes synchronously:

1. **Verification:** It first checks if a user is currently logged in (`currentUser` exists).
2. **Instant Obliteration:** It immediately modifies the DOM in the same execution tick:
   - Sets the root document background to `#000000` (Pitch Black).
   - Sets the document's display property to `none` (hiding the entire root).
   - Clears `document.body.innerHTML = ''`, completely destroying the UI and any text/images currently on screen.
3. **Redirection:** After a brief 300ms delay, it redirects the browser to `about:blank`, ensuring the session is completely terminated and removed from the browser history stack.

## Exceptions

The panic kill feature is intentionally bypassed in a few specific scenarios to prevent frustrating false positives:
- **File Selection (`isSelectingFile`):** When the user clicks the attachment/upload button, the browser opens a native OS file picker dialog. This action naturally causes the browser window to lose focus (triggering `blur`). A flag (`isSelectingFile = true`) is temporarily set to suspend the panic kill feature during this action.
- **Phone Calls:** Opening a `tel:` link (via the call button) also naturally blurs the window, so panic kill is disabled for this interaction.
- **Development Mode (`DEV_MODE = true`):** For developer convenience, the entire security suite can be toggled off via a constant to allow debugging without constantly being logged out when opening the developer tools.
