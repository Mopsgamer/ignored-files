import ms from "ms"
import { scan } from "view-ignored"
import * as vscode from "vscode"

import { explain } from "../explain.js"
import { output } from "../output.js"
import { parseUri } from "../parseUri.js"
import { pickTarget } from "../pickValue.js"
import { printErr } from "../printErr.js"
import { targetMakerFromName, TargetName } from "../targetName.js"

export default async function (entryUri: vscode.Uri): Promise<void> {
	if (!(entryUri instanceof vscode.Uri)) return
	const parsed = parseUri(entryUri)
	if (!parsed) return
	const { cwd, entry } = parsed
	const title = "Explain ignoring for " + entry
	const choice = await pickTarget(title, false)
	if (!choice) return
	const { targetName } = choice
	const targetMaker = targetMakerFromName(targetName as TargetName)
	const target = targetMaker()
	output.info("Explaining '" + entry + "'. targetName is " + targetName)
	output.info("Scanning to explain...")
	const start = Date.now()
	let explanation: string
	try {
		const match = (await scan({ target, within: entry, cwd })).paths.get(entry)!
		explanation = explain(match, targetName as TargetName)
	} catch (cause) {
		const message = "Failed to explain '" + entry + "'"
		printErr(new Error(message, { cause }))
		void vscode.window.showErrorMessage(message, { modal: true })
		return
	}
	output.info("Explained '" + entry + "' in", ms(Date.now() - start, { long: true }))
	output.info("Got the explanation message: " + explanation)
	void vscode.window.showInformationMessage(entry, { modal: true, detail: explanation })
}
