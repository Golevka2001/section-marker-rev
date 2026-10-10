/**
 * Unit tests for the request cache.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createAnalysisCache } from "../analysis-cache.ts";

// Bulky fields filled in, so a projection that drops them is visible.
function fakeAnalysis(duration = 200) {
	return {
		meta: { analyzer_version: "v1" },
		track: { duration, tempo: 120, echoprintstring: "x".repeat(500) },
		sections: [
			{ start: 0, duration: 12.5, confidence: 0.9, loudness: -3 },
			{ start: 12.5, duration: 30.25, confidence: 0.8, loudness: -6 },
		],
		bars: [{ start: 0, duration: 2, confidence: 1 }],
		beats: [{ start: 0, duration: 1, confidence: 1 }],
		segments: [{ start: 0, duration: 1, confidence: 1, pitches: [1, 2], timbre: [3, 4] }],
		tatums: [{ start: 0, duration: 0.5, confidence: 1 }],
	} as unknown as AudioAnalysis.Analysis;
}

function countingFetcher() {
	const calls: string[] = [];

	return {
		calls,
		fetch: (uri: string) => {
			calls.push(uri);
			return Promise.resolve(fakeAnalysis());
		},
	};
}

test("what the cache stores is the projection, not the raw payload", async () => {
	// Asserted through the cache on purpose:
	// pickMarkerData alone would still pass if the cache stopped using it and started holding whole analyses.
	const cache = createAnalysisCache(() => Promise.resolve(fakeAnalysis(321)));

	assert.deepEqual(await cache.get("spotify:track:1"), {
		track: { duration: 321 },
		sections: [
			{ start: 0, duration: 12.5 },
			{ start: 12.5, duration: 30.25 },
		],
	});
});

test("the same uri is fetched once however often it is asked for", async () => {
	const { calls, fetch } = countingFetcher();
	const cache = createAnalysisCache(fetch);

	const first = await cache.get("spotify:track:1");
	const second = await cache.get("spotify:track:1");

	assert.deepEqual(calls, ["spotify:track:1"]);
	assert.deepEqual(second, first);
});

test("a request still in flight is shared rather than repeated", async () => {
	const { calls, fetch } = countingFetcher();
	const cache = createAnalysisCache(fetch);

	// Both asks land before anything settles.
	const inFlight = cache.get("spotify:track:1");
	const sameRequest = cache.get("spotify:track:1");

	assert.deepEqual(calls, ["spotify:track:1"]);
	assert.deepEqual(await inFlight, await sameRequest);
});

test("a result is still there after the request has settled", async () => {
	const { calls, fetch } = countingFetcher();
	const cache = createAnalysisCache(fetch);

	await cache.get("spotify:track:1");
	await new Promise((resolve) => setTimeout(resolve, 0)); // let it settle
	await cache.get("spotify:track:1");

	assert.deepEqual(calls, ["spotify:track:1"]);
});

test("different tracks are cached apart from each other", async () => {
	const { calls, fetch } = countingFetcher();
	const cache = createAnalysisCache(fetch);

	await cache.get("spotify:track:1");
	await cache.get("spotify:track:2");
	await cache.get("spotify:track:1");

	assert.deepEqual(calls, ["spotify:track:1", "spotify:track:2"]);
});

test("a failure is not remembered, so the next ask retries", async () => {
	const calls: string[] = [];
	const cache = createAnalysisCache((uri) => {
		calls.push(uri);
		return calls.length === 1 ? Promise.reject(new Error("no analysis")) : Promise.resolve(fakeAnalysis());
	});

	await assert.rejects(cache.get("spotify:track:1"), /no analysis/);

	const retried = await cache.get("spotify:track:1");

	assert.deepEqual(calls, ["spotify:track:1", "spotify:track:1"]);
	assert.equal(retried.track.duration, 200);
});

test("a failure nobody awaits does not surface as an unhandled rejection", async () => {
	const seen: unknown[] = [];
	const onUnhandled = (reason: unknown) => seen.push(reason);
	process.on("unhandledRejection", onUnhandled);

	try {
		// The preload path drops the promise on the floor,
		// so the cache is what has to keep this from becoming an unhandled rejection.
		createAnalysisCache(() => Promise.reject(new Error("no analysis"))).get("spotify:track:1");
		await new Promise((resolve) => setTimeout(resolve, 10));
	} finally {
		process.off("unhandledRejection", onUnhandled);
	}

	assert.deepEqual(seen, []);
});

test("has reports what is held without starting anything", async () => {
	const { calls, fetch } = countingFetcher();
	const cache = createAnalysisCache(fetch);

	assert.equal(cache.has("spotify:track:1"), false);
	assert.deepEqual(calls, []);

	await cache.get("spotify:track:1");

	assert.equal(cache.has("spotify:track:1"), true);
	// Peeking must not spend a request of its own either.
	assert.deepEqual(calls, ["spotify:track:1"]);
});
