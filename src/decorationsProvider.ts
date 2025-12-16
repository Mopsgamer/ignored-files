import path from "node:path"

import * as vign from "view-ignored"
import { MatcherContext } from "view-ignored/patterns"
import * as vscode from "vscode"

import { explain } from "./explain.js"
import { parseUri } from "./parseUri.js"
import { nameFromTarget, targetFromName, TargetName } from "./targetName.js"

export type DecorationKind = "ignored" | "included" | "unknown"

export class NpmDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
	private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>()
	readonly onDidChangeFileDecorations = this._onDidChange.event.bind(this._onDidChange)

	private decorations = new Map<string, DecorationKind>()

	private ctx: MatcherContext | undefined

	constructor() {}

	private targetName: TargetName | undefined
	private aborter = new AbortController()

	private async scan(options: Omit<vign.ScanOptions, "cwd">): Promise<void> {
		this.targetName = nameFromTarget(options.target)
		await this.clear()
		if (!vscode.workspace.workspaceFolders) {
			return
		}
		for (const directory of vscode.workspace.workspaceFolders) {
			const cwd = directory.uri.fsPath
			const ctx = await vign.scan({ fastInternal: true, ...options, cwd })
			this.ctx = ctx
			for (const [file, match] of ctx.paths) {
				if (file.endsWith("/")) {
					continue
				}
				const uri = vscode.Uri.file(path.join(cwd, file.replace("/", path.sep)))
				this.decorations.set(uri.fsPath, match.ignored ? "ignored" : "included")
				this._onDidChange.fire(uri)
			}
		}
	}

	private options: Omit<vign.ScanOptions, "cwd"> | undefined

	scanWithProgress(options: Omit<vign.ScanOptions, "cwd">) {
		this.options = options
		try {
			this.aborter.abort()
			this.aborter = new AbortController()
		} catch {}
		const targetName = nameFromTarget(options.target)
		return new Promise<void>((resolve) => {
			vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Scanning for ${targetName} files...`,
					cancellable: true,
				},
				async (_progress, token) => {
					const aborter = new AbortController()

					token.onCancellationRequested(() => {
						aborter.abort()
					})

					const signals = [this.aborter.signal, aborter.signal]
					if (options.signal) {
						signals.push(options.signal)
					}
					try {
						await this.scan({
							...options,
							signal: AbortSignal.any(signals),
						})
					} catch (error) {
						if ((error as DOMException).name === "TimeoutError") {
							vscode.window.showWarningMessage(`Scanning for ${targetName} files timed out (20s).`)
						}
					} finally {
						resolve()
					}
				},
			)
		})
	}

	async clear(): Promise<void> {
		const map = this.decorations
		this.decorations = new Map<string, DecorationKind>()
		for (const [fsPath] of map) {
			this.decorations.delete(fsPath)
			const uri = vscode.Uri.file(fsPath)
			this._onDidChange.fire(uri)
		}
	}

	provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
		if (!this.ctx || this.decorations.size < 0) return
		const targetName = this.targetName!
		const target = targetFromName(targetName)
		const parsed = parseUri(uri)
		if (!parsed) {
			return
		}
		const { entry } = parsed
		const match = this.ctx?.paths.get(entry)
		const explanation = match
			? explain(this.options?.invert ?? false, match, targetName, target)
			: "Internal error, couldn't find " + entry
		switch (this.decorations.get(uri.fsPath)) {
			case "ignored":
				return {
					badge: "-",
					tooltip: explanation,
					propagate: true,
					color: new vscode.ThemeColor("gitDecoration.ignoredResourceForeground"),
				}

			case "included":
				return {
					badge: "+",
					tooltip: explanation,
					propagate: true,
					color: new vscode.ThemeColor("gitDecoration.untrackedResourceForeground"),
				}

			default:
				return
		}
	}

	dispose() {
		try {
			this.aborter.abort()
		} catch {}
		this.clear()
	}
}
