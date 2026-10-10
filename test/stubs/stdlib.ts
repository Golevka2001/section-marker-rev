/**
 * A stand-in for the stdlib client surface, so analysis-loader.ts can be imported in Node.
 * The resolve hook points /modules/stdlib/mod.ts here, covering the one capability the loader uses:
 * turning a uri into a path and a type.
 */

const TRACK = "track";

export const client = {
	uri: {
		Type: { TRACK },
		from(raw: any) {
			if (raw === null || raw === undefined) return undefined;
			// A queued entry carries a tail the client would ignore anyway.
			const path = String(raw).split(/[?#]/)[0];
			return {
				getPath: () => path,
				get type() {
					return path.startsWith("spotify:track:") ? TRACK : "episode";
				},
			};
		},
	},
};
