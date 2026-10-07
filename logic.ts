/**
 * Pure, marker logic. Nothing in here touches a runtime URL, the ambient
 * globals or the DOM, so the whole file runs under `node --test`; the modules
 * that mount into the app pass plain values in and take the results back out.
 */

// Under this progress bar width, the markers are not shown at all.
export const MINIMUM_MARKERS_WIDTH = 300; // px
// The mini player is a small floating window, so it stays readable with fewer
// pixels than the full width playbar does.
export const MINIMUM_MINI_PLAYER_MARKERS_WIDTH = 200; // px
// How far into a track the next one's analysis is fetched ahead of time.
export const PRELOAD_LEAD_TIME = 10000; // ms
// Minimum spacing between two preload requests, so scrubbing around the end of
// a track does not refetch once per tick.
export const PRELOAD_DEBOUNCE = 15000; // ms

export type MarkerState = "no-data" | "loading" | "data";

// Every class a body may carry for a load state. They gate the container
// opacity in the stylesheet, so this list and the rules in index.scss are one
// contract: a class toggled here needs a rule there.
export const STATE_CLASS_NAMES = [
    "section-marker-no-data",
    "section-marker-loading-data",
    "section-marker-had-no-data",
    "section-marker-less-than-two-sections",
];

// The class naming the current load state, or nothing while data is showing.
const STATE_CLASS: Record<MarkerState, string | null> = {
    "no-data": "section-marker-no-data",
    loading: "section-marker-loading-data",
    data: null,
};

export type MarkerStateInput = {
    state: MarkerState
    hadNoData: boolean
    sectionCount: number | null
}

/** The classes a body carries while displaying `input`. */
export function stateClassNames({ state, hadNoData, sectionCount }: MarkerStateInput): string[] {
    const classes: string[] = [];

    const stateClass = STATE_CLASS[state];
    if (stateClass) classes.push(stateClass);

    // Suppresses the transition in, so the first markers after a load appear
    // where they belong instead of sliding in from their previous positions.
    if (hadNoData) classes.push("section-marker-had-no-data");

    // A track with less than two sections has nothing to alternate, so the
    // wash underneath would only be noise.
    if (sectionCount !== null && sectionCount < 2) {
        classes.push("section-marker-less-than-two-sections");
    }

    return classes;
}

// The properties an element is positioned from. Unitless seconds, divided by
// the track duration in CSS, so a re-render never has to recompute percentages.
export const SECTION_VARIABLES = ["start", "duration", "index"] as const;

export type SectionVariable = (typeof SECTION_VARIABLES)[number];

export type SectionSpan = {
    start: number
    duration: number
}

/** The value of every positioning property for the section at `index`. */
export function sectionVariableValues(
    sections: readonly SectionSpan[],
    index: number
): Record<SectionVariable, string> {
    const section = sections[index];

    return {
        start: String(section.start),
        duration: String(section.duration),
        index: String(index),
    };
}

/** The custom property a section variable is published under. */
export function sectionVariableName(variable: SectionVariable): string {
    return `--section-marker-data-${variable}`;
}

/** The dataset key mirroring the same value onto an element. */
export function sectionDatasetKey(variable: SectionVariable): string {
    return `sectionMarkerData${variable[0].toUpperCase()}${variable.slice(1)}`;
}

/** Whether a bar is too cramped to carry markers, at `minimumWidth` or below. */
export function isTooNarrowForMarkers(barWidth: number, minimumWidth: number): boolean {
    return barWidth < minimumWidth;
}

/** The uri of the track queued right after the current one, if any. */
export function nextTrackUri(queue: {
    nextTracks?: readonly { contextTrack?: { uri?: string } }[] | undefined
} | undefined | null): string | undefined {
    return queue?.nextTracks?.[0]?.contextTrack?.uri;
}

/**
 * Whether the current track is close enough to its end for the next one's
 * analysis to be worth fetching. Prefetching a whole listen-through would
 * burn requests on tracks the user is hours away from.
 */
export function shouldPreloadNextTrack(
    trackDuration: number,
    progress: number,
    leadTime: number = PRELOAD_LEAD_TIME
): boolean {
    return trackDuration - progress < leadTime;
}

/**
 * Whether a preload request is due: a different uri, and the last one is old
 * enough that this is not the same request coming round again.
 */
export function shouldPreload(
    uri: string | undefined,
    lastUri: string | null,
    lastTime: number,
    now: number,
    debounce: number = PRELOAD_DEBOUNCE
): boolean {
    if (!uri || uri === lastUri) return false;

    return now - lastTime >= debounce;
}
