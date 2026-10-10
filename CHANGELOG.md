# Changelog

## [Unreleased]

### Fixed

- A module load no longer hangs the loader when the client is slow to hand over its surfaces.
- A progress bar that never appears no longer leaves the interface waiting forever.
- A failed analysis is retried every 10s instead of on every player tick, and the gap no longer holds back the markers.
- An analysis request that never answers no longer holds the marker loading.

## [2.0.1] - 2026-10-10

### Added

- Analysis results are cached per track, so replaying one costs no further requests.

### Fixed

- A progress bar that turned up within the wait no longer logs a timeout warning afterwards.

### Removed

- The playbar width gate, which hid the markers on a narrow progress bar.

### Changed

- Each section's values are published as data attributes, so a theme can select a single section.

## [2.0.0] - 2026-10-07

First release of the Spicetify v3 port, forked from [Aimarekin's section-marker](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/tree/main/section-marker).

### Added

- Section markers in the mini player, which renders into its own window and previously had none.
- Markers for a track that is already playing when the module loads.
- A retry after a failed analysis fetch.
- Unit tests for the marker logic (`bun run test`).

### Fixed

- The width gate survives the client re-rendering the progress bar.
- The stylesheet is pinned, so the markers stay styled while the loader swaps it out and back.
- Markers are no longer clipped by the slider area.
- Repeating the entry is a no-op instead of a thrown error.

### Changed

- The marker colour follows the theme, instead of being a fixed white that was invisible on a light theme.
- Marker height is measured from the bar line rather than the progress bar, so a taller playbar no longer swallows it.
- The alternating sections carry a wash of their own, so they read where the backdrop filter does not apply.
- Ported to the v3 module standard.

[2.0.1]: https://github.com/Golevka2001/section-marker-rev/releases/tag/section-marker-rev@2.0.1
[2.0.0]: https://github.com/Golevka2001/section-marker-rev/releases/tag/section-marker-rev@2.0.0
