import ms from "ms"
import * as vscode from "vscode"

import { decorationProvider } from "../decorationProvider.js"
import { output } from "../output.js"
import { pickTarget } from "../pickValue.js"
import { targetMakerFromName, TargetName } from "../targetName.js"

export default async function (): Promise<void> {
	const title = "Scan for ignored files"
	const choice = await pickTarget(title, true)
	if (!choice) return
	const { targetName, invert } = choice
	if (targetName === "None") {
		await vscode.commands.executeCommand("viewIgnored.scan.clear")
		return
	}
	const start = Date.now()
	await decorationProvider.deinit()
	await decorationProvider.init({
		target: targetMakerFromName(targetName as TargetName),
		invert,
		skipInternal: invert === false,
	})
	output.info("Scanned", targetName, "in", ms(Date.now() - start, { long: true }))
}
