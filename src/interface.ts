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
    // The loader can evaluate this module's entry more than once per page. The
    // interface is in place after the first call, so this is a no-op.
    if (hasInjected) return
    hasInjected = true

    // Initial setup
    applyState(document.body)
    pinStyles()

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

    pip.addEventListener("enter", pollMiniPlayer)

    // The mini player may already be open
    if (pip.window) pollMiniPlayer()
}

let miniPlayerPoll: ReturnType<typeof setInterval> | null = null

// The document handed out by the enter event is not the one the mini player
// ends up in: it gets replaced while the client renders into it, and it does so
// in chunks rather than in one go. The live window is therefore re-resolved on
// a timer, and the progress bars are looked up in it directly instead of
// through an observer on a document that may already be discarded.
function pollMiniPlayer() {
    if (miniPlayerPoll) return

    let watched: Document | null = null

    miniPlayerPoll = setInterval(() => {
        const doc: Document | undefined = (window as any).documentPictureInPicture?.window?.document

        if (!doc) {
            clearInterval(miniPlayerPoll!)
            miniPlayerPoll = null
            if (watched) forgetDocument(watched)
            return
        }

        if (doc !== watched) {
            watched = doc
            watchDocument(doc)
        }

        for (const bar of Array.from(doc.querySelectorAll<HTMLElement>(".playback-progressbar"))) {
            // The mini player also renders its volume slider with the progress
            // bar classes, which must not be marked up
            if (bar.closest(".volume-bar__slider-container")) continue

            mountProgressBar(bar, MINIMUM_MINI_PLAYER_MARKERS_WIDTH)
        }
    }, 200)
}

function watchDocument(doc: Document) {
    if (watchedDocuments.includes(doc)) return
    watchedDocuments.push(doc)

    if (doc.body) applyState(doc.body)
    copyStyles(doc)

    doc.defaultView?.addEventListener("pagehide", () => forgetDocument(doc), { once: true })
}

function forgetDocument(doc: Document) {
    watchedDocuments = watchedDocuments.filter((watched) => watched !== doc)
    unmountDocument(doc)
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

    const collect = (sheet: CSSStyleSheet) => {
        const found: string[] = []
        let sheetRules: CSSRuleList
        try {
            sheetRules = sheet.cssRules
        } catch {
            return found // Cross origin sheet, not ours
        }

        for (const rule of Array.from(sheetRules)) {
            if (rule.cssText.includes(STYLE_SIGNATURE)) found.push(rule.cssText)
        }
        return found
    }

    // The v3 loader hands a module's CSS to the document as a constructed
    // stylesheet on adoptedStyleSheets, which document.styleSheets omits.
    // The same rules turn up in both places once one is pinned below, hence
    // the de-duplication.
    const rules = Array.from(new Set([
        ...Array.from(document.adoptedStyleSheets).flatMap(collect),
        ...Array.from(document.styleSheets).flatMap(collect as (sheet: CSSStyleSheet) => string[]),
    ]))

    // An empty result means the stylesheet had not been adopted yet, so it must
    // not be cached, or every later copy would keep coming up empty.
    if (rules.length > 0) ownStyleRules = rules

    return rules
}

// The loader periodically detaches a module's stylesheet from
// adoptedStyleSheets and puts it back a frame or two later. Everything this
// extension draws loses its rules in that gap and falls back to unstyled
// elements, which reads as the progress bar flickering. A plain <style> in the
// head is not something the loader manages, so a pinned copy covers the gaps.
const STYLE_PIN_ATTEMPTS = 20
let stylePinAttempts = 0

function pinStyles() {
    if (document.querySelector("style[data-section-marker-pinned]")) return

    const rules = getOwnStyleRules()
    if (rules.length === 0) {
        // The loader may not have adopted the stylesheet yet
        if (stylePinAttempts++ < STYLE_PIN_ATTEMPTS) setTimeout(pinStyles, 250)
        return
    }

    const style = document.createElement("style")
    style.dataset.sectionMarkerPinned = ""
    style.textContent = rules.join("\n")
    document.head.appendChild(style)
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

// The slider area wraps the bar line the sections are laid over. It is only as
// tall as the line and clips whatever overflows it, so it cannot host the
// markers, which deliberately reach out above and below it.
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

    // The sections belong inside the slider area: they match the bar's height
    // and their backdrop-filter has to sample the played fill behind them.
    sliderArea.appendChild(sectionContainer)

    // The markers are taller than the bar line on purpose, so they go on the
    // progress bar itself, which is positioned and does not clip. The two are
    // the same width, so the percentage positions still line up.
    bar.appendChild(markerContainer)

    // Set the size variables, scoped to this bar so that bars of differing
    // sizes (the playbar versus the mini player) do not overwrite each other
    function setDimensions() {
        bar.style.setProperty("--section-marker-playbar-height", bar.clientHeight + "px")

        // The gate goes on our own container, not on the bar: the client
        // re-renders the bar and overwrites its class attribute, which would
        // drop the gate and leave markers on a bar they are too cramped for.
        markerContainer.classList.toggle("section-marker-playbar-below-marker-width", bar.clientWidth < minimumMarkersWidth)
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
    mount.bar.classList.remove("section-marker-injected-playbar")
    mount.markerContainer.classList.remove("section-marker-playbar-below-marker-width")
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

    const apply = () => {
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
    }

    // Let the new elements create so they are rendered,
    // set properties afterwards for them to transition.
    // A client that is not on screen has its requestAnimationFrame throttled
    // away, so there the values go in directly instead of never at all.
    if (mount.doc.hidden) apply()
    else view.requestAnimationFrame(apply)
}