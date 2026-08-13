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
): Promise<{ targetName: string; invert: boolean | 2 } | undefined> {
	const related = (await relatedTargets()).map(nameFromTargetMaker)
	let inver: boolean | 2 = false

	const targetName = await pickValue(
		title,
		"Select the target",
		[
			...(none ? [{ label: "None", alwaysShow: true }] : []),
			...related.map<vscode.QuickPickItem>((name) => ({
				label: name,
				buttons: [
					{ iconPath: new vscode.ThemeIcon("diff-added"), tooltip: "Show Included" },
					{ iconPath: new vscode.ThemeIcon("diff-ignored"), tooltip: "Show Excluded" },
					{ iconPath: new vscode.ThemeIcon("diff"), tooltip: "Show Both" },
				],
				iconPath:
					name === "VSCE"
						? new vscode.ThemeIcon("extensions")
						: name.startsWith("Yarn")
							? new vscode.ThemeIcon("view-ignored-yarn")
							: new vscode.ThemeIcon("view-ignored-" + name.toLowerCase()),
			})),
		],
		(_item, { tooltip }) => {
			inver = tooltip === "Show Included" ? false : tooltip === "Show Both" ? 2 : true
		},
	)

	if (!targetName) return undefined
	return { targetName: targetName, invert: inver }
}
