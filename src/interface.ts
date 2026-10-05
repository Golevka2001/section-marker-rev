import { waitForElm, watchForElement } from "./DOM_watcher"

// Under this playbar width, the markers will not be shown
const MINIMUM_MARKERS_WIDTH = 300 // px
// The mini player lives in a tiny floating window, so it stays readable
// with fewer pixels than the full width playbar does.
const MINIMUM_MINI_PLAYER_MARKERS_WIDTH = 200 // px

// Marks the stylesheet Spicetify loaded for this extension, so it can be
// recognised again when it has to be copied into a foreign document.
const STYLE_SIGNATURE = "section-marker"

const capitalize = (str: string) => str[0].toUpperCase() + str.slice(1)

// One progress bar the markers are rendered onto, together with the document
// it lives in. The playbar, the mini player and any future surface all get
// their own containers, as a single pair of elements can only sit in one place.
type Mount = {
    bar: HTMLElement
    doc: Document
    sectionContainer: HTMLElement
    markerContainer: HTMLElement
    resizeObserver: ResizeObserver
}

let mounts: Mount[] = []
// Documents that hold a mountable progress bar, including ones that do not
// have a bar mounted yet. Global state classes have to reach all of them.
let watchedDocuments: Document[] = []
let lastAnalysis: AudioAnalysis.Analysis | null = null

// What the markers are currently displaying, mirrored onto every body as
// class names. A document that joins later gets the state applied to it.
let state: "no-data" | "loading" | "data" = "no-data"
// Whether the current run started out blank, which suppresses the transition
// in, so the first markers after a load appear where they belong
let hadNoData = false
let sectionCount: number | null = null

let hasInjected = false
export async function injectInterface() {
    // The loader can evaluate this module more than once in a page, e.g. on
    // every hot push of the dev loop. The interface is already in place then,
    // so this is a no-op rather than a failure.
    if (hasInjected) {
        console.warn("SECTION-MARKER: Interface already injected, skipping")
        return
    }
    hasInjected = true

    // Initial setup
    applyState(document.body)

    // Append the containers to the regular playbar
    watchForElement(
        ".playback-bar .playback-progressbar",
        await waitForElm("#main > .Root"),
        (el) => { mountProgressBar(el as HTMLElement, MINIMUM_MARKERS_WIDTH) },
        unmountProgressBar
    )

    // The mini player renders into a Document Picture-in-Picture window,
    // which is a document of its own. It gets neither Spicetify's stylesheet
    // nor this module's DOM, so it has to be set up separately.
    watchMiniPlayer()
}

function applyState(body: HTMLElement) {
    body.classList.toggle("section-marker-no-data", state === "no-data")
    body.classList.toggle("section-marker-loading-data", state === "loading")
    body.classList.toggle("section-marker-had-no-data", hadNoData)
    body.classList.toggle("section-marker-less-than-two-sections", sectionCount !== null && sectionCount < 2)
}

function watchMiniPlayer() {
    const pip = (window as any).documentPictureInPicture
    if (!pip || typeof pip.addEventListener !== "function") return

    const enter = (event: { window?: Window }) => watchDocument(event?.window ?? pip.window)
    pip.addEventListener("enter", enter)

    // The mini player may already be open
    if (pip.window) watchDocument(pip.window)
}

function watchDocument(pipWindow: any) {
    const doc: Document | undefined = pipWindow?.document
    if (!doc || watchedDocuments.includes(doc)) return
    watchedDocuments.push(doc)

    if (doc.body) applyState(doc.body)
    copyStyles(doc)

    const unwatch = watchForElement(
        ".playback-progressbar",
        doc,
        (el) => { mountProgressBar(el as HTMLElement, MINIMUM_MINI_PLAYER_MARKERS_WIDTH) },
        unmountProgressBar
    )

    const discard = () => {
        unwatch()
        watchedDocuments = watchedDocuments.filter((watched) => watched !== doc)
        unmountDocument(doc)
    }

    pipWindow.addEventListener?.("pagehide", discard, { once: true })
}

function unmountDocument(doc: Document) {
    for (const bar of mounts.filter((mount) => mount.doc === doc).map((mount) => mount.bar)) {
        unmountProgressBar(bar)
    }
}

// The mini player's document starts out without any of this extension's CSS.
// Clone the rules Spicetify injected into the main document into it.
let ownStyleRules: string[] | null = null

function getOwnStyleRules() {
    if (ownStyleRules) return ownStyleRules

    const rules: string[] = []
    for (const sheet of Array.from(document.styleSheets)) {
        let sheetRules: CSSRuleList
        try {
            sheetRules = (sheet as CSSStyleSheet).cssRules
        } catch {
            continue // Cross origin sheet, not ours
        }

        for (const rule of Array.from(sheetRules)) {
            if (rule.cssText.includes(STYLE_SIGNATURE)) rules.push(rule.cssText)
        }
    }

    return (ownStyleRules = rules)
}

function copyStyles(doc: Document) {
    const rules = getOwnStyleRules()
    if (rules.length === 0) {
        console.warn("SECTION-MARKER: Could not find the extension stylesheet to copy")
        return
    }

    const style = doc.createElement("style")
    style.dataset.sectionMarkerStyles = ""
    style.textContent = rules.join("\n")
    ;(doc.head ?? doc.documentElement).appendChild(style)
}

// The progress bar wraps a slider area the markers are layered on top of.
function getSliderArea(bar: HTMLElement) {
    return bar.querySelector<HTMLElement>(".x-progressBar-sliderArea")
        ?? bar.querySelector<HTMLElement>(".progress-bar")
        ?? bar
}

function mountProgressBar(bar: HTMLElement, minimumMarkersWidth: number) {
    if (mounts.some((mount) => mount.bar === bar)) return

    const doc = bar.ownerDocument
    const view = doc.defaultView ?? window

    const sectionContainer = doc.createElement("div")
    sectionContainer.classList.add("section-marker-element", "section-marker-sections")

    const markerContainer = doc.createElement("div")
    markerContainer.classList.add("section-marker-element", "section-marker-markers")

    bar.classList.add("section-marker-injected-playbar")

    const sliderArea = getSliderArea(bar)
    sliderArea.appendChild(sectionContainer)
    sliderArea.appendChild(markerContainer)

    // Set the size variables, scoped to this bar so that bars of differing
    // sizes (the playbar versus the mini player) do not overwrite each other
    function setDimensions() {
        bar.style.setProperty("--section-marker-playbar-height", bar.clientHeight + "px")

        bar.classList[bar.clientWidth < minimumMarkersWidth ? "add" : "remove"]("section-marker-playbar-below-marker-width")
    }
    setDimensions()

    const resizeObserver = new view.ResizeObserver(setDimensions)
    resizeObserver.observe(bar)

    const mount: Mount = { bar, doc, sectionContainer, markerContainer, resizeObserver }
    mounts.push(mount)

    // A track may already be loaded when this bar shows up, e.g. when the
    // mini player is opened halfway through a song
    if (lastAnalysis) applyAnalysis(mount, lastAnalysis)
}

function unmountProgressBar(bar: Node) {
    const mount = mounts.find((candidate) => candidate.bar === bar)
    if (!mount) return

    mounts = mounts.filter((candidate) => candidate !== mount)
    mount.resizeObserver.disconnect()
    mount.bar.classList.remove("section-marker-injected-playbar", "section-marker-playbar-below-marker-width")
    mount.sectionContainer.remove()
    mount.markerContainer.remove()
}

// Every body holding a mountable progress bar, the main one included
function bodies() {
    const seen = new Set<Document>()
    const result: HTMLElement[] = []

    for (const doc of [document, ...watchedDocuments]) {
        if (seen.has(doc) || !doc.body) continue
        seen.add(doc)
        result.push(doc.body)
    }

    return result
}

function applyStateToAllBodies() {
    for (const body of bodies()) {
        applyState(body)
    }
}

export function hydrateEmpty() {
    state = "no-data"
    hadNoData = false
    sectionCount = null
    lastAnalysis = null

    applyStateToAllBodies()
}

export function hydrateLoading() {
    // Remember whether this load starts out blank, so that the markers
    // appearing afterwards do not slide in from their previous positions
    hadNoData = state === "no-data"
    state = "loading"

    applyStateToAllBodies()
}

const sectionValues = {
    start: (analysis: AudioAnalysis.Analysis, i: number) =>
        analysis.sections[i].start,
    duration: (analysis: AudioAnalysis.Analysis, i: number) =>
        analysis.sections[i].duration,
    index:
        (_: AudioAnalysis.Analysis, i: number) => i,
}

export function hydrateAnalysis(audioData: AudioAnalysis.Analysis) {
    state = "data"
    sectionCount = audioData.sections.length
    lastAnalysis = audioData

    applyStateToAllBodies()

    for (const mount of mounts) {
        applyAnalysis(mount, audioData)
    }
}

function applyAnalysis(mount: Mount, audioData: AudioAnalysis.Analysis) {
    const markerElms = Array.from(mount.markerContainer.querySelectorAll<HTMLDivElement>(".section-marker-marker"))
    const sectionElms = Array.from(mount.sectionContainer.querySelectorAll<HTMLDivElement>(".section-marker-section"))

    for (let i = markerElms.length; i < audioData.sections.length; i++) {
        // Create not yet existing elements
        const marker = mount.doc.createElement("div")
        marker.classList.add("section-marker-marker")

        const section = mount.doc.createElement("div")
        section.classList.add("section-marker-section");

        [marker, section].forEach((elm) => elm.classList.add(`section-marker-not-exists`))

        mount.markerContainer.appendChild(marker)
        mount.sectionContainer.appendChild(section)

        markerElms.push(marker)
        sectionElms.push(section)
    }

    const view = mount.doc.defaultView ?? window

    // Let the new elements create so they are rendered,
    // set properties afterwards for them to transition
    view.requestAnimationFrame(() => {
        const trackDuration = audioData.track.duration.toString()
        const body = mount.doc.body

        if (body) {
            body.style.setProperty("--section-marker-data-track-duration", trackDuration)
            body.dataset.sectionMarkerDataTrackDuration = trackDuration
        }

        for (let i = 0; i < audioData.sections.length; i++) {
            const marker = markerElms[i] as HTMLDivElement
            const section = sectionElms[i] as HTMLDivElement

            [marker, section].forEach((elm) => {
                elm.classList.remove(`section-marker-not-exists`)

                for (const [key, value] of Object.entries(sectionValues)) {
                    const val = value(audioData, i).toString()

                    elm.dataset["sectionMarkerData" + capitalize(key)] = val
                    elm.style.setProperty("--section-marker-data-" + key, val)
                }
            })
        }

        // "Remove" no longer necessary elements
        for (let i = audioData.sections.length; i < markerElms.length; i++) {
            const marker = markerElms[i] as HTMLDivElement
            const section = sectionElms[i] as HTMLDivElement

            [marker, section].forEach((elm) => elm.classList.add("section-marker-not-exists"))
        }
    })
}