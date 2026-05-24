import ms from "ms"
import * as vscode from "vscode"

import { decorationProvider } from "../decorationProvider.js"
import { output } from "../output.js"
import pickValue from "../pickValue.js"
import { nameFromTarget, relatedTargets, targetFromName, TargetName } from "../targetName.js"

export default async function (): Promise<void> {
	const title = "Scan for ignored files"
	const related = (await relatedTargets()).map(nameFromTarget)
	const targetName = await pickValue(title, "Select the target", ["None", ...related])
	if (!targetName) return
	if (targetName === "None") {
		await vscode.commands.executeCommand("viewIgnored.scan.clear")
		return
	}
	const invert = await pickValue(title, "Enable invertion?", ["included", "ignored"])
	if (!invert) return
	const start = Date.now()
	await decorationProvider.deinit()
	await decorationProvider.init({
		target: targetFromName(targetName as TargetName),
		invert: invert === "ignored",
	})
	output.info("Scanned", targetName, "in", ms(Date.now() - start, { long: true }))
}
