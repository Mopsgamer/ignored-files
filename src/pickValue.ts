import * as vscode from "vscode"

import { nameFromTargetMaker, relatedTargets } from "./targetName.js"

export function pickValue(
	title: string,
	placeholder: string,
	items: Array<vscode.QuickPickItem | string>,
	onItemButton?: (item: vscode.QuickPickItem, button: vscode.QuickInputButton) => void,
): Promise<string | undefined> {
	const { promise, resolve } = Promise.withResolvers<string | undefined>()
	const quickPick = vscode.window.createQuickPick()
	quickPick.title = title
	quickPick.placeholder = placeholder
	quickPick.items = items.map((item) => (typeof item === "string" ? { label: item } : item))
	quickPick.ignoreFocusOut = true

	if (onItemButton) {
		quickPick.onDidTriggerItemButton((e) => {
			onItemButton(e.item, e.button)
			resolve(e.item.label)
			quickPick.hide()
		})
	}

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
	return promise
}

export async function pickTarget(
	title: string,
	none = false,
): Promise<{ targetName: string; mode: "included" | "excluded" } | undefined> {
	const related = (await relatedTargets()).map(nameFromTargetMaker)
	let selectedMode: "included" | "excluded" = "included"

	const targetName = await pickValue(
		title,
		"Select the target",
		[
			...(none ? [{ label: "None", alwaysShow: true }] : []),
			...related.map<vscode.QuickPickItem>((name) => ({
				label: name,
				buttons: [
					{ iconPath: new vscode.ThemeIcon("add"), tooltip: "Scan Included" },
					{ iconPath: new vscode.ThemeIcon("remove"), tooltip: "Scan Excluded" },
				],
				iconPath:
					name === "VSCE"
						? new vscode.ThemeIcon("extensions")
						: name === "Yarn v1, Classic"
							? new vscode.ThemeIcon("view-ignored-yarn")
							: new vscode.ThemeIcon("view-ignored-" + name.toLowerCase()),
			})),
		],
		(_item, button) => {
			selectedMode = button.tooltip === "Scan Included" ? "included" : "excluded"
		},
	)

	if (!targetName) return undefined
	return { targetName: targetName, mode: selectedMode }
}
