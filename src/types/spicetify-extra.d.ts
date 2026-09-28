// Client surfaces the module runtime relies on that the kit's ambient
// Spicetify types do not declare yet. Merges into the shim namespace.

declare namespace Spicetify {
	function getAudioData(uri: string): Promise<AudioAnalysis.Analysis>;

	namespace Player {
		const origin: {
			getState(): { hasContext: boolean; item: { uri: string } };
		};
	}

	const Queue: {
		nextTracks?: Array<{ contextTrack?: { uri?: string } }>;
	};
}
