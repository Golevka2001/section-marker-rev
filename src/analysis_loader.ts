import { client } from "/modules/stdlib/mod.ts"

import { hydrateLoading, hydrateEmpty, hydrateAnalysis } from "./interface"

const PRELOAD_DEBOUNCE = 15000 // ms

export function canThisBeAnalyzed(uriRAW: any) {
    if (!uriRAW) return false

    const uri = client.uri.from(uriRAW)
    return uri && uri.type === client.uri.Type.TRACK
}

let analysisIndex = 0
let shownURI: string | null = null
export function showAnalysisForUri(uriRAW: any) {
    if (uriRAW === shownURI) return
    shownURI = uriRAW

    const thisAnalysisIndex = ++analysisIndex
    if (!canThisBeAnalyzed(uriRAW)) {
        hydrateEmpty()
        return
    }

    hydrateLoading()

    Spicetify.getAudioData(uriRAW).then((audioData) => {
        if (thisAnalysisIndex !== analysisIndex) return

        hydrateAnalysis(audioData)
    }).catch((err) => {
        console.warn("SECTION-MARKER: Failed to get audio data for", uriRAW, err)
        if (thisAnalysisIndex !== analysisIndex) return

        // Forget the URI so a later tick can try again. A failed request is
        // usually transient, and keeping the URI would leave this track blank
        // until another one was played.
        if (shownURI === uriRAW) shownURI = null

        hydrateEmpty()
    })
}

let lastPreloadURI: string | null = null
let lastPreloadTime = 0
export function preloadAnalysis(uriRAW: any) {
    if (lastPreloadURI == uriRAW || Date.now() - lastPreloadTime < PRELOAD_DEBOUNCE || !canThisBeAnalyzed(uriRAW)) return

    lastPreloadURI = uriRAW
    lastPreloadTime = Date.now()

    Spicetify.getAudioData(uriRAW)
}