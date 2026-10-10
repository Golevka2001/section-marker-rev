import type { ModuleRuntimeContext } from "/modules/stdlib/mod.ts";

import main from "./app.ts";

export default function (_ctx: ModuleRuntimeContext) {
	void main().catch((err) => {
		console.warn("[section-marker-rev] startup failed", err);
	});
}
