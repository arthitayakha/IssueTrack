import { readFileSync } from "fs";
import { join } from "path";
import {
  INVALID_ACTION_COMBOS,
  RULE_ACTIONS,
  RULE_ACTION_RECOMMENDATIONS,
  RULE_TRIGGERS,
  RULE_TRIGGER_CATEGORIES,
  getMessageTokens,
  isActionCompatible,
} from "@kanban/shared";

/**
 * The rules registry is shared by the wizard, the API and the engine, so a
 * typo here breaks all three at once. These tests check the cross-references
 * between them instead of duplicating the data.
 */

const ENGINE_SOURCE = readFileSync(
  join(__dirname, "../modules/rules/rules-engine.service.ts"),
  "utf8",
);

/**
 * Actions the registry advertises as `supported` but the engine still skips
 * (they land in `rule_runs` as `skipped`). Timer semantics are undecided, so
 * they are tracked here on purpose — drop an entry once the engine handles it.
 */
const ENGINE_PENDING_ACTIONS = ["work_session.start", "work_session.stop", "issue.set_time"];

describe("rules registry integrity", () => {
  it("has unique trigger and action keys", () => {
    const triggerKeys = RULE_TRIGGERS.map((t) => t.key);
    const actionKeys = RULE_ACTIONS.map((a) => a.key);
    expect(new Set(triggerKeys).size).toBe(triggerKeys.length);
    expect(new Set(actionKeys).size).toBe(actionKeys.length);
  });

  it("references only known categories and ships both locales", () => {
    const triggerCategories = new Set(RULE_TRIGGER_CATEGORIES.map((c) => c.key));
    for (const trigger of RULE_TRIGGERS) {
      expect(triggerCategories.has(trigger.category)).toBe(true);
      expect(trigger.label.th.trim()).not.toBe("");
      expect(trigger.label.en.trim()).not.toBe("");
    }
    for (const action of RULE_ACTIONS) {
      expect(action.label.th.trim()).not.toBe("");
      expect(action.label.en.trim()).not.toBe("");
      expect(action.description.th.trim()).not.toBe("");
      expect(action.description.en.trim()).not.toBe("");
      expect(["supported", "unsupported"]).toContain(action.status);
    }
  });

  it("keeps recommendations pointing at real, compatible actions", () => {
    const actionKeys = new Set(RULE_ACTIONS.map((a) => a.key));
    const triggerKeys = new Set(RULE_TRIGGERS.map((t) => t.key));

    for (const [triggerKey, actionKeysForTrigger] of Object.entries(
      RULE_ACTION_RECOMMENDATIONS,
    )) {
      expect(triggerKeys.has(triggerKey)).toBe(true);
      for (const actionKey of actionKeysForTrigger) {
        expect(actionKeys.has(actionKey)).toBe(true);
        // never recommend a combination the picker hides as invalid
        expect(isActionCompatible(triggerKey, actionKey)).toBe(true);
      }
    }
  });

  it("keeps invalid combinations and template slots resolvable", () => {
    const triggerKeys = new Set(RULE_TRIGGERS.map((t) => t.key));
    const actionKeys = new Set(RULE_ACTIONS.map((a) => a.key));
    for (const combo of INVALID_ACTION_COMBOS) {
      expect(triggerKeys.has(combo.trigger)).toBe(true);
      expect(actionKeys.has(combo.action)).toBe(true);
    }

    for (const trigger of RULE_TRIGGERS) {
      const fields = new Set(trigger.fields.map((f) => f.key));
      for (const template of trigger.templates) {
        for (const slot of template.slots) {
          expect(fields.has(slot.field)).toBe(true);
        }
        expect(template.text.th.trim()).not.toBe("");
        expect(template.text.en.trim()).not.toBe("");
      }
    }
  });

  it("gives every message token a bilingual label", () => {
    for (const trigger of RULE_TRIGGERS) {
      for (const placeholder of getMessageTokens(trigger.key)) {
        expect(placeholder.token.startsWith("{")).toBe(true);
        expect(placeholder.token.endsWith("}")).toBe(true);
        expect(placeholder.label.th.trim()).not.toBe("");
        expect(placeholder.label.en.trim()).not.toBe("");
      }
    }
    // without a trigger the wizard still offers the common tokens
    expect(getMessageTokens(null).length).toBeGreaterThan(0);
  });

  it("offers the common tokens for every trigger", () => {
    const common = getMessageTokens(null).map((p) => p.token);
    for (const trigger of RULE_TRIGGERS) {
      const tokens = getMessageTokens(trigger.key).map((p) => p.token);
      for (const token of common) {
        expect(tokens).toContain(token);
      }
    }
  });

  it("renders every offered token in the engine", () => {
    const offered = new Set<string>();
    for (const trigger of RULE_TRIGGERS) {
      for (const placeholder of getMessageTokens(trigger.key)) offered.add(placeholder.token);
    }
    for (const token of offered) {
      expect(ENGINE_SOURCE).toContain(token);
    }
  });

  it("implements every supported action in the engine", () => {
    const supported = RULE_ACTIONS.filter((a) => a.status === "supported").map((a) => a.key);
    for (const key of supported) {
      if (ENGINE_PENDING_ACTIONS.includes(key)) continue;
      expect(ENGINE_SOURCE).toContain(`case "${key}":`);
    }
    // and the pending ones really are missing from the switch
    for (const key of ENGINE_PENDING_ACTIONS) {
      expect(ENGINE_SOURCE).not.toContain(`case "${key}":`);
    }
  });
});

describe("i18n parity for the automation feature", () => {
  const readMessages = (locale: "th" | "en"): Record<string, unknown> =>
    JSON.parse(
      readFileSync(join(__dirname, `../../../web/src/messages/${locale}.json`), "utf8").replace(
        /^\uFEFF/,
        "",
      ),
    );

  /** Every leaf of a namespace as `path -> value` pairs. */
  const leaves = (
    node: unknown,
    prefix = "",
  ): Array<[string, string]> =>
    Object.entries(node as Record<string, unknown>).flatMap(([key, child]) =>
      child && typeof child === "object" && !Array.isArray(child)
        ? leaves(child, `${prefix}${key}.`)
        : [[`${prefix}${key}`, String(child)]],
    );

  const namespaceLeaves = (locale: "th" | "en", namespace: string): Array<[string, string]> =>
    leaves(readMessages(locale)[namespace] ?? {}, `${namespace}.`);

  // only the namespaces this feature owns — other pages have pre-existing drift
  const NAMESPACES = ["Automation", "Notifications"];

  it.each(NAMESPACES)("%s has identical keys in th and en", (namespace) => {
    const thKeys = namespaceLeaves("th", namespace).map(([key]) => key).sort();
    const enKeys = namespaceLeaves("en", namespace).map(([key]) => key).sort();

    expect(thKeys.length).toBeGreaterThan(0);
    expect(enKeys).toEqual(thKeys);
  });

  it.each(NAMESPACES)("%s has no empty translations", (namespace) => {
    for (const locale of ["th", "en"] as const) {
      for (const [key, value] of namespaceLeaves(locale, namespace)) {
        expect(`${key}=${value.trim()}`).not.toMatch(/=$/);
      }
    }
  });
});
