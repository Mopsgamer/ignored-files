import * as vscode from "vscode"

export function setReady(value: boolean): void {
	vscode.commands.executeCommand("setContext", "viewIgnored.isReady", value)
}

export function setScanning(value: boolean): void {
	vscode.commands.executeCommand("setContext", "viewIgnored.isScanning", value)
}
