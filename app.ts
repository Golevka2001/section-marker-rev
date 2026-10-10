/**
 * Starts the extension once the client has handed over the surfaces it needs.
 * The client builds them in pieces, so startup polls until they are all there.
 * Every tick refreshes the markers, and preloads the next track as it ends.
 */

import { client } from "/modules/stdlib/mod.ts";

import { injectInterface } from "./interface";
import { showAnalysisForUri, preloadAnalysis } from "./analysis-loader";
import { nextTrackUri, shouldPreloadNextTrack } from "./logic";

// The loader can call the entry more than once per page,
// so the listeners are attached only on the first run to avoid stacking up duplicates.
let hasAttached = false;

// The client hands its surfaces over in pieces,
// so startup polls until they are all there.
const CLIENT_READY_POLL_INTERVAL = 100; // ms

// Spicetify.Player.data only appears once a track is loaded,
// which on an idle session can take minutes, so this wait stays off the loader's promise.
function isClientReady() {
	return Boolean(client.player?.data && client.uri && client.locale && client.cosmos && client.react);
}

async function main() {
	while (!isClientReady()) {
		await new Promise((resolve) => setTimeout(resolve, CLIENT_READY_POLL_INTERVAL));
	}

	// Inject the playbar interface
	await injectInterface();

	if (hasAttached) return;
	hasAttached = true;

	function getCurrentURI() {
		const data = client.player.origin.getState();
		return data.hasContext ? data.item.uri || null : null;
	}

	function refresh() {
		showAnalysisForUri(getCurrentURI());

		// Preload the next song's data
		if (shouldPreloadNextTrack(client.player.getDuration(), client.player.getProgress())) {
			preloadAnalysis(nextTrackUri(Spicetify.Queue));
		}
	}

	// Watch for song changes to add the section markers
	client.player.addEventListener("onprogress", refresh);

	// The player only ticks while it is playing,
	// so a track that is already loaded when the module starts would sit there blank until the user skipped or resumed.
	client.player.addEventListener("songchange", refresh);
	client.player.addEventListener("nowplaying", refresh);

	// Cover the track that is already playing right now
	refresh();
}

export default main;
