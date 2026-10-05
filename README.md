# Section Marker

> [!NOTE]
> Standalone port of [Section Marker](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/tree/main/section-marker) (from [Aimarekin's Spicetify Extensions](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions)) to the Spicetify v3 module standard.

See a song's highlighted sections straight from your playbar.

This extension adds markers and a highlighted background to the different sections of a song so you can quickly identify the rhythm and mood changes, drops, and other section distinctions for a song. Allows you to easily tell apart the swings of a song, identifying desired segments and quickly skipping to them.

The sections are fetched through Spotify's [Audio Analysis Web API](https://developer.spotify.com/documentation/web-api/reference/get-audio-analysis).

![Showcase](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/blob/main/section-marker/assets/samples_reduced.gif?raw=true)

This extension has been tested with all major functional themes. Below are some examples:

![Default Example](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/blob/main/section-marker/assets/example_default.png?raw=true)
![Sleek Example](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/blob/main/section-marker/assets/example_sleek.png?raw=true)
![Blossom Example](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/blob/main/section-marker/assets/example_blossom.png?raw=true)
![Catpuccin Example](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/blob/main/section-marker/assets/example_catpuccin.png?raw=true)
![Ziro Example](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/blob/main/section-marker/assets/example_ziro.png?raw=true)
![Comfy Example](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/blob/main/section-marker/assets/example_comfy.png?raw=true)
![Bloom Example](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/blob/main/section-marker/assets/example_bloom.png?raw=true)
![Galaxy Example](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/blob/main/section-marker/assets/example_galaxy.png?raw=true)
![Nord Example](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/blob/main/section-marker/assets/example_nord.png?raw=true)
![Retroblur Example](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/blob/main/section-marker/assets/example_retroblur.png?raw=true)

Yes, even sidebar controls:

![Sidebar controls Example](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/blob/main/section-marker/assets/example_sidebar_controls.png?raw=true)

The markers will be automatically hidden
if the playbar is too thin, which would make them look too cramped.

They are shown in the playbar and in the mini player. The mini player is a
separate picture-in-picture window, so the extension sets up its own copy of
the markers in it. Because that window is only ever as wide as the window
itself, it hides them at a lower width than the playbar does.

**Notice**: Nord is not yet fully compatible and you may notice a small offset - a fix has been proposed to Nord's developers.

Sections are not available on local files due to Spotify limitations. Podcasts do not have sections.

## Installation
This is a Spicetify v3 module. Install it from the Spicetify Marketplace once published, or from a packed build:

```bash
spicetify-kit pack dist/section-marker@1.1.3     # zip the build, prints its sha256
spicetify-kit install dist/section-marker@1.1.3  # sideload into a running client
```

`spicetify-kit install` also accepts a `.zip`, so it can be pointed at a build attached to a release.

## Theming
If you are a theme developer, or would like to modify the aspect of this extension, you can modify the CSS rules applied by this extension. Head to [src/style.scss](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/blob/main/section-marker/src/style.scss) to see the applied SCSS.

This file is not plain CSS - it is SCSS, an extension of CSS that allows for an expanded syntax. It is compiled to CSS when the extension is compiled. To see the plain CSS, you can compile the SCSS with an [online tool](https://www.sassmeister.com), or inspect it from within Spicetify. Run `spicetify enable-dev-tools` to open Spicetify with devtools enabled (`CTRL+SHIFT+I`).

The marker's own appearance is driven by two custom properties, `--section-marker-marker-color` and `--section-marker-marker-size`. They default on `:root` and are re-declared on `.playback-bar .progress-bar`, so a theme can restyle the playbar without touching the mini player.

Progress bar height is measured at runtime and published as `--section-marker-playbar-height` on each progress bar, so the markers match the bar whatever height the theme uses.

## Building
This module is built with [spicetify-kit](https://spicetify.app/docs/development/).

```bash
bun install         # or npm install
npm run check       # tsc + module standard audit
npm run build       # bundle into dist/section-marker@<version>
npm run dev         # watch, rebuild and hot-push into a running client
```

`npm run dev` needs the client reachable on the remote debugging port; add `--launch` and it starts Spotify for you.

---

[Source code available on GitHub](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/tree/main/section-marker)

[![Github Stars badge](https://img.shields.io/github/stars/Aimarekin/Aimarekins-Spicetify-Extensions?logo=github&style=social)](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions)