/**
 * Request cache for the marker data. No runtime URLs and no ambient globals, so
 * the whole file runs under `node --test`; the caller passes the fetcher in.
 */

import type { MarkerAnalysis } from "./logic";

// The stored form is a projection rather than the raw response: a full analysis
// is mostly bars, beats, segments and tatums, none of which reach a marker.
function pickMarkerData(audioData: AudioAnalysis.Analysis): MarkerAnalysis {
	return {
		track: { duration: audioData.track.duration },
		sections: audioData.sections.map((section) => ({ start: section.start, duration: section.duration })),
	};
}

export type AnalysisCache = {
	// Peeks without starting anything, so the preload path can ask first.
	has(uri: string): boolean;
	get(uri: string): Promise<MarkerAnalysis>;
};

export function createAnalysisCache(fetchAnalysis: (uri: string) => Promise<AudioAnalysis.Analysis>): AnalysisCache {
	// The promise is stored rather than the result, so a request still in flight
	// is handed to whoever asks next instead of being sent again. Nothing is ever
	// dropped: at tens of bytes a track, a cap would cost more than it saves.
	const cached = new Map<string, Promise<MarkerAnalysis>>();

	return {
		has: (uri) => cached.has(uri),

		get(uri) {
			const held = cached.get(uri);
			if (held) return held;

			const request = fetchAnalysis(uri).then(pickMarkerData);

			// Attached before the promise can settle and never taken off: a
			// rejected preload has no other handler, and dropping the entry is
			// what lets a later tick retry.
			request.catch(() => {
				if (cached.get(uri) === request) cached.delete(uri);
			});

			cached.set(uri, request);

			return request;
		},
	};
}
