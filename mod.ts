import type { ModuleRuntimeContext } from "/modules/stdlib/mod.ts";

import main from "./src/app.ts";

export default async function (_ctx: ModuleRuntimeContext) {
	await main();
}
