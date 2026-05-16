// Release-safe logger. In development (Metro bundler sets __DEV__ = true),
// messages are forwarded to console so they appear in the Metro log stream.
// In production builds __DEV__ is false, so the functions are no-ops and
// the calls are tree-shaken by the release bundler.
//
// Usage:
//   logWarn('Something failed', err);  // replaces console.warn(...)
//
// IMPORTANT: this does NOT replace user-facing Alert.alert() calls — those
// stay where they are so the user still sees actionable error messages.

export function logWarn(message: string, error?: unknown): void {
  if (__DEV__) {
    console.warn(message, error);
  }
}
