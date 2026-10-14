import type { ModuleRuntimeContext } from "/modules/stdlib/mod.ts";

import main from "./app.ts";

export default function (ctx: ModuleRuntimeContext) {
	const lifetime = new AbortController();
	let dispose: (() => void) | null = null;

	const teardown = () => {
		lifetime.abort();
		dispose?.();
		dispose = null;
	};

	ctx.defer(() => lifetime.abort());

	void main(lifetime.signal)
		.then((mounted) => {
			// A deferral registered after the unload would never run.
			if (lifetime.signal.aborted) {
				mounted();
				return;
			}

			dispose = mounted;
			ctx.defer(teardown);
		})
		.catch((err) => {
			console.warn("[section-marker-rev] startup failed", err);
		});

	return teardown;
}
