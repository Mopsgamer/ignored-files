import { SignedPatternMatch } from "view-ignored/patterns"
import { Target } from "view-ignored/targets"

import { output } from "./output.js"

export function explain(
	inverted: boolean,
	match: SignedPatternMatch,
	targetName: string,
	target: Target,
): string {
	let reason = inverted ? "Ignored" : "Included"
	reason += " by " + targetName
	const potential =
		target.extractors.length === 0
			? "no potential sources"
			: `potential sources: '${target.extractors.map((e) => e.path).join("', '")}'`
	switch (match.kind) {
		case "external":
			reason += ` because of '${match.pattern}' pattern in '${match.source.path}'`
			break
		case "internal":
			reason += ` because of '${match.pattern}' pattern (internal pattern source)`
			break
		case "no-match":
			const action = match.source.inverted ? "excludes" : "includes"
			reason += ` because '${match.source.path}' ${action} it (no matching patterns)`
			break
		case "missing-source":
			reason += ` because no sources found; ${potential}`
			break
		case "broken-source":
			reason += ` because '${match.source.path}' has broken syntax`
			output.error(
				new Error("Broken syntax in '" + match.source.path + "'", {
					cause: match.source.error!,
				}),
			)
			break
		case "invalid-internal-pattern":
			reason += ` because target has broken internal patterns`
			output.error(new Error("Broken internal patterns", { cause: match.error! }))
			break
		case "invalid-pattern":
			reason += ` because '${match.source.path}' has broken patterns`
			output.error(
				new Error("Broken patterns in '" + match.source.path + "'", { cause: match.source.error! }),
			)
			break
		case "none":
			reason += ` because it's not scanned; ${potential}`
			output.error(new Error("Not scanned"))
			break
		default:
			return ""
	}
	return reason
}
