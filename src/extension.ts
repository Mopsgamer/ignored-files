import ms from "ms"
import * as fs from "node:fs"
import { MatcherContext, RuleMatch } from "view-ignored/patterns"
import * as vscode from "vscode"

import { collectCauses } from "./collectCauses.js"
import { NpmDecorationProvider } from "./decorationsProvider.js"
import { explain } from "./explain.js"
import { output } from "./output.js"
import { parseUri } from "./parseUri.js"
import {
	TargetName,
	nameFromTarget,
	relatedTargets,
	targetFromName,
	targetNames,
} from "./targetName.js"

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
			const aborter = new AbortController()
			const unixCwd = cwd.replace(/\w:/, "")

			const related = await relatedTargets(unixCwd, fs, aborter.signal)

			const targetName = await pickValue(title, "Select the target", related.map(nameFromTarget))
			if (!targetName) return
			const target = targetFromName(targetName as TargetName)
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

			output.info("Scanning to explain...")

			const start = Date.now()
			let match: RuleMatch
			try {
				using _t = setTimeout(aborter.abort.bind(aborter), 5000)
				await target.init?.({ ctx: tempCtx, cwd: unixCwd, fs, signal: aborter.signal, target })
				match = await target.ignores({
					cwd: unixCwd,
					ctx: tempCtx,
					entry,
					fs,
					signal: aborter.signal,
					target
				})
			} catch (err) {
				if (err instanceof Error) {
					const detail = collectCauses(err).join(": ")
					void vscode.window.showErrorMessage("Failed to explain " + entry, { modal: true, detail })
					output.error("'" + entry + "': " + detail)
					return
				}
				output.error(String(err))
				throw err
			}
			const end = Date.now()
			output.info("'" + entry + "' has been explained in", ms(end - start, { long: true }))
			const explanation = explain(
				false,
				match,
				targetName,
				targetFromName(targetName as TargetName),
			)
			output.info("Got the explanation message: " + explanation)
			void vscode.window.showInformationMessage(entry, { modal: true, detail: explanation })
		}),
	)
}

export function deactivate() {}
