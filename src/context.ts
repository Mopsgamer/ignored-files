import * as vscode from "vscode"

import { TargetName } from "./targetName.js"

export function setReady(value: boolean): void {
	vscode.commands.executeCommand("setContext", "viewIgnored.isReady", value)
}

export function setScanning(value: boolean): void {
	vscode.commands.executeCommand("setContext", "viewIgnored.isScanning", value)
}

export function setTarget(value: TargetName): void {
	vscode.commands.executeCommand("setContext", "viewIgnored.target", value)
}
