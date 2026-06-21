import ms from "ms"
import * as vscode from "vscode"

import { decorationProvider } from "../decorationProvider.js"
import { output } from "../output.js"
import pickValue from "../pickValue.js"
import {
	nameFromTargetMaker,
	relatedTargets,
	targetMakerFromName,
	TargetName,
} from "../targetName.js"

export default async function (): Promise<void> {
	const title = "Scan for ignored files"
	const related = (await relatedTargets()).map(nameFromTargetMaker)
	const targetName = await pickValue(title, "Select the target", [
		{ label: "None", alwaysShow: true },
		...related.map<vscode.QuickPickItem>((name) => ({
			label: name,
			iconPath:
				name === "VSCE"
					? new vscode.ThemeIcon("extensions")
					: name === "Yarn classic"
						? new vscode.ThemeIcon("view-ignored-yarn")
						: new vscode.ThemeIcon("view-ignored-" + name.toLowerCase()),
		})),
	])
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
