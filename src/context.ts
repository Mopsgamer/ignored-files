import * as vscode from "vscode"

import { TargetName } from "./targetName.js"

export const context = { val: null as unknown as vscode.ExtensionContext }

//#region set
export function setReady(value: boolean): void {
	vscode.commands.executeCommand("setContext", "viewIgnored.isReady", value)
}

export function setScanning(value: boolean): void {
	vscode.commands.executeCommand("setContext", "viewIgnored.isScanning", value)
}

export function setTarget(value: TargetName | "None"): void {
	context.val.globalState.update("viewIgnored.target", value)
	vscode.commands.executeCommand("setContext", "viewIgnored.target", value)
}

export function setInvert(value: boolean | 2): void {
	context.val.globalState.update("viewIgnored.invert", value)
	vscode.commands.executeCommand("setContext", "viewIgnored.invert", value)
}
//#endregion

//#region get
export function getTarget(force: true): TargetName
export function getTarget(force?: false): TargetName | "None"
export function getTarget(force = false) {
	if (!context.val) return force ? "Git" : "None"
	const v = context.val.globalState.get<TargetName | "None">("viewIgnored.target", "None")
	return force && v === "None" ? "Git" : v
}

export function getInvert(): boolean | 2 {
	return context.val.globalState.get<boolean | 2>("viewIgnored.invert", false)
}
////#endregion
