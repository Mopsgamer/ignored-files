import ms from "ms"
import * as vscode from "vscode"

import { decorationProvider } from "../decorationProvider.js"
import { output } from "../output.js"
import { pickTarget } from "../pickValue.js"
import { targetMakerFromName, TargetName, targetNames } from "../targetName.js"

export default async function (mayTarget: any, mayInvert: any): Promise<void> {
	const title = "Scan for ignored files"

	let targetName, invert
	if (targetNames.includes(mayTarget) && [true, false, 2].some((v) => v === mayInvert)) {
		targetName = mayTarget
		invert = mayInvert
	} else {
		const choice = await pickTarget(title, true)
		if (!choice) return
		;({ targetName, invert } = choice)
	}

	if (targetName === "None") {
		await vscode.commands.executeCommand("viewIgnored.scan.clear")
		return
	}
	const start = Date.now()
	await decorationProvider.init({
		target: targetMakerFromName(targetName as TargetName),
		invert,
	})
	output.info("Scanned", targetName, "in", ms(Date.now() - start, { long: true }))
}
