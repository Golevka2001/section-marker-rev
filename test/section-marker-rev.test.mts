// Unit tests for the pure marker logic. logic.ts imports neither the runtime
// URLs nor the ambient globals, so it loads under plain node --test; the DOM
// half is verified live through `npm run dev`.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
	isTooNarrowForMarkers,
	markerHeight,
	MARKER_REACH,
	MINIMUM_MARKERS_WIDTH,
	MINIMUM_MINI_PLAYER_MARKERS_WIDTH,
	nextTrackUri,
	PRELOAD_DEBOUNCE,
	PRELOAD_LEAD_TIME,
	sectionDatasetKey,
	sectionVariableName,
	sectionVariableValues,
	shouldPreload,
	shouldPreloadNextTrack,
	stateClassNames,
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
	assert.deepEqual(stateClassNames({ state: "loading", hadNoData: true, sectionCount: null }), [
		"section-marker-loading-data",
		"section-marker-had-no-data",
	]);
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
	assert.ok(
		!stateClassNames({ state: "data", hadNoData: false, sectionCount: null }).includes(
			"section-marker-less-than-two-sections",
		),
	);
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

	assert.equal(sectionDatasetKey("start"), "sectionMarkerDataStart");
	assert.equal(sectionDatasetKey("duration"), "sectionMarkerDataDuration");
	assert.equal(sectionDatasetKey("index"), "sectionMarkerDataIndex");
});

test("the width gate hides markers strictly below its minimum", () => {
	assert.equal(isTooNarrowForMarkers(MINIMUM_MARKERS_WIDTH - 1, MINIMUM_MARKERS_WIDTH), true);
	assert.equal(isTooNarrowForMarkers(MINIMUM_MARKERS_WIDTH, MINIMUM_MARKERS_WIDTH), false);
	assert.equal(isTooNarrowForMarkers(MINIMUM_MARKERS_WIDTH + 1, MINIMUM_MARKERS_WIDTH), false);
});

test("a marker reaches past the line on both sides", () => {
	assert.equal(MARKER_REACH, 2);
	assert.equal(markerHeight({ line: 4, slider: 12, bar: 24 }), 6);
});

test("a taller playbar does not change the marker", () => {
	// The line is what the marker is measured against; the playbar growing
	// around it must not swallow the marker.
	assert.equal(markerHeight({ line: 4, slider: 12, bar: 60 }), markerHeight({ line: 4, slider: 12, bar: 12 }));
});

test("marker height falls back when the line element is missing", () => {
	assert.equal(markerHeight({ slider: 12, bar: 60 }), 14);
	assert.equal(markerHeight({ bar: 60 }), 62);
	assert.equal(markerHeight({ line: 0, slider: 0, bar: 0 }), 2);
});

test("the marker reach is overridable", () => {
	assert.equal(markerHeight({ line: 4 }, 6), 10);
});

test("the mini player is held to its own, lower minimum", () => {
	assert.equal(MINIMUM_MINI_PLAYER_MARKERS_WIDTH, 200);
	assert.equal(isTooNarrowForMarkers(250, MINIMUM_MARKERS_WIDTH), true);
	assert.equal(isTooNarrowForMarkers(250, MINIMUM_MINI_PLAYER_MARKERS_WIDTH), false);
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

test("the preload lead time is honoured, and overridable", () => {
	assert.equal(PRELOAD_LEAD_TIME, 10_000);
	assert.equal(shouldPreloadNextTrack(200_000, 185_000, 10_000), false);
	assert.equal(shouldPreloadNextTrack(200_000, 185_000, 20_000), true);
});

test("a preload is due for a fresh uri once the debounce has passed", () => {
	assert.equal(PRELOAD_DEBOUNCE, 15_000);
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
