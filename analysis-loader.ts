/**
 * Loads marker data for whichever track is playing, and preloads the next one.
 * Every request goes through the shared cache,.
 * A response that arrives after the track changed is dropped rather than shown.
 */

import { client } from "/modules/stdlib/mod.ts";

import { hydrateLoading, hydrateEmpty, hydrateAnalysis } from "./interface";
import { shouldPreload, type MarkerAnalysis } from "./logic";
import { createAnalysisCache } from "./analysis-cache";

export function canThisBeAnalyzed(uriRAW: any) {
	if (!uriRAW) return false;

	const uri = client.uri.from(uriRAW);
	return uri && uri.type === client.uri.Type.TRACK;
}

// A queue entry can carry a ?context= or #anchor= tail naming the same track,
// which getAudioData ignores anyway.
function cacheKey(uriRAW: any) {
	return client.uri.from(uriRAW).getPath();
}

const analysisCache = createAnalysisCache((uri: string) => Spicetify.getAudioData(uri));

function getAnalysis(uriRAW: any): Promise<MarkerAnalysis> {
	return analysisCache.get(cacheKey(uriRAW));
}

let analysisIndex = 0;
let shownURI: string | null = null;
let blankedURI: string | null = null;

// The gap is survived by ticking, so a track is only blanked once.
function blank(uriRAW: any) {
	if (blankedURI === uriRAW) return;

	blankedURI = uriRAW;
	hydrateEmpty();
}

export function showAnalysisForUri(uriRAW: any) {
	if (uriRAW === shownURI) return;

	if (!canThisBeAnalyzed(uriRAW)) {
		shownURI = uriRAW;
		blank(uriRAW);
		return;
	}

	const uri = cacheKey(uriRAW);

	// A preload counts as the ask, and it is the freshest attempt the gap can be given.
	if (!analysisCache.has(uri) && !analysisCache.isDue(uri)) {
		// The gap holds the request back, not the markers: what is on screen is the previous track's.
		blank(uriRAW);
		return;
	}

	shownURI = uriRAW;
	blankedURI = null;
	const thisAnalysisIndex = ++analysisIndex;

	hydrateLoading();

	getAnalysis(uriRAW)
		.then((audioData) => {
			if (thisAnalysisIndex !== analysisIndex) return;

			hydrateAnalysis(audioData);
		})
		.catch((err) => {
			console.warn("[section-marker-rev] Failed to get audio data for", uriRAW, err);
			if (thisAnalysisIndex !== analysisIndex) return;

			// Forget the URI so a later tick can try again.
			// A failed request is usually transient,
			// and keeping the URI would leave this track blank until another one was played.
			if (shownURI === uriRAW) shownURI = null;

			blank(uriRAW);
		});
}

let lastPreloadURI: string | null = null;
let lastPreloadTime = 0;
export function preloadAnalysis(uriRAW: any) {
	if (!canThisBeAnalyzed(uriRAW)) return;

	// Already held or already in flight, so there is nothing left to send.
	if (analysisCache.has(cacheKey(uriRAW))) return;

	// Asked too recently to be worth another request.
	if (!analysisCache.isDue(cacheKey(uriRAW))) return;

	if (!shouldPreload(uriRAW, lastPreloadURI, lastPreloadTime, Date.now())) return;

	lastPreloadURI = uriRAW;
	lastPreloadTime = Date.now();

	// Uncaught on purpose: the cache's own handler covers the rejection.
	getAnalysis(uriRAW);
}
