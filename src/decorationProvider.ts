import ms from "ms"
import * as fs from "node:fs"
import * as vign from "view-ignored"
import {
	MatcherContext,
	matcherContextAddPath,
	matcherContextRemovePath,
} from "view-ignored/patterns"
import * as vscode from "vscode"

import { setScanning } from "./context.js"
import { explain } from "./explain.js"
import { output } from "./output.js"
import { parseUri, pathToUri } from "./parseUri.js"
import { Semaphore } from "./semaphore.js"
import { targetFromName } from "./targetName.js"

export type DecorationKind = "ignored" | "included" | "unknown"

export class DecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
	private mutex = new Semaphore(1)
	private readonly onDidChange = new vscode.EventEmitter<vscode.Uri>()
	readonly onDidChangeFileDecorations = this.onDidChange.event.bind(this.onDidChange)

	private decorations = new Map<string, DecorationKind>()

	// @ts-expect-error initialized by init
	private ctx: MatcherContext

	constructor() {}

	async init(options?: Partial<Omit<vign.ScanOptions, "cwd">>): Promise<void> {
		setScanning(true)
		using _ = await this.mutex.acquire()
		await this.scan(options)
		vscode.workspace.onDidChangeWorkspaceFolders(async () => {
			setScanning(true)
			using _ = await this.mutex.acquire()
			await this.scan(options)
		})
		this.watch()
	}

	private aborter = new AbortController()
	private options: Required<Omit<vign.ScanOptions, "cwd">> = {
		target: targetFromName("Git"),
		fastDepth: true,
		fastInternal: true,
		invert: false,
		depth: Infinity,
		fs,
		signal: null,
		within: ".",
	}

	private async scan(options?: Partial<Omit<vign.ScanOptions, "cwd">>): Promise<void> {
		assignOpt(this.options, options)
		setScanning(true)
		using _ = { [Symbol.dispose]: () => setScanning(false) }
		await this.clear()
		if (!vscode.workspace.workspaceFolders) return
		for (const directory of vscode.workspace.workspaceFolders) {
			const cwd = directory.uri.fsPath
			const ctx = await vign.scan({ ...this.options, cwd })
			this.ctx = ctx
			for (const [file, _match] of ctx.paths) {
				if (file.endsWith("/")) continue
				const uri = pathToUri(cwd, file)
				this.add(uri)
			}
		}
	}

	/**
	 * This function recalculates decoration.
	 */
	add(uri: vscode.Uri): void {
		const ignored = this.options.invert
		const decoration = ignored ? "ignored" : "included"
		this.decorations.set(uri.fsPath, decoration)
		this.onDidChange.fire(uri)
	}
	/**
	 * This function recalculates decoration.
	 */
	del(uri: vscode.Uri): void {
		this.decorations.delete(uri.fsPath)
		this.onDidChange.fire(uri)
	}

	private async watchPatch(
		f: { cwd: string; entry: string },
		cb: (f: { cwd: string; entry: string }) => Promise<void>,
	): Promise<void> {
		const before = new Set(this.ctx.paths.keys())
		await cb(f)
		const after = new Set(this.ctx.paths.keys())
		const added = Array.from(after.difference(before)),
			removed = Array.from(before.difference(after))
		output.info("Added:", f.entry, added)
		for (const element of added) {
			if (element.endsWith("/")) continue
			const uri = pathToUri(f.cwd, element)
			this.add(uri)
		}
		output.info("Deleted:", f.entry, removed)
		for (const element of removed) {
			if (element.endsWith("/")) continue
			const uri = pathToUri(f.cwd, element)
			this.del(uri)
		}
	}

	private didAny(
		eventName: string,
		cb: (f: { cwd: string; entry: string }) => Promise<void>,
	): (uri: vscode.Uri) => Promise<void> {
		return async (uri: vscode.Uri) => {
			const f = parseUri(uri)
			if (!f) return
			using _mutex = await this.mutex.acquire()
			setScanning(true)
			output.info("File " + eventName + ":", f.entry)
			using _notScanning = { [Symbol.dispose]: () => setScanning(false) }
			await this.watchPatch(f, cb)
		}
	}

	private watch(signal: AbortSignal | null = null): void {
		const start = Date.now()
		const watcher = vscode.workspace.createFileSystemWatcher("**/*", false, false, false)
		output.info("Started watching in " + ms(Date.now() - start))
		signal?.addEventListener("abort", async () => {
			const start = Date.now()
			watcher.dispose()
			setScanning(false)
			output.info("Stopped watching in " + ms(Date.now() - start))
		})
		watcher.onDidChange(
			this.didAny("changed", async (f) => {
				const opts: Required<vign.ScanOptions> = { cwd: f.cwd, ...this.options, signal }
				await matcherContextRemovePath(this.ctx, opts, f.entry)
				await matcherContextAddPath(this.ctx, opts, f.entry)
			}),
		)
		watcher.onDidChange(
			this.didAny("created", async (f) => {
				const opts: Required<vign.ScanOptions> = { cwd: f.cwd, ...this.options, signal }
				await matcherContextAddPath(this.ctx, opts, f.entry)
			}),
		)
		watcher.onDidChange(
			this.didAny("deleted", async (f) => {
				const opts: Required<vign.ScanOptions> = { cwd: f.cwd, ...this.options, signal }
				await matcherContextRemovePath(this.ctx, opts, f.entry)
			}),
		)
	}

	async clear(): Promise<void> {
		await this.deinit()
		const map = this.decorations
		this.decorations = new Map<string, DecorationKind>()
		for (const [fsPath] of map) {
			const uri = vscode.Uri.file(fsPath)
			this.del(uri)
		}
	}

	provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
		if (!this.ctx || this.decorations.size < 0) return
		const target = this.options.target
		const parsed = parseUri(uri)
		if (!parsed) return
		const match = this.ctx?.paths.get(parsed.entry)
		const tooltip = match
			? explain(this.options?.invert ?? false, match, target)
			: "Internal error, couldn't find " + parsed.entry
		const propagate = true
		let color: vscode.ThemeColor
		let badge: string
		switch (this.decorations.get(uri.fsPath)) {
			case "ignored":
				badge = "-"
				color = new vscode.ThemeColor("gitDecoration.ignoredResourceForeground")
				return { badge, tooltip, propagate, color }
			case "included":
				badge = "+"
				color = new vscode.ThemeColor("gitDecoration.untrackedResourceForeground")
				return { badge, tooltip, propagate, color }
		}
	}

	/**
	 * Disposes current scanning `scan` and `watch` operations.
	 * Use `init` to restart them again.
	 */
	async deinit(): Promise<void> {
		using _mutex = await this.mutex.acquire()
		try {
			this.aborter.abort()
			this.aborter = new AbortController()
		} catch {}
	}

	/**
	 * Runs only on `extension.deactivate` event. Never use it.
	 */
	dispose() {
		try {
			this.aborter.abort()
		} catch {}
		this.clear()
	}
}

export const decorationProvider = new DecorationProvider()

function assignOpt(target: any, ...sources: any[]) {
	for (const src of sources) {
		if (!src) continue
		for (const key in src) {
			if (!Object.hasOwn(src, key) || src[key] === undefined) continue
			target[key] = src[key]
		}
	}
	return target
}
