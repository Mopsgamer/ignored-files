import * as vscode from "vscode"

let scanningTimeout: NodeJS.Timeout | undefined = undefined
// Keep track of the actual state locally to avoid redundant VS Code UI updates
let isCurrentlyScanning = false

export function setScanning(value: boolean): void {
	if (value) {
		if (scanningTimeout) {
			clearTimeout(scanningTimeout)
			scanningTimeout = undefined
		}

		// Only update VS Code if the state is actually transitioning from false to true
		if (!isCurrentlyScanning) {
			isCurrentlyScanning = true
			vscode.commands.executeCommand("setContext", "ignoredFiles.isScanning", true)
		}
		return
	}

	if (scanningTimeout) clearTimeout(scanningTimeout)

	scanningTimeout = setTimeout(() => {
		isCurrentlyScanning = false
		vscode.commands.executeCommand("setContext", "ignoredFiles.isScanning", false)
		scanningTimeout = undefined
	}, 150) // Bumped to 150ms to comfortably bridge rapid git/file system bursts
}
