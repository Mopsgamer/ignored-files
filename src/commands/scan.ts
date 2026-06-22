import ms from "ms"
import * as vscode from "vscode"

import { decorationProvider } from "../decorationProvider.js"
import { output } from "../output.js"
import { pickValue, pickTarget } from "../pickValue.js"
import { targetMakerFromName, TargetName } from "../targetName.js"

export default async function (): Promise<void> {
	const title = "Scan for ignored files"
	const targetName = await pickTarget(title, true)
	if (!targetName) return
	if (targetName === "None") {
		await vscode.commands.executeCommand("viewIgnored.scan.clear")
		return
	}
	const invert = await pickValue(title + ": " + targetName, "Enable inversion?", [
		"included",
		"ignored",
	])
	if (!invert) return
	const start = Date.now()
	await decorationProvider.deinit()
	await decorationProvider.init({
		target: targetMakerFromName(targetName as TargetName),
		invert: invert === "ignored",
	})
	output.info("Scanned", targetName, "in", ms(Date.now() - start, { long: true }))
}
