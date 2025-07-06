# Changelog

## [Unreleased]

### Fixed
- **Scrollbar Position Memory**: Fixed scrollbar position reset when changing feed sites. The application now remembers the scroll position for each category and site, allowing users to return to their previous position when switching between different feeds.

### Dependencies Updated
- `@swc/core`: Updated from 1.12.7 to 1.12.9
- `@tailwindcss/postcss`: Updated from 4.1.10 to 4.1.11  
- `@vscode/sqlite3`: Updated from 5.1.2 to 5.1.8-vscode (corrected version)
- `lucide-react`: Updated from 0.522.0 to 0.525.0
- `next`: Updated from 15.3.3 to 15.3.5
- `postcss`: Updated from 8.5.5 to 8.5.6
- `tailwindcss`: Updated from 4.1.10 to 4.1.11
- `tw-animate-css`: Updated from 1.3.4 to 1.3.5
- `yarn`: Updated packageManager to yarn@4.9.2 (latest version)

### Improvements
- Added debounced scroll position saving during scrolling for better performance
- Improved scroll position restoration with proper DOM update timing
- Added cleanup functionality to save scroll position when component unmounts

### Technical Details
- Implemented a Map-based scroll position storage system
- Added scroll event listeners with debouncing (100ms)
- Enhanced location key generation for reliable position tracking
- Improved TypeScript compatibility for timeout handling