# Changelog

All notable changes to GitMind are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] - 2026-08-31

### Added
- 3D health gauge with post-processing effects
- Performance monitoring hook
- Mobile optimization hook
- 3D scene components integrated into dashboard
- PR review and impact analysis endpoints
- Org audit and incident report endpoints
- Crisis chat with WebSocket support
- Command palette (Cmd+K) for quick navigation
- Keyboard shortcuts overlay (?)
- PDF export for analysis reports
- Sentry error tracking integration

### Fixed
- Theme scrim tokens — backdrops were transparent on dark themes
- Landing page theme race condition
- Escape key priority in modals
- Focus traps and safe areas on mobile
- 3D scene rendering issues
- Missing useCallback import in SceneManager
- Unused React imports across components
- Card header selector orphaned by card-block cleanup

### Changed
- Surface contrast improvements for accessibility
- Static landing gauge for better performance
- Stable frame callbacks for animation performance

## [1.0.0] - 2026-08-01

### Added
- Initial release
- 6 AI agents running in parallel (architecture, API, security, CVE, code quality, docs)
- GitHub repository analysis via URL or username
- Dashboard with summary, architecture visualization, API docs, security audit, CVE scanning, git audit, code audit, PR review
- FastAPI backend with 17 endpoints
- React frontend with responsive design
- Dark/light theme support
- Real-time analysis via WebSocket
- Health check and Prometheus metrics
