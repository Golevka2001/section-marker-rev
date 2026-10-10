/**
 * Loader test harness. The resolve hook points the stdlib specifier at a stub so the loader loads in Node;
 * this adds the clock, the getAudioData the test scripts, and a body to paint.
 * load() hands back a fresh instance each call, since the loader keeps its state in module scope.
 */

import { registerHooks } from "node:module";

const STUB = new URL("./stdlib.ts", import.meta.url).href;

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "/modules/stdlib/mod.ts") {
			return { url: STUB, shortCircuit: true };
		}
		// The modules import each other without an extension, which Node needs.
		if (specifier.startsWith("./") && !/\.[a-z]+$/.test(specifier)) {
			return nextResolve(`${specifier}.ts`, context);
		}
		return nextResolve(specifier, context);
	},
});

export type Hydrate = "loading" | "empty" | "data";

export type Harness = {
	advance: (ms: number) => void;
	hydrates: Hydrate[];
	requests: string[];
	respond: (handler: (uri: string) => Promise<unknown>) => void;
	load: () => Promise<typeof import("../../analysis-loader.ts")>;
};

// Moved rather than mocked, because both the loader and the cache read the real Date.now.
const realNow = Date.now;
let shift = 0;
Date.now = () => realNow() + shift;

// interface.ts names a state by the classes it toggles, and writes all four on every paint.
// The state is read back once the last of them lands.
const LOADING_CLASS = "section-marker-loading-data";
const EMPTY_CLASS = "section-marker-no-data";
const LAST_WRITTEN = "section-marker-less-than-two-sections";

let instance = 0;

export function install(): Harness {
	const hydrates: Hydrate[] = [];
	const requests: string[] = [];

	let handler: (uri: string) => Promise<unknown> = () =>
		Promise.resolve({
			track: { duration: 200 },
			sections: [{ start: 0, duration: 10 }],
		});

	const classes = new Set<string>();

	function toggle(name: string, on?: boolean) {
		const wanted = on ?? !classes.has(name);
		if (wanted) classes.add(name);
		else classes.delete(name);
		if (name !== LAST_WRITTEN) return;

		const painted: Hydrate = classes.has(LOADING_CLASS) ? "loading" : classes.has(EMPTY_CLASS) ? "empty" : "data";
		hydrates.push(painted);
	}

	globalThis.document = {
		body: {
			classList: { toggle },
			style: { setProperty: () => {}, removeProperty: () => {} },
			dataset: {} as Record<string, string>,
		},
	} as unknown as Document;

	globalThis.Spicetify = {
		getAudioData: (uri: string) => {
			requests.push(uri);
			return handler(uri);
		},
	} as unknown as typeof Spicetify;

	return {
		hydrates,
		requests,
		advance: (ms) => {
			shift += ms;
		},
		respond: (next) => {
			handler = next;
		},
		// A fresh URL per call, so Node does not hand back the cached instance.
		load: async () => {
			const base = new URL("../../analysis-loader.ts", import.meta.url);
			return import(`${base.href}?run=${++instance}`) as Promise<typeof import("../../analysis-loader.ts")>;
		},
	};
}
