import * as vscode from "vscode"

import { output } from "./output.js"

export function parseUri(uri: vscode.Uri): { entry: string; cwd: string } | void {
	if (uri.scheme !== "file") {
		output.warn("Ignoring '" + uri.scheme + "' uri scheme for ", uri)
		return
	}
	const fsPath = uri.fsPath.replace(/\/\w:/, "")
	const folder =
		vscode.workspace.workspaceFolders?.find((f) => fsPath.startsWith(f.uri.fsPath))?.uri.fsPath ||
		""
	if (!folder) {
		output.error("Not parsable: " + uri)
		vscode.window.showErrorMessage("Not parsable: " + uri)
	}
	if (folder === fsPath) {
		const entry = "."
		const cwd = folder.replace(/^\\|^\//, "").replaceAll(/\\/g, "/")
		return { entry, cwd }
	}
	const cwd = folder.replace(/^\\|^\//, "").replaceAll(/\\/g, "/")
	const entry = fsPath
		.replace(folder, "")
		.replace(/^\\|^\//, "")
		.replaceAll(/\\/g, "/")
	return { entry, cwd }
}
