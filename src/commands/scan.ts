import ms from "ms"

import { decorationProvider } from "../decorationProvider.js"
import { output } from "../output.js"
import { pickTarget } from "../pickValue.js"
import {
	nameFromTargetMaker,
	relatedTargetMakers,
	targetMakerFromName,
	TargetName,
	targetNames,
} from "../targetName.js"
import clear from "./clear.js"

export default async function (mayTarget: any, mayInvert: any): Promise<void> {
	const title = "Scan for ignored files"

	let targetName, invert
	if (
		["None", ...targetNames].includes(mayTarget) &&
		[true, false, 2].some((v) => v === mayInvert)
	) {
		const { related } = await relatedTargetMakers(AbortSignal.timeout(5000))
		const relatedNames = related.map(nameFromTargetMaker)
		if (relatedNames.includes(mayTarget)) {
			targetName = mayTarget
			invert = mayInvert
		} else {
			return clear(false)
		}
	} else {
		const choice = await pickTarget(title, true)
		if (!choice) return
		;({ targetName, invert } = choice)
	}

	if (targetName === "None") return clear(true)
	const start = Date.now()
	await decorationProvider.init({
		target: targetMakerFromName(targetName as TargetName),
		invert,
	})
	output.info("Scanned", targetName, "in", ms(Date.now() - start, { long: true }))
}
