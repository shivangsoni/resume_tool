import { describe, expect, it } from "vitest";
import {
  answerKeyBase,
  answersCoverQuestionKey,
  coerceQuestionAnswer,
  formatLocationAnswer,
  isQuestionAnswered,
  isUselessQuestionLabel,
  lookupStoredAnswer,
  matchPhoneDialCountry,
  matchSelectOption,
  priorAnswerKeys,
  resolveQuestionInputType,
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

  it("does not render country checkbox prompts as Yes/No", () => {
    expect(resolveQuestionInputType({
      type: "checkbox",
      label: "Please select the country where you currently reside.",
    })).toBe("text");
    expect(resolveQuestionInputType({
      type: "checkbox",
      label: "Are you authorized to work in the United States?",
    })).toBe("checkbox");
    expect(resolveQuestionInputType({
      type: "checkbox",
      label: "Please select the country or countries you anticipate working in",
      options: ["United States", "Canada"],
    })).toBe("multiselect");
  });

  it("maps Greenhouse location and phone widgets to matching input types", () => {
    expect(resolveQuestionInputType({ type: "autocomplete", label: "Location (City)" })).toBe("autocomplete");
    expect(resolveQuestionInputType({ type: "text", label: "Location (City)" })).toBe("autocomplete");
    expect(resolveQuestionInputType({ type: "phone", label: "Phone" })).toBe("phone");
    expect(resolveQuestionInputType({ type: "text", label: "Phone" })).toBe("phone");
  });

  it("formats location answers for Greenhouse typeaheads", () => {
    expect(formatLocationAnswer("redmond", {
      city: "redmond",
      state: "Washington",
      country: "United States",
    })).toBe("redmond, Washington, United States");
    expect(formatLocationAnswer("Redmond, Washington, United States", {
      city: "Redmond",
      state: "WA",
      country: "United States",
    })).toBe("Redmond, Washington, United States");
    expect(matchPhoneDialCountry("USA")).toBe("United States");
    expect(coerceQuestionAnswer({ type: "phone", label: "Phone" }, "(530) 204-8592")).toBe("5302048592");
  });

  it("answersCoverQuestionKey matches by base key", () => {
    expect(answersCoverQuestionKey({ "field__10": "ok" }, "field__12")).toBe(true);
    expect(answersCoverQuestionKey({ other: "ok" }, "field__12")).toBe(false);
  });
});
