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

	// Create the button for toggling the section display
	/* const toggleButton = new Spicetify.Playbar.Button(
		t("sectionsButtonTooltip.toggle"),
		`<svg role="img" height="16" width="16" aria-hidden="true" viewBox="0 0 16 16" className="Svg-sc-ytk21e-0 Svg-img-16-icon">
			<path d="M1 8A2.5 2.5 0 0 1 3.5 5.5h9a2.5 2.5 0 0 1 0 5h-9A2.5 2.5 0 0 1 1 8zm2.5-1a1 1 0 0 0 0 2h9a1 1 0 1 0 0-2h-9zM7.25 15v-14h1.5v14Z"></path>
		</svg>`,
		() => {

		}
	)
	toggleButton.register() */

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
