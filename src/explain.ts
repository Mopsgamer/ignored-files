import { RuleMatch, RuleMatchKind } from "view-ignored/patterns"
import { Target } from "view-ignored/targets"

import { output } from "./output.js"

export function explain(
	inverted: boolean,
	match: RuleMatch,
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
		case RuleMatchKind.external:
			reason += ` because of '${match.pattern}' pattern in '${match.source.path}'`
			break
		case RuleMatchKind.internal:
			reason += ` because of '${match.pattern}' pattern (internal pattern source)`
			break
		case RuleMatchKind.noMatch:
			const action = match.source.inverted ? "excludes" : "includes"
			reason += ` because '${match.source.path}' ${action} it (no matching patterns)`
			break
		case RuleMatchKind.missingSource:
			reason += ` because no sources found; ${potential}`
			break
		case RuleMatchKind.invalidSource:
			reason += ` because '${match.source.path}' has broken syntax`
			output.error(
				new Error("Broken syntax in '" + match.source.path + "'", {
					cause: match.error!,
				}),
			)
			break
		case RuleMatchKind.invalidInternal:
			reason += ` because target has broken internal patterns`
			output.error(new Error("Broken internal patterns", { cause: match.error! }))
			break
		case RuleMatchKind.invalidExternal:
			reason += ` because '${match.source.path}' has broken patterns`
			output.error(
				new Error("Broken patterns in '" + match.source.path + "'", { cause: match.error! }),
			)
			break
		case RuleMatchKind.none:
			reason += ` because it's not scanned; ${potential}`
			output.error(new Error("Not scanned"))
			break
		default:
			return ""
	}
	return reason
}
