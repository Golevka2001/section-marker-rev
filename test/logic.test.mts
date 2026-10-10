/**
 * Unit tests for logic.ts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
	markerHeight,
	nextTrackUri,
	sectionDatasetKey,
	sectionVariableName,
	sectionVariableValues,
	SECTION_VARIABLES,
	shouldPreload,
	shouldPreloadNextTrack,
	stateClassNames,
	STATE_CLASS_NAMES,
	TRACK_DURATION_VARIABLE,
	type MarkerState,
} from "../logic.ts";

test("a blank load carries the no-data class and nothing else", () => {
	assert.deepEqual(stateClassNames({ state: "no-data", hadNoData: false, sectionCount: null }), [
		"section-marker-no-data",
	]);
});

test("loading is its own class, and data carries none", () => {
	assert.deepEqual(stateClassNames({ state: "loading", hadNoData: false, sectionCount: null }), [
		"section-marker-loading-data",
	]);
	assert.deepEqual(stateClassNames({ state: "data", hadNoData: false, sectionCount: 6 }), []);
});

test("a load that started blank also asks for the suppressed transition", () => {
	const classes = stateClassNames({ state: "loading", hadNoData: true, sectionCount: null });

	assert.ok(classes.includes("section-marker-loading-data"));
	assert.ok(classes.includes("section-marker-had-no-data"));
});

test("under two sections the markers are hidden, two and up they are not", () => {
	assert.ok(
		stateClassNames({ state: "data", hadNoData: false, sectionCount: 1 }).includes(
			"section-marker-less-than-two-sections",
		),
	);
	assert.ok(
		!stateClassNames({ state: "data", hadNoData: false, sectionCount: 2 }).includes(
			"section-marker-less-than-two-sections",
		),
	);
});

test("an unknown section count is not treated as too few", () => {
	// null coerces to 0,
	// so without the guard a track whose count is not known yet would read as "too few" and hide the markers.
	assert.ok(
		!stateClassNames({ state: "data", hadNoData: false, sectionCount: null }).includes(
			"section-marker-less-than-two-sections",
		),
	);
});

test("every class the state can produce is one the body applies", () => {
	// applyState walks STATE_CLASS_NAMES and toggles each,
	// so a name it does not carry is dropped on the floor rather than applied.
	const states: MarkerState[] = ["no-data", "loading", "data"];

	for (const state of states) {
		for (const hadNoData of [true, false]) {
			for (const sectionCount of [null, 0, 1, 2]) {
				for (const name of stateClassNames({ state, hadNoData, sectionCount })) {
					assert.ok(STATE_CLASS_NAMES.includes(name), `${name} is produced but never applied`);
				}
			}
		}
	}
});

test("every generated name has a match in the stylesheet", () => {
	// The coupling neither the compiler nor the linter can see:
	// rename a name on one side and the markers quietly stop responding.
	const scss = readFileSync(new URL("../index.scss", import.meta.url), "utf8");

	for (const name of STATE_CLASS_NAMES) {
		assert.ok(scss.includes(name), `${name} has no rule in index.scss`);
	}

	for (const variable of SECTION_VARIABLES) {
		// "index" is written for anyone styling off the data attributes; the stylesheet itself has no use for it.
		if (variable === "index") continue;

		const name = sectionVariableName(variable);
		assert.ok(scss.includes(name), `${name} is never read by index.scss`);
	}

	const trackDuration = sectionVariableName(TRACK_DURATION_VARIABLE);
	assert.ok(scss.includes(trackDuration), `${trackDuration} is never read by index.scss`);
});

test("section values stay unitless seconds plus the index", () => {
	const sections = [
		{ start: 0, duration: 12.5 },
		{ start: 12.5, duration: 30.25 },
	];

	assert.deepEqual(sectionVariableValues(sections, 1), {
		start: "12.5",
		duration: "30.25",
		index: "1",
	});
});

test("each variable has a matching custom property and dataset key", () => {
	assert.equal(sectionVariableName("start"), "--section-marker-data-start");
	assert.equal(sectionVariableName("duration"), "--section-marker-data-duration");
	assert.equal(sectionVariableName("index"), "--section-marker-data-index");
	assert.equal(sectionVariableName("track-duration"), "--section-marker-data-track-duration");

	assert.equal(sectionDatasetKey("start"), "sectionMarkerDataStart");
	assert.equal(sectionDatasetKey("duration"), "sectionMarkerDataDuration");
	assert.equal(sectionDatasetKey("index"), "sectionMarkerDataIndex");
	// A hyphen cannot survive an attribute name, so a compound one is camel-cased rather than left broken.
	assert.equal(sectionDatasetKey("track-duration"), "sectionMarkerDataTrackDuration");
});

test("the marker is measured off the line, not the playbar", () => {
	// The line is what the theme actually draws; a taller playbar growing around it must not change the height.
	assert.equal(markerHeight({ line: 4, slider: 12, bar: 24 }), 6);
	assert.equal(markerHeight({ line: 4, slider: 12, bar: 60 }), 6);
});

test("marker height falls back when the line element is missing", () => {
	assert.equal(markerHeight({ slider: 12, bar: 60 }), 14);
	assert.equal(markerHeight({ bar: 60 }), 62);
	assert.equal(markerHeight({ line: 0, slider: 0, bar: 0 }), 2);
});

test("the queued track's uri is read off the context track", () => {
	assert.equal(nextTrackUri({ nextTracks: [{ contextTrack: { uri: "spotify:track:2" } }] }), "spotify:track:2");
});

test("a queue without a usable next track yields undefined", () => {
	assert.equal(nextTrackUri(undefined), undefined);
	assert.equal(nextTrackUri(null), undefined);
	assert.equal(nextTrackUri({}), undefined);
	assert.equal(nextTrackUri({ nextTracks: [] }), undefined);
	assert.equal(nextTrackUri({ nextTracks: [{}] }), undefined);
	assert.equal(nextTrackUri({ nextTracks: [{ contextTrack: {} }] }), undefined);
});

test("preloading waits until the track is nearly over", () => {
	assert.equal(shouldPreloadNextTrack(200_000, 100_000), false);
	assert.equal(shouldPreloadNextTrack(200_000, 195_000), true);
	assert.equal(shouldPreloadNextTrack(200_000, 200_000), true);
});

test("a preload is due for a fresh uri once the debounce has passed", () => {
	assert.equal(shouldPreload("spotify:track:2", null, 0, 60_000), true);
	assert.equal(shouldPreload("spotify:track:2", "spotify:track:1", 0, 60_000), true);
});

test("the same uri is not refetched, however long ago it was", () => {
	assert.equal(shouldPreload("spotify:track:2", "spotify:track:2", 0, 60_000), false);
});

test("a different uri inside the debounce window is skipped", () => {
	assert.equal(shouldPreload("spotify:track:2", "spotify:track:1", 50_000, 60_000), false);
	assert.equal(shouldPreload("spotify:track:2", "spotify:track:1", 45_000, 60_000), true);
});

test("a missing uri never preloads", () => {
	assert.equal(shouldPreload(undefined, null, 0, 60_000), false);
	assert.equal(shouldPreload("", null, 0, 60_000), false);
});
