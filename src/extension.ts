import * as fs from "node:fs"

import ms from "ms"
import { MatcherContext, SignedPatternMatch } from "view-ignored/patterns"
import * as vscode from "vscode"

import { NpmDecorationProvider } from "./decorationsProvider.js"
import { explain } from "./explain.js"
import { output } from "./output.js"
import { parseUri } from "./parseUri.js"
import { targetFromName, TargetName, targetNames } from "./targetName.js"

function pickValue(
	title: string,
	placeholder: string,
	items: string[],
): Promise<string | undefined> {
	return new Promise((resolve) => {
		const quickPick = vscode.window.createQuickPick()
		quickPick.title = title
		quickPick.placeholder = placeholder
		quickPick.items = items.map((label) => ({ label }))
		quickPick.ignoreFocusOut = true

		quickPick.onDidAccept(() => {
			const selection = quickPick.selectedItems[0]
			resolve(selection ? selection.label : undefined)
			quickPick.hide()
		})

		quickPick.onDidHide(() => {
			resolve(undefined)
			quickPick.dispose()
		})

		quickPick.show()
	})
}

export function activate(context: vscode.ExtensionContext) {
	output.info("Started")
	context.subscriptions.push(output)

	const derorationsProvider = new NpmDecorationProvider()
	context.subscriptions.push(derorationsProvider)
	context.subscriptions.push(vscode.window.registerFileDecorationProvider(derorationsProvider))

	context.subscriptions.push(
		vscode.commands.registerCommand("ignoredFiles.scan.clear", () => {
			output.info("Clearing")
			derorationsProvider.clear()
		}),

		vscode.commands.registerCommand("ignoredFiles.scan", async () => {
			const title = "Scan for ignored files"

			const targetName = await pickValue(title, "Select the target", [...targetNames])
			if (!targetName) return

			const invert = await pickValue(title, "Enable invertion?", ["included", "ignored"])
			if (!invert) return

			const start = Date.now()
			await derorationsProvider.scanWithProgress({
				target: targetFromName(targetName as TargetName),
				fastDepth: true,
				fastInternal: true,
				invert: invert === "ignored",
			})
			const end = Date.now()
			output.info("Scanned", targetName, "in", ms(end - start, { long: true }))
		}),

		vscode.commands.registerCommand("ignoredFiles.explain", async (entryUri: vscode.Uri) => {
			if (!(entryUri instanceof vscode.Uri)) {
				return
			}
			const parsed = parseUri(entryUri)
			if (!parsed) return

			const { cwd, entry } = parsed
			const title = "Explain ignoring for " + entry

			const targetName = await pickValue(title, "Select the target", [...targetNames])
			if (!targetName) return
			output.info("Explaining '" + entry + "'. targetName is " + targetName)

			const tempCtx: MatcherContext = {
				depthPaths: new Map(),
				external: new Map(),
				failed: [],
				paths: new Map(),
				totalDirs: 0,
				totalFiles: 0,
				totalMatchedFiles: 0,
			}

			const aborter = new AbortController()
			const matchProcess = targetFromName(targetName as TargetName).ignores({
				cwd: cwd.replace(/\w:/, ""),
				ctx: tempCtx,
				entry,
				fs,
				signal: aborter.signal,
			})

			output.info("Scanning to explain...")

			const t = setTimeout(aborter.abort, 5000)
			const start = Date.now()
			let match: SignedPatternMatch
			try {
				match = await matchProcess
			} catch (err) {
				output.error(new Error("Unexpected scanning error", { cause: err }))
				return
			} finally {
				const end = Date.now()
				output.info("'" + entry + "'", "has been explained in", ms(end - start, { long: true }))
				clearTimeout(t)
			}
			output.info("Creating message...")
			void vscode.window.showInformationMessage(entry, {
				modal: true,
				detail: explain(false, match, targetName, targetFromName(targetName as TargetName)),
			})
		}),
	)
}

export function deactivate() {}
