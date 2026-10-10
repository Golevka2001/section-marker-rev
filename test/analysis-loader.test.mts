/**
 * Unit tests for analysis-loader.ts. The loader's decisions are all about timing and ordering, so
 * it is driven tick by tick rather than asserted on in isolation.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { install } from "./stubs/harness.ts";
import { RETRY_INTERVAL } from "../analysis-cache.ts";

const TICK = 100;

test("a track that fails is asked again once per gap, and nothing else changes", async () => {
	const h = install();
	h.respond(() => Promise.reject(new Error("offline")));
	const { showAnalysisForUri } = await h.load();

	// Ticking the player is what produced a request a tick in the first place.
	for (let elapsed = 0; elapsed < 20_000; elapsed += TICK) {
		h.advance(TICK);
		showAnalysisForUri("spotify:track:1");
		await settle();
	}

	// One ask to start, then one per gap after it.
	assert.equal(h.requests.length, Math.ceil(20_000 / RETRY_INTERVAL) + 1);
	// The markers are repainted per attempt rather than per tick, which is what the gap is for.
	assert.equal(h.hydrates.length, h.requests.length * 2);
});

test("a blip heals: the track paints once the gap has passed", async () => {
	const h = install();
	let offline = true;
	h.respond(() =>
		offline ? Promise.reject(new Error("offline")) : Promise.resolve({ track: { duration: 200 }, sections: [] }),
	);
	const { showAnalysisForUri } = await h.load();

	h.advance(TICK);
	showAnalysisForUri("spotify:track:1");
	await settle();
	assert.deepEqual(h.hydrates, ["loading", "empty"]);

	offline = false;
	h.advance(RETRY_INTERVAL);
	showAnalysisForUri("spotify:track:1");
	await settle();

	// A momentary outage costs one retry, not the markers for the rest of the song.
	assert.deepEqual(h.hydrates, ["loading", "empty", "loading", "data"]);
});

test("an answer that lands after the track changed is dropped", async () => {
	const h = install();
	// Only the first request is held open, so the second answers at once.
	// The stale one is released after it.
	let releaseFirst: (value: unknown) => void = () => {};
	h.respond((uri) =>
		uri.endsWith("1")
			? new Promise((resolve) => {
					releaseFirst = resolve;
				})
			: Promise.resolve({ track: { duration: 200 }, sections: [] }),
	);
	const { showAnalysisForUri } = await h.load();

	h.advance(TICK);
	showAnalysisForUri("spotify:track:1");

	// The user skips before the answer arrives.
	h.advance(TICK);
	showAnalysisForUri("spotify:track:2");
	await settle();
	assert.deepEqual(h.hydrates, ["loading", "loading", "data"]);

	releaseFirst({ track: { duration: 999 }, sections: [] });
	await settle();

	// The stale answer must not repaint over what the second track showed.
	assert.deepEqual(h.hydrates, ["loading", "loading", "data"]);
});

// Lets the loader's promise chains run.
function settle() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
