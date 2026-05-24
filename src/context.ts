import * as vscode from "vscode"

let scanningTimeout: NodeJS.Timeout | undefined = undefined
let isCurrentlyScanning = false

export function setScanning(value: boolean): void {
	if (value) {
		if (scanningTimeout) {
			clearTimeout(scanningTimeout)
			scanningTimeout = undefined
		}
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
	}, 150) // TODO: use git's extension time
}
