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
