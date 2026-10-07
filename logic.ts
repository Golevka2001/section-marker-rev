/**
 * Pure marker logic: no runtime URLs, no ambient globals, no DOM, so the
 * whole file runs under `node --test`. The DOM half passes values in here
 * and takes the results back out.
 */

export const MINIMUM_MARKERS_WIDTH = 300; // px
// The mini player is a small floating window, so it stays readable with
// fewer pixels than the full width playbar does.
export const MINIMUM_MINI_PLAYER_MARKERS_WIDTH = 200; // px
export const PRELOAD_LEAD_TIME = 10000; // ms
// Bounds how often a preload may repeat while the track nears its end.
export const PRELOAD_DEBOUNCE = 15000; // ms

export type MarkerState = "no-data" | "loading" | "data";

// A class toggled here needs a matching rule in index.scss: that pair is
// what decides whether the markers show at all.
export const STATE_CLASS_NAMES = [
    "section-marker-no-data",
    "section-marker-loading-data",
    "section-marker-had-no-data",
    "section-marker-less-than-two-sections",
];

// Data is showing, so nothing needs to gate it.
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

export function stateClassNames({ state, hadNoData, sectionCount }: MarkerStateInput): string[] {
    const classes: string[] = [];

    const stateClass = STATE_CLASS[state];
    if (stateClass) classes.push(stateClass);

    if (hadNoData) classes.push("section-marker-had-no-data");

    if (sectionCount !== null && sectionCount < 2) {
        classes.push("section-marker-less-than-two-sections");
    }

    return classes;
}

// Kept as unitless seconds and divided by the track duration in CSS, so a
// re-render never has to recompute percentages.
export const SECTION_VARIABLES = ["start", "duration", "index"] as const;

export type SectionVariable = (typeof SECTION_VARIABLES)[number];

export type SectionSpan = {
    start: number
    duration: number
}

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

export function sectionVariableName(variable: SectionVariable): string {
    return `--section-marker-data-${variable}`;
}

export function sectionDatasetKey(variable: SectionVariable): string {
    return `sectionMarkerData${variable[0].toUpperCase()}${variable.slice(1)}`;
}

export function isTooNarrowForMarkers(barWidth: number, minimumWidth: number): boolean {
    return barWidth < minimumWidth;
}

export function nextTrackUri(queue: {
    nextTracks?: readonly { contextTrack?: { uri?: string } }[] | undefined
} | undefined | null): string | undefined {
    return queue?.nextTracks?.[0]?.contextTrack?.uri;
}

// Prefetching from the start of a track would burn a request per listen, on
// songs the listener is hours away from.
export function shouldPreloadNextTrack(
    trackDuration: number,
    progress: number,
    leadTime: number = PRELOAD_LEAD_TIME
): boolean {
    return trackDuration - progress < leadTime;
}

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
