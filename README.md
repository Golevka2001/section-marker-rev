# Section Marker Rev

> [!NOTE]
> Fork of [Section Marker](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/tree/main/section-marker) (from [Aimarekin's Spicetify Extensions](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions)), ported to the Spicetify v3 module standard and revised. Original work by Aimarekin and Golevka2001.

See a song's highlighted sections straight from your playbar.

This extension adds markers and a highlighted background to the different sections of a song so you can quickly identify the rhythm and mood changes, drops, and other section distinctions for a song. Allows you to easily tell apart the swings of a song, identifying desired segments and quickly skipping to them.

The sections are fetched through Spotify's [Audio Analysis Web API](https://developer.spotify.com/documentation/web-api/reference/get-audio-analysis).

![Showcase](README.assets/showcase.gif)

This extension has been tested with the following themes:

![Default](README.assets/default.png)
![Dribbblish](README.assets/dribbblish-base.png)
![Dribbblish White](README.assets/dribbblish-white.png)
![Flow Pink](README.assets/flow-pink.png)
![Sleek Wealthy](README.assets/sleek-wealthy.png)
![Text Spotify](README.assets/text-spotify.png)
![Text Kanagawa](README.assets/text-kanagawa.png)

And in the mini player:

![Mini player](README.assets/mini-player.png)

The markers will be automatically hidden if the playbar is too narrow, which would make them look too cramped.

Sections are not available on local files due to Spotify limitations. Podcasts do not have sections.

## Installation

This is a Spicetify v3 module. Install it from the Spicetify Marketplace once published, or from a packed build:

```bash
bunx spicetify-kit pack dist/section-marker-rev@2.0.0      # zip the build, prints its sha256
bunx spicetify-kit install dist/section-marker-rev@2.0.0   # sideload into a running client
```

`spicetify-kit install` also accepts a `.zip`, so it can be pointed at a build attached to a release.

## Theming

If you are a theme developer, or would like to modify the aspect of this extension, you can modify the CSS rules applied by this extension. Head to [index.scss](https://github.com/Golevka2001/section-marker-rev/blob/main/index.scss) to see the applied SCSS.

This file is not plain CSS - it is SCSS, an extension of CSS that allows for an expanded syntax. It is compiled to CSS when the extension is compiled. To see the plain CSS, you can compile the SCSS with an [online tool](https://www.sassmeister.com), or inspect it from within Spicetify. Run `spicetify enable-dev-tools` to open Spicetify with devtools enabled (`CTRL+SHIFT+I`).

The marker's own appearance is driven by two custom properties, `--section-marker-marker-color` and `--section-marker-marker-size`. They default on `:root` and are re-declared on `.playback-bar .progress-bar`, so a theme can restyle the playbar without touching the mini player.

The colour follows the theme rather than being a fixed white, so the markers stay visible on a light theme's progress bar. It resolves through `--spice-text`, then the client's own `--text-base`, then a literal white for a client that declares neither — the same fallback chain the rest of the client uses. The wash behind the alternating sections takes its tint from that colour, so it darkens a light bar rather than washing white over it.

Progress bar height is measured at runtime and published as `--section-marker-playbar-height` on each progress bar. It is measured from the line the theme actually draws rather than the progress bar component around it, plus a small fixed reach, so the markers keep standing proud of the line however tall the playbar is.

## Building

```bash
bun install       # install dependencies
bun run check     # tsc + module standard audit
bun run test      # unit tests for the pure logic in logic.ts
bun run build     # bundle into dist/section-marker-rev@<version>
bun run dev       # watch, rebuild and hot-push into a running client
```

---

[Source code available on GitHub](https://github.com/Golevka2001/section-marker-rev)

Original project: [Aimarekin/Aimarekins-Spicetify-Extensions](https://github.com/Aimarekin/Aimarekins-Spicetify-Extensions/tree/main/section-marker)
