// How far in advance to start preloading the next track's analysis.
const PRELOAD_LEAD_TIME = 10000; // ms
// Bounds how often a preload may repeat while the track nears its end.
const PRELOAD_DEBOUNCE = 15000; // ms
// A marker stands proud of the line by a fixed reach, per side.
const MARKER_REACH = 1; // px

export type MarkerState = "no-data" | "loading" | "data";

// A class toggled here needs a matching rule in index.scss:
// that pair is what decides whether the markers show at all.
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
	state: MarkerState;
	hadNoData: boolean;
	sectionCount: number | null;
};

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

// Kept as unitless seconds and divided by the track duration in CSS,
// so a re-render never has to recompute percentages.
export const SECTION_VARIABLES = ["start", "duration", "index"] as const;

export type SectionVariable = (typeof SECTION_VARIABLES)[number];

// Set once per document rather than per marker,
// since it divides every position the CSS lays out.
export const TRACK_DURATION_VARIABLE = "track-duration";

export type DataVariable = SectionVariable | typeof TRACK_DURATION_VARIABLE;

export type SectionSpan = {
	start: number;
	duration: number;
};

// The only values the markers read.
export type MarkerAnalysis = {
	track: { duration: number };
	sections: readonly SectionSpan[];
};

export function sectionVariableValues(
	sections: readonly SectionSpan[],
	index: number,
): Record<SectionVariable, string> {
	const section = sections[index];

	return {
		start: String(section.start),
		duration: String(section.duration),
		index: String(index),
	};
}

export function sectionVariableName(variable: DataVariable): string {
	return `--section-marker-data-${variable}`;
}

export function sectionDatasetKey(variable: DataVariable): string {
	// CSS keeps the kebab form; an attribute name cannot, so it is camel-cased.
	const camel = variable.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());

	return `sectionMarkerData${camel[0].toUpperCase()}${camel.slice(1)}`;
}

// A marker stands proud of the line by a fixed reach.
// Falls back through the coarser measurements when the line element is not there.
export function markerHeight(measurements: { line?: number; slider?: number; bar?: number }): number {
	const { line, slider, bar } = measurements;

	return (line || slider || bar || 0) + MARKER_REACH * 2;
}

export function nextTrackUri(
	queue:
		| {
				nextTracks?: readonly { contextTrack?: { uri?: string } }[] | undefined;
		  }
		| undefined
		| null,
): string | undefined {
	return queue?.nextTracks?.[0]?.contextTrack?.uri;
}

export function shouldPreloadNextTrack(trackDuration: number, progress: number): boolean {
	return trackDuration - progress < PRELOAD_LEAD_TIME;
}

export function shouldPreload(uri: string | undefined, lastUri: string | null, lastTime: number, now: number): boolean {
	if (!uri || uri === lastUri) return false;

	return now - lastTime >= PRELOAD_DEBOUNCE;
}
