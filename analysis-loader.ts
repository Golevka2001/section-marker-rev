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
export function showAnalysisForUri(uriRAW: any) {
	if (uriRAW === shownURI) return;
	shownURI = uriRAW;

	const thisAnalysisIndex = ++analysisIndex;
	if (!canThisBeAnalyzed(uriRAW)) {
		hydrateEmpty();
		return;
	}

	hydrateLoading();

	getAnalysis(uriRAW)
		.then((audioData) => {
			if (thisAnalysisIndex !== analysisIndex) return;

			hydrateAnalysis(audioData);
		})
		.catch((err) => {
			console.warn("SECTION-MARKER: Failed to get audio data for", uriRAW, err);
			if (thisAnalysisIndex !== analysisIndex) return;

			// Forget the URI so a later tick can try again. A failed request is
			// usually transient, and keeping the URI would leave this track blank
			// until another one was played.
			if (shownURI === uriRAW) shownURI = null;

			hydrateEmpty();
		});
}

let lastPreloadURI: string | null = null;
let lastPreloadTime = 0;
export function preloadAnalysis(uriRAW: any) {
	if (!canThisBeAnalyzed(uriRAW)) return;

	// Already held or already in flight, so there is nothing left to send.
	if (analysisCache.has(cacheKey(uriRAW))) return;

	if (!shouldPreload(uriRAW, lastPreloadURI, lastPreloadTime, Date.now())) return;

	lastPreloadURI = uriRAW;
	lastPreloadTime = Date.now();

	// Uncaught on purpose: the cache's own handler covers the rejection.
	getAnalysis(uriRAW);
}
