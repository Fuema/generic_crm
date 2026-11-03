import { describe, expect, test } from "bun:test";
import {
	normalizedProbability,
	pipelineInputSchema,
	stagesProblem,
} from "#/modules/pipelines/schema";

const stage = (type: "open" | "won" | "lost", probability = 50) => ({
	id: "",
	name: { en: type, es: "" },
	probability,
	type,
});

describe("stagesProblem", () => {
	test("needs an open stage and exactly one won and one lost", () => {
		expect(
			stagesProblem([stage("open"), stage("won"), stage("lost")]),
		).toBeNull();
		expect(stagesProblem([stage("won"), stage("lost")])).not.toBeNull();
		expect(
			stagesProblem([stage("open"), stage("won"), stage("won"), stage("lost")]),
		).not.toBeNull();
		expect(stagesProblem([stage("open"), stage("won")])).not.toBeNull();
	});

	test("at most 20 stages", () => {
		const many = [
			...Array.from({ length: 18 }, () => stage("open")),
			stage("won"),
			stage("lost"),
		];
		expect(stagesProblem(many)).toBeNull();
		expect(stagesProblem([stage("open"), ...many])).not.toBeNull();
	});
});

test("won is always 100 and lost 0", () => {
	expect(normalizedProbability(stage("won", 3))).toBe(100);
	expect(normalizedProbability(stage("lost", 90))).toBe(0);
	expect(normalizedProbability(stage("open", 40))).toBe(40);
});

test("the input schema rejects bad probabilities, names and shapes", () => {
	const ok = {
		name: { en: "Sales", es: "" },
		stages: [stage("open"), stage("won"), stage("lost")],
	};
	expect(pipelineInputSchema.safeParse(ok).success).toBe(true);
	expect(
		pipelineInputSchema.safeParse({ ...ok, name: { en: "", es: "" } }).success,
	).toBe(false);
	expect(
		pipelineInputSchema.safeParse({
			...ok,
			stages: [stage("open", 101), stage("won"), stage("lost")],
		}).success,
	).toBe(false);
	expect(
		pipelineInputSchema.safeParse({
			...ok,
			stages: [stage("won"), stage("lost")],
		}).success,
	).toBe(false);
});
