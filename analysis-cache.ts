/**
 * Request cache for the marker data.
 * It stores the results of analysis requests and provides a way to retrieve them.
 * The cache is keyed by the URI of the audio file.
 * The cache is cleared when Spotify restartsthe plugin is updated, or the extension is reloaded.
 */

import type { MarkerAnalysis } from "./logic";

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
	// The promise is stored rather than the result,
	// so a request still in flight is handed to whoever asks next instead of being sent again.
	const cached = new Map<string, Promise<MarkerAnalysis>>();

	return {
		has: (uri) => cached.has(uri),

		get(uri) {
			const held = cached.get(uri);
			if (held) return held;

			const request = fetchAnalysis(uri).then(pickMarkerData);

			// Attached before the promise can settle and never taken off:
			// a rejected preload has no other handler, and dropping the entry is what lets a later tick retry.
			request.catch(() => {
				if (cached.get(uri) === request) cached.delete(uri);
			});

			cached.set(uri, request);

			return request;
		},
	};
}
