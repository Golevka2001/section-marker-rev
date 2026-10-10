/**
 * Unit tests for the request cache.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createAnalysisCache, REQUEST_TIMEOUT, RETRY_INTERVAL } from "../analysis-cache.ts";

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

// A clock the test drives, so the retry gap needs no real waiting.
function fakeClock(start = 1_000_000) {
	let time = start;
	return {
		now: () => time,
		advance: (ms: number) => {
			time += ms;
		},
	};
}

// Records what reached the client, and fails every time by default.
function recorder(
	behaviour: (attempt: number) => Promise<AudioAnalysis.Analysis> = () => Promise.reject(new Error("no analysis")),
) {
	const calls: string[] = [];
	return {
		calls,
		fetch: (uri: string) => {
			calls.push(uri);
			return behaviour(calls.length);
		},
	};
}

// A resolved sentinel cannot play this part: it would win every race.
const never = new Promise<never>(() => {});

test("what the cache stores is the projection, not the raw payload", async () => {
	// Asserted through the cache: pickMarkerData alone would still pass if the cache stopped using it.
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
	const cache = createAnalysisCache(recorder(() => Promise.resolve(fakeAnalysis())).fetch);

	// Both asks land before anything settles, so this covers the in-flight case too.
	const inFlight = cache.get("spotify:track:1");
	const sameRequest = cache.get("spotify:track:1");

	assert.deepEqual(cache.get("spotify:track:1"), sameRequest);
	assert.equal((await inFlight).track.duration, (await sameRequest).track.duration);
});

test("a failure is forgotten, and the track is asked again once the gap has passed", async () => {
	const clock = fakeClock();
	const { calls, fetch } = recorder((attempt) =>
		attempt === 1 ? Promise.reject(new Error("offline")) : Promise.resolve(fakeAnalysis(321)),
	);
	const cache = createAnalysisCache(fetch, clock.now);

	await assert.rejects(cache.get("spotify:track:1"), /offline/);

	// The loader's order: isDue, then get. Ticking through the gap sends nothing,
	// or a blip costs the track its markers for the rest of the song.
	for (let tick = 0; tick < RETRY_INTERVAL / 100 - 1; tick++) {
		clock.advance(100);
		if (cache.isDue("spotify:track:1")) await cache.get("spotify:track:1").catch(() => {});
	}
	assert.deepEqual(calls, ["spotify:track:1"]);
	assert.equal(cache.isDue("spotify:track:1"), false);

	clock.advance(100);
	assert.equal(cache.isDue("spotify:track:1"), true);
	const recovered = await cache.get("spotify:track:1");

	assert.deepEqual(calls, ["spotify:track:1", "spotify:track:1"]);
	assert.equal(recovered.track.duration, 321);
});

test("a rejected request nobody awaits does not surface as an unhandled rejection", async () => {
	const seen: unknown[] = [];
	const onUnhandled = (reason: unknown) => seen.push(reason);
	process.on("unhandledRejection", onUnhandled);

	try {
		const { fetch } = recorder();
		const cache = createAnalysisCache(fetch);

		// The preload path drops promises on the floor, so the cache has to cover it.
		cache.get("spotify:track:1");
		await new Promise((resolve) => setTimeout(resolve, 10));
	} finally {
		process.off("unhandledRejection", onUnhandled);
	}

	assert.deepEqual(seen, []);
});

test("a request the client never answers is treated as a failure", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });

	const cache = createAnalysisCache(() => new Promise(() => {}));

	const pending = cache.get("spotify:track:1");
	t.mock.timers.tick(REQUEST_TIMEOUT);

	// Without a bound this marker would sit loading for the rest of the track.
	await assert.rejects(Promise.race([pending, never]), /no answer within/);
});

test("the gap on one track does not hold up another", async () => {
	const clock = fakeClock();
	const cache = createAnalysisCache(recorder(() => Promise.resolve(fakeAnalysis())).fetch, clock.now);

	await cache.get("spotify:track:1");

	// A different track is unaffected by the first one's gap.
	assert.equal(cache.isDue("spotify:track:2"), true);
	assert.equal((await cache.get("spotify:track:2")).track.duration, 200);
});
