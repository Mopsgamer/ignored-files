import ms from "ms"
import * as vscode from "vscode"

import clear from "./commands/clear.js"
import explain from "./commands/explain.js"
import scan from "./commands/scan.js"
import { context as gcontext, getInvert, getTarget, setReady } from "./context.js"
import { decorationProvider } from "./decorationProvider.js"
import { output } from "./output.js"

export async function activate(context: vscode.ExtensionContext) {
	gcontext.val = context
	const start = Date.now()
	output.info("Starting extension...")
	context.subscriptions.push(output)
	context.subscriptions.push(decorationProvider)
	context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorationProvider))
	context.subscriptions.push(
		vscode.commands.registerCommand("viewIgnored.scan.clear", clear),
		vscode.commands.registerCommand("viewIgnored.scan", scan),
		vscode.commands.registerCommand("viewIgnored.explain", explain),
	)
	const targetName = getTarget()
	const invert = getInvert()
	setReady(true)
	output.info("Started extension in " + ms(Date.now() - start))
	scan(targetName, invert)
}
