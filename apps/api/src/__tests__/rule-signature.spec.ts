import { ruleSignature, type RuleSignatureInput } from "@kanban/shared";

/**
 * `ruleSignature` is the single definition of "the same rule": RulesService
 * answers 409 when it matches, the wizard disables Save. The interesting cases
 * are the ones that must NOT collide — above all the status picked in the
 * sentence, which is a condition value and therefore part of the identity.
 */
describe("ruleSignature", () => {
  const base: RuleSignatureInput = {
    triggerKey: "issue.moved",
    templateKey: "moved_to",
    actionKey: "issue.lock",
    actionConfig: { reason: "done" },
    conditions: [{ field: "to_status", operator: "=", value: "4" }],
  };

  it("matches the identical rule", () => {
    expect(ruleSignature({ ...base })).toBe(ruleSignature({ ...base }));
  });

  it("changes when another status is picked (the dropdown case)", () => {
    const other = { ...base, conditions: [{ field: "to_status", operator: "=", value: "5" }] };
    expect(ruleSignature(other)).not.toBe(ruleSignature(base));
  });

  it("changes when a condition appears or disappears", () => {
    expect(ruleSignature({ ...base, conditions: [] })).not.toBe(ruleSignature(base));
    expect(
      ruleSignature({
        ...base,
        conditions: [...(base.conditions ?? []), { field: "category", operator: "=", value: "2" }],
      }),
    ).not.toBe(ruleSignature(base));
  });

  it("ignores the order the conditions were written in", () => {
    const swapped: RuleSignatureInput = {
      ...base,
      conditions: [
        { field: "category", operator: "=", value: "2" },
        { field: "to_status", operator: "=", value: "4" },
      ],
    };
    const other: RuleSignatureInput = {
      ...base,
      conditions: [
        { field: "to_status", operator: "=", value: "4" },
        { field: "category", operator: "=", value: "2" },
      ],
    };
    expect(ruleSignature(swapped)).toBe(ruleSignature(other));
  });

  it("treats numbers and their string form as the same value", () => {
    expect(ruleSignature({ ...base, actionConfig: { priority: 3 } })).toBe(
      ruleSignature({ ...base, actionConfig: { priority: "3" } }),
    );
    expect(ruleSignature({ ...base, conditions: [{ field: "to_status", operator: "=", value: 4 }] })).toBe(
      ruleSignature({ ...base, conditions: [{ field: "to_status", operator: "=", value: "4" }] }),
    );
  });

  it("drops blank config values so an untouched field splits nothing", () => {
    expect(ruleSignature({ ...base, actionConfig: { reason: "done", target: "" } })).toBe(
      ruleSignature(base),
    );
    expect(ruleSignature({ ...base, actionConfig: { reason: "done", target: null } })).toBe(
      ruleSignature(base),
    );
  });

  it("changes when the action or its config changes", () => {
    expect(ruleSignature({ ...base, actionKey: "issue.move_step_only" })).not.toBe(
      ruleSignature(base),
    );
    expect(ruleSignature({ ...base, actionConfig: { reason: "other" } })).not.toBe(
      ruleSignature(base),
    );
  });

  it("changes when the trigger changes, and treats a null template as blank", () => {
    expect(ruleSignature({ ...base, triggerKey: "issue.created" })).not.toBe(ruleSignature(base));
    expect(ruleSignature({ ...base, templateKey: null })).not.toBe(ruleSignature(base));
    expect(ruleSignature({ ...base, templateKey: "" })).toBe(ruleSignature({ ...base, templateKey: null }));
  });

  it("never returns the same string for two different shapes", () => {
    // field/value boundaries must not be re-interpretable: ONE condition whose
    // value carries a quote-comma pair is never two conditions
    const one: RuleSignatureInput = {
      triggerKey: "issue.moved",
      templateKey: "moved_to",
      actionKey: "issue.lock",
      conditions: [{ field: "to_status", operator: "=", value: 'a","b' }],
    };
    const two: RuleSignatureInput = {
      triggerKey: "issue.moved",
      templateKey: "moved_to",
      actionKey: "issue.lock",
      conditions: [
        { field: "to_status", operator: "=", value: "a" },
        { field: 'b"', operator: "=", value: "" },
      ],
    };
    expect(ruleSignature(one)).not.toBe(ruleSignature(two));
  });
});
