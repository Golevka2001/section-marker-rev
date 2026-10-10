/**
 * Request cache for the marker data.
 * It stores the results of analysis requests and provides a way to retrieve them.
 * The cache is keyed by the URI of the audio file.
 * The cache is cleared when Spotify restartsthe plugin is updated, or the extension is reloaded.
 */

import type { MarkerAnalysis } from "./logic";

// The player ticks every 100ms, so a retry per tick turns one unanalysable track into hundreds of requests.
// There is no telling a transient failure from a track with no analysis, so the gap is all that separates them.
export const RETRY_INTERVAL = 10000; // ms

// A request the client never answers would otherwise hold the marker loading for the rest of the track.
export const REQUEST_TIMEOUT = 8000; // ms

function pickMarkerData(audioData: AudioAnalysis.Analysis): MarkerAnalysis {
	return {
		track: { duration: audioData.track.duration },
		sections: audioData.sections.map((section) => ({ start: section.start, duration: section.duration })),
	};
}

export type AnalysisCache = {
	// Peeks without starting anything, so the preload path can ask first.
	has(uri: string): boolean;
	// Whether RETRY_INTERVAL has passed since this track's last attempt.
	// A request already in flight is not covered here; has() answers that.
	isDue(uri: string): boolean;
	get(uri: string): Promise<MarkerAnalysis>;
};

export function createAnalysisCache(
	fetchAnalysis: (uri: string) => Promise<AudioAnalysis.Analysis>,
	// Injected so the tests need not wait in real time.
	now: () => number = Date.now,
): AnalysisCache {
	// The promise is stored rather than the result,
	// so a request still in flight is handed to whoever asks next instead of being sent again.
	const cached = new Map<string, Promise<MarkerAnalysis>>();
	const lastAttempt = new Map<string, number>();

	// The client holds a request open forever if it never answers.
	function boundedFetch(uri: string): Promise<AudioAnalysis.Analysis> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(`no answer within ${REQUEST_TIMEOUT}ms`)), REQUEST_TIMEOUT);

			fetchAnalysis(uri).then(
				(value) => {
					clearTimeout(timer);
					resolve(value);
				},
				(err) => {
					clearTimeout(timer);
					reject(err);
				},
			);
		});
	}

	function msUntilDue(uri: string): number {
		const last = lastAttempt.get(uri);
		if (last === undefined) return 0;
		return Math.max(0, RETRY_INTERVAL - (now() - last));
	}

	return {
		has: (uri) => cached.has(uri),
		isDue: (uri) => msUntilDue(uri) === 0,

		// Every caller gates on isDue first; without that the gap below does not apply.
		get(uri) {
			const held = cached.get(uri);
			if (held) return held;

			lastAttempt.set(uri, now());

			const request = boundedFetch(uri).then(pickMarkerData);

			// Attached before the promise can settle and never taken off:
			// a rejected preload has no other handler, and dropping the entry lets a later tick retry.
			request.catch(() => {
				if (cached.get(uri) === request) cached.delete(uri);
			});

			cached.set(uri, request);

			return request;
		},
	};
}
