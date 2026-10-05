import { client } from "/modules/stdlib/mod.ts"

import { injectInterface } from "./interface"
import { showAnalysisForUri, preloadAnalysis } from "./analysis_loader"


async function main() {
	while (!client.player.data || !client.uri || !client.locale || !client.cosmos || !client.react) {
		await new Promise(resolve => setTimeout(resolve, 100))
	}

	const PRELOAD_TIME = 10000 // ms

	// Inject the playbar interface
	await injectInterface()

	function getCurrentURI() {
		const data = client.player.origin.getState()
		return data.hasContext ? data.item.uri || null : null
	}

	// Watch for song changes to add the section markers
	client.player.addEventListener("onprogress", () => {
		const URI = getCurrentURI()
		showAnalysisForUri(URI)

		// Preload the next song's data
		if (client.player.getDuration() - client.player.getProgress() < PRELOAD_TIME) {
			preloadAnalysis(Spicetify.Queue.nextTracks[0]?.contextTrack?.uri)
		}
	})
}

export default main
