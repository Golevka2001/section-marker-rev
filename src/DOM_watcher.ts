export function waitForElm(selector:string, within:ParentNode = document.body, timeoutAfter = 5000, shouldReject = false): Promise<HTMLElement> {
	return new Promise((resolve, reject) => {
		let timeoutId: ReturnType<typeof setTimeout>
		if (timeoutAfter > 0) {
			timeoutId = setTimeout(() => {
				if (shouldReject) {
					return reject("Did not find element after timeout.")
				} else {
					console.warn("waitForElm has waited for", timeoutAfter ," for selector", selector, "within", within, "but it has not yet been found.")
				}
			}, timeoutAfter)
		}

		const el = within.querySelector(selector)
		if (el) {
			return resolve(el as HTMLElement)
		}

		const observer = new MutationObserver(() => {
			const el = within.querySelector(selector)
			if (el) {
				observer.disconnect()
				clearTimeout(timeoutId)
				return resolve(el as HTMLElement)
			}
		})

		observer.observe(within as Node, {
			childList: true,
			subtree: true
		})
	})
}

export function watchForElement(
	selector: string,
	within: ParentNode = document.body,
	callback: (el: Node) => void,
	destructionCallback?: (el: Node) => void,
	watch_subtree = true
) {
	const destructionObservers: MutationObserver[] = []

	function elementFound(el: Node) {
		callback(el as HTMLElement)

		if (destructionCallback && el.parentNode) {
			const observer = new MutationObserver((records) => {
				for (const record of records) {
					for (const removedNode of record.removedNodes) {
						if (removedNode !== el) continue
						observer.disconnect()
						destructionCallback(el)
						return
					}
				}
			})
			observer.observe(el.parentNode, {
				childList: true
			})
			destructionObservers.push(observer)
		}
	}

	function inspect(node: Node) {
		if (!(node instanceof HTMLElement)) return

		// The added node itself may be the match, e.g. when the client swaps
		// the whole progress bar instead of filling in a placeholder
		if (node.matches(selector)) elementFound(node)

		node.querySelectorAll(selector).forEach(elementFound)
	}

	// Initial search
	const el = within.querySelector(selector)
	if (el) elementFound(el)

	const observer = new MutationObserver((records) => {
		for (const record of records) {
			for (const addedNode of record.addedNodes) {
				inspect(addedNode)
			}
		}
	})
	observer.observe(within as Node, {
		childList: true,
		subtree: watch_subtree
	})

	return () => {
		observer.disconnect()
		for (const destructionObserver of destructionObservers) {
			destructionObserver.disconnect()
		}
		destructionObservers.length = 0
	}
}