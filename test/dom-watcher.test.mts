/**
 * Unit tests for dom-watcher.ts.
 *
 * document.body and MutationObserver are stood in for: what matters is that the wait
 * always settles and the observer is gone on every path out.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { waitForElm } from "../dom-watcher.ts";

// The same five seconds dom-watcher waits before giving up.
const WAIT_TIMEOUT = 5000;

class FakeMutationObserver {
	static instances: FakeMutationObserver[] = [];

	disconnects = 0;

	private readonly callback: () => void;

	constructor(callback: () => void) {
		this.callback = callback;
		FakeMutationObserver.instances.push(this);
	}

	observe() {}

	disconnect() {
		this.disconnects++;
	}

	// Stands in for the client mutating the DOM.
	fire() {
		this.callback();
	}
}

// What a query returns, flipped by a test to simulate the element turning up.
let found: { id: string } | null = null;

globalThis.MutationObserver = FakeMutationObserver as unknown as typeof MutationObserver;
globalThis.document = {
	body: {
		querySelector: () => found,
	},
} as unknown as Document;

// A wait that never answers, so a regression fails instead of hanging the suite.
const never = Symbol("never settles");

test.beforeEach(() => {
	found = null;
	FakeMutationObserver.instances = [];
});

test("an element that is already there resolves without ever watching", async () => {
	found = { id: "already-there" };

	assert.deepEqual(await waitForElm("#main > .Root"), found);
	assert.equal(FakeMutationObserver.instances.length, 0, "no observer should be left behind");
});

test("an element that never appears resolves null rather than waiting forever", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });

	const pending = waitForElm("#main > .Root");

	// Still pending right up to the deadline, which is the window the loader was stuck in.
	t.mock.timers.tick(WAIT_TIMEOUT - 1);
	assert.equal(FakeMutationObserver.instances.length, 1, "the observer watches while it waits");

	t.mock.timers.tick(1);

	// Bounded, so a wait that stops settling fails this instead of hanging CI.
	assert.deepEqual(await Promise.race([pending, never]), null);
	assert.equal(FakeMutationObserver.instances[0].disconnects, 1, "the observer is disconnected on the way out");
});

test("an element that shows up late resolves it and stops watching", async (t) => {
	t.mock.timers.enable({ apis: ["setTimeout"] });

	const pending = waitForElm("#main > .Root");
	t.mock.timers.tick(WAIT_TIMEOUT - 1);

	found = { id: "late" };
	FakeMutationObserver.instances[0].fire();

	assert.deepEqual(await Promise.race([pending, never]), found);

	// The deadline must not resolve a second time once the element was found.
	t.mock.timers.tick(WAIT_TIMEOUT);
	assert.equal(FakeMutationObserver.instances[0].disconnects, 1, "the observer is disconnected exactly once");
});
