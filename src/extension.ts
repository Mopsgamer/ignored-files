import ms from "ms"
import * as fs from "node:fs"
import { dirname } from "node:path/posix"
import { resolveSources, RuleMatch } from "view-ignored/patterns"
import * as vscode from "vscode"

import { collectCauses } from "./collectCauses.js"
import { setScanning } from "./context.js"
import { DecorationProvider } from "./decorationsProvider.js"
import { explain } from "./explain.js"
import { output } from "./output.js"
import { parseUri } from "./parseUri.js"
import { TargetName, nameFromTarget, relatedTargets, targetFromName } from "./targetName.js"

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

export async function activate(context: vscode.ExtensionContext) {
	output.info("Started")
	vscode.commands.executeCommand("setContext", "viewIgnored.isReady", true)
	setScanning(true)
	context.subscriptions.push(output)
	const decorationsProvider = new DecorationProvider()
	context.subscriptions.push(decorationsProvider)
	context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorationsProvider))
	context.subscriptions.push(
		vscode.commands.registerCommand("viewIgnored.scan.clear", () => {
			output.info("Clearing")
			decorationsProvider.clear()
		}),
		vscode.commands.registerCommand("viewIgnored.scan", async () => {
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
			decorationsProvider.deinit()
			await decorationsProvider.init({
				target: targetFromName(targetName as TargetName),
				invert: invert === "ignored",
			})
			output.info("Scanned", targetName, "in", ms(Date.now() - start, { long: true }))
		}),
		vscode.commands.registerCommand("viewIgnored.explain", async (entryUri: vscode.Uri) => {
			if (!(entryUri instanceof vscode.Uri)) {
				return
			}
			const parsed = parseUri(entryUri)
			if (!parsed) return
			const { cwd, entry } = parsed
			const title = "Explain ignoring for " + entry
			const aborter = new AbortController()
			const unixCwd = cwd.replace(/\w:/, "")
			const related = (await relatedTargets(aborter.signal)).map(nameFromTarget)
			const targetName = await pickValue(title, "Select the target", related)
			if (!targetName) return
			const target = targetFromName(targetName as TargetName)
			output.info("Explaining '" + entry + "'. targetName is " + targetName)
			output.info("Scanning to explain...")
			const start = Date.now()
			let match: RuleMatch
			try {
				using _t = setTimeout(aborter.abort.bind(aborter), 5000)
				await new Promise<void>((r, j) =>
					target.init?.({ cwd: unixCwd, fs, signal: aborter.signal, target }, (err) => {
						if (err) {
							j(err)
							return
						}
						r()
					}),
				)
				const dir = dirname(entry)
				const entries = await fs.promises.readdir(dir, { withFileTypes: true })
				match = await new Promise<RuleMatch>((r, j) => {
					resolveSources(
						{
							cwd: unixCwd,
							dir: dirname(entry),
							external: new Map(),
							fs,
							signal: aborter.signal,
							target,
							entries,
						},
						(err, resource) => {
							if (err) {
								j(err)
								return
							}
							target.ignores(
								{
									cwd: unixCwd,
									entry,
									fs,
									signal: aborter.signal,
									target,
									lowerEntry: entry.toLocaleLowerCase(),
									parentPath: dirname(entry),
									resource,
								},
								(err, match) => {
									if (err) {
										j(err)
										return
									}
									r(match)
								},
							)
						},
					)
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
			output.info("'" + entry + "' has been explained in", ms(Date.now() - start, { long: true }))
			const explanation = explain(false, match, targetName as TargetName)
			output.info("Got the explanation message: " + explanation)
			void vscode.window.showInformationMessage(entry, { modal: true, detail: explanation })
		}),
	)
	await decorationsProvider.init()
}

export function deactivate() {}
