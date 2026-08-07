import { describe, expect, it } from "vitest";
import {
  answerKeyBase,
  answersCoverQuestionKey,
  coerceQuestionAnswer,
  isQuestionAnswered,
  isUselessQuestionLabel,
  lookupStoredAnswer,
  matchSelectOption,
  priorAnswerKeys,
} from "./question-answers";

describe("question-answers helpers", () => {
  it("rejects greenhouse generic labels", () => {
    expect(isUselessQuestionLabel("Questionnaire Field")).toBe(true);
    expect(isUselessQuestionLabel("Boolean Value")).toBe(true);
    expect(isUselessQuestionLabel("Text")).toBe(true);
    expect(isUselessQuestionLabel("Degree")).toBe(false);
  });

  it("recovers stored answers across index suffix shifts", () => {
    const stored = {
      "job_application[answers][1][text]__10": "Master's",
    };
    expect(lookupStoredAnswer(stored, priorAnswerKeys("job_application[answers][1][text]__12", "job_application[answers][1][text]__12"))).toBe("Master's");
    expect(answerKeyBase("name__g4")).toBe("name");
  });

  it("coerces Yes onto select options and counts answered only when valid", () => {
    expect(matchSelectOption(["Yes", "No"], "true")).toBe("Yes");
    expect(coerceQuestionAnswer({ type: "select", options: ["Yes", "No"] }, "yes")).toBe("Yes");
    expect(isQuestionAnswered({ key: "q", type: "select", options: ["Yes", "No"] }, { q: "Yes" })).toBe(true);
    expect(isQuestionAnswered({ key: "q", type: "select", options: ["Yes", "No"] }, { q: "maybe" })).toBe(false);
  });

  it("answersCoverQuestionKey matches by base key", () => {
    expect(answersCoverQuestionKey({ "field__10": "ok" }, "field__12")).toBe(true);
    expect(answersCoverQuestionKey({ other: "ok" }, "field__12")).toBe(false);
  });
});
