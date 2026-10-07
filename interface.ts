import { waitForElm, watchForElement } from "./dom-watcher"
import {
    MINIMUM_MARKERS_WIDTH,
    MINIMUM_MINI_PLAYER_MARKERS_WIDTH,
    isTooNarrowForMarkers,
    markerHeight,
    sectionDatasetKey,
    sectionVariableName,
    sectionVariableValues,
    stateClassNames,
    STATE_CLASS_NAMES,
    SECTION_VARIABLES,
    type MarkerState,
} from "./logic"

// Identifies this extension's own rules among every sheet on the page.
const STYLE_SIGNATURE = "section-marker"

type Mount = {
    bar: HTMLElement
    doc: Document
    sectionContainer: HTMLElement
    markerContainer: HTMLElement
    resizeObserver: ResizeObserver
}

let mounts: Mount[] = []
let watchedDocuments: Document[] = []
let lastAnalysis: AudioAnalysis.Analysis | null = null

// State lives here rather than per document, so a document that joins late
// still gets it applied.
let state: MarkerState = "no-data"
let hadNoData = false
let sectionCount: number | null = null

let hasInjected = false
export async function injectInterface() {
    // The loader can evaluate this entry more than once per page.
    if (hasInjected) return
    hasInjected = true

    applyState(document.body)
    pinStyles()

    watchForElement(
        ".playback-bar .playback-progressbar",
        await waitForElm("#main > .Root"),
        (el) => { mountProgressBar(el as HTMLElement, MINIMUM_MARKERS_WIDTH) },
        unmountProgressBar
    )

    // The mini player is a document of its own, with neither our stylesheet
    // nor our DOM in it, so it needs setting up separately.
    watchMiniPlayer()
}

function applyState(body: HTMLElement) {
    // Toggle every known name, since classList.toggle only adds or removes.
    const classes = stateClassNames({ state, hadNoData, sectionCount })
    for (const className of STATE_CLASS_NAMES) {
        body.classList.toggle(className, classes.includes(className))
    }
}

function watchMiniPlayer() {
    const pip = (window as any).documentPictureInPicture
    if (!pip || typeof pip.addEventListener !== "function") return

    pip.addEventListener("enter", pollMiniPlayer)

    if (pip.window) pollMiniPlayer() // may already be open
}

let miniPlayerPoll: ReturnType<typeof setInterval> | null = null

// The document from the enter event is not the one the mini player ends up
// in: the client replaces it in chunks while rendering. So the live window is
// re-resolved on a timer instead of being observed.
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
            // The volume slider wears the same classes and must not be marked up
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

    // The v3 loader hands a module's CSS over on adoptedStyleSheets, which
    // document.styleSheets omits. Once a copy is pinned the rules turn up in
    // both places, hence the de-duplication.
    const rules = Array.from(new Set([
        ...Array.from(document.adoptedStyleSheets).flatMap(collect),
        ...Array.from(document.styleSheets).flatMap(collect as (sheet: CSSStyleSheet) => string[]),
    ]))

    // Caching an empty result would leave every later copy empty too.
    if (rules.length > 0) ownStyleRules = rules

    return rules
}

// The loader periodically detaches the stylesheet and puts it back a frame or
// two later, which reads as the progress bar flickering. A plain <style> in the
// head is not something it manages, so a pinned copy covers those gaps.
const STYLE_PIN_ATTEMPTS = 20
let stylePinAttempts = 0

function pinStyles() {
    if (document.querySelector("style[data-section-marker-pinned]")) return

    const rules = getOwnStyleRules()
    if (rules.length === 0) {
        // The stylesheet may not have been adopted yet
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

// The slider area is only as tall as the bar line and clips what overflows it,
// so the markers, which reach out above and below, cannot live inside it.
function getSliderArea(bar: HTMLElement) {
    return bar.querySelector<HTMLElement>(".x-progressBar-sliderArea")
        ?? bar.querySelector<HTMLElement>(".progress-bar")
        ?? bar
}

// The element that actually paints the line, as opposed to the progress bar
// component around it: a theme that gives the playbar more height also gives
// the component more height, but the line stays as thick as it was. Measuring
// against the component is what leaves a marker sitting inside a tall bar.
function getBarLine(sliderArea: HTMLElement) {
    return sliderArea.querySelector<HTMLElement>(".x-progressBar-foreground")
        ?? sliderArea.querySelector<HTMLElement>(".x-progressBar-middleground")
        ?? sliderArea.querySelector<HTMLElement>(".x-progressBar-background")
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

    // Inside the slider area, so they match the bar's height and the
    // backdrop-filter samples the played fill behind them.
    sliderArea.appendChild(sectionContainer)

    // On the bar itself, which is positioned and does not clip. Same width as
    // the sections, so the percentages still line up.
    bar.appendChild(markerContainer)

    function setDimensions() {
        // The marker is sized off the line plus a fixed reach, so it keeps
        // standing proud of the line on a theme that makes the playbar taller.
        const height = markerHeight({
            line: getBarLine(sliderArea)?.clientHeight,
            slider: sliderArea.clientHeight,
            bar: bar.clientHeight,
        })
        bar.style.setProperty("--section-marker-playbar-height", height + "px")

        // Scoped to our container rather than the bar: the client re-renders
        // the bar and overwrites its class attribute, which would drop the gate.
        markerContainer.classList.toggle("section-marker-playbar-below-marker-width", isTooNarrowForMarkers(bar.clientWidth, minimumMarkersWidth))
    }
    setDimensions()

    const resizeObserver = new view.ResizeObserver(setDimensions)
    resizeObserver.observe(bar)

    const mount: Mount = { bar, doc, sectionContainer, markerContainer, resizeObserver }
    mounts.push(mount)

    // A track may already be loaded, e.g. when the mini player opens midway
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
    // Remember whether this load starts blank, so the markers do not slide in
    // from their previous positions afterwards.
    hadNoData = state === "no-data"
    state = "loading"

    applyStateToAllBodies()
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

                const values = sectionVariableValues(audioData.sections, i)

                for (const variable of SECTION_VARIABLES) {
                    const value = values[variable]

                    elm.dataset[sectionDatasetKey(variable)] = value
                    elm.style.setProperty(sectionVariableName(variable), value)
                }
            })
        }

        for (let i = audioData.sections.length; i < markerElms.length; i++) {
            const marker = markerElms[i] as HTMLDivElement
            const section = sectionElms[i] as HTMLDivElement

            [marker, section].forEach((elm) => elm.classList.add("section-marker-not-exists"))
        }
    }

    // Values go in a frame later so the new elements can transition in. An
    // offscreen document has its rAF throttled away, so there they go direct.
    if (mount.doc.hidden) apply()
    else view.requestAnimationFrame(apply)
}
