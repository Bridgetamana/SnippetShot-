# Changelog

All notable changes to SnippetShot will be documented here.

## [0.1.3] - 2025-09-07
### Added
- Save dialog replaces silent Downloads write.
- Initial snippet template structure (<template>) for cleaner DOM.

### Changed
- Hardened CSP earlier (later relaxed per user choice) with script nonce injection.
- Refined attribution overlay logic.

### Fixed
- Large CRLF formatting issue (620 lint errors) resolved.

## [0.1.2] - 2025-09-06
### Added
- Capture flash animation feedback.

### Removed
- Deprecated config keys and stale legacy files.

## [0.1.0] - 2025-09-05
### Added
- Attribution overlay feature (configurable enable + text).
### Changed
- Clipboard paste handling simplified (removed unwanted warning path).

## [0.0.1] - 2025-09-04
### Added
- TypeScript migration and build setup
- Modernized webview CSP and basic toolbar
- Compatibility updates for recent VS Code versions
