"""
checker.py
Runs the deterministic, text-stage checks from APM_rules.json against a draft.

Implements the check kinds that operate on prose:
  - term_map            (the SEM-A6 terminology table)
  - forbidden_pattern   (regex: 'etc.', contractions, mixed name forms, ...)
  - context_requirement (the 'should' exception-clause heuristic)

Skipped here (they need the HTML/structured output, not prose):
  - style_constant, html_structure   -> run these in an HTML-stage checker
  - consolidated                      -> literal check lives under another rule
"""

import re
from typing import List, Dict

# words that signal a stated exception, for the "should" check
EXCEPTION_HINTS = re.compile(
    r"\b(unless|except|does not have to|do not have to|need not|"
    r"not required|may be (omitted|disregarded|deviated)|if .*? does not)\b",
    re.IGNORECASE,
)


def _snippet(text: str, start: int, end: int, pad: int = 30) -> str:
    a = max(0, start - pad)
    b = min(len(text), end + pad)
    return text[a:b].replace("\n", " ").strip()


def _term_map(text: str, rule: Dict, chk: Dict) -> List[Dict]:
    out = []
    for term in chk["terms"]:
        correct = term["correct"]
        cs = term.get("case_sensitive", False)
        flags = 0 if cs else re.IGNORECASE
        for forbidden in term["forbidden"]:
            pattern = r"\b" + re.escape(forbidden) + r"\b"
            for m in re.finditer(pattern, text, flags):
                # skip if this match is actually the start of the correct phrase
                window = text[m.start():m.start() + len(correct)]
                if (window == correct) or (not cs and window.lower() == correct.lower()):
                    continue
                out.append({
                    "id": rule["id"],
                    "severity": rule["severity"],
                    "term": forbidden,
                    "suggestion": correct,
                    "message": f"Use '{correct}' instead of '{forbidden}'.",
                    "span": [m.start(), m.end()],
                    "context": _snippet(text, m.start(), m.end()),
                    "automatable": term.get("automatable", "full"),
                })
    return out


def _forbidden_pattern(text: str, rule: Dict, chk: Dict) -> List[Dict]:
    out = []
    for m in re.finditer(chk["pattern"], text):
        out.append({
            "id": rule["id"],
            "severity": rule["severity"],
            "match": m.group(0),
            "suggestion": chk.get("suggestion", ""),
            "message": chk.get("message", rule["statement"]),
            "span": [m.start(), m.end()],
            "context": _snippet(text, m.start(), m.end()),
            "automatable": chk.get("automatable", "full"),
        })
    return out


def _context_requirement(text: str, rule: Dict, chk: Dict) -> List[Dict]:
    out = []
    for m in re.finditer(chk["trigger"], text):
        # look at the sentence around the trigger for an exception clause
        a = text.rfind(".", 0, m.start()) + 1
        b = text.find(".", m.end())
        b = b if b != -1 else len(text)
        sentence = text[a:b]
        if not EXCEPTION_HINTS.search(sentence):
            out.append({
                "id": rule["id"],
                "severity": "warning",
                "match": m.group(0),
                "message": chk["requires"],
                "span": [m.start(), m.end()],
                "context": _snippet(text, m.start(), m.end(), pad=60),
                "automatable": "review",
            })
    return out


DISPATCH = {
    "term_map": _term_map,
    "forbidden_pattern": _forbidden_pattern,
    "context_requirement": _context_requirement,
}


def run_checks(text: str, rules: List[Dict]) -> List[Dict]:
    violations: List[Dict] = []
    for rule in rules:
        chk = rule.get("check")
        if not chk:
            continue
        fn = DISPATCH.get(chk["kind"])
        if fn:
            violations.extend(fn(text, rule, chk))
    return violations


def format_violations(violations: List[Dict]) -> str:
    """A compact, model-readable list to feed back into the revise step."""
    if not violations:
        return ""
    lines = []
    for v in violations:
        msg = v.get("message", "")
        ctx = v.get("context", "")
        lines.append(f"- [{v['id']}] {msg}  (near: \"{ctx}\")")
    return "\n".join(lines)


if __name__ == "__main__":
    import json
    rules = json.loads(open("APM_rules.json", encoding="utf-8").read())["rules"]
    sample = (
        "We have to differentiate between two cases. Helvetic uses a check list, "
        "and the crew shouldn't rely on the Sharepoint, etc. "
        "The aircrafts should be parked according to the plan."
    )
    vs = run_checks(sample, rules)
    print(f"{len(vs)} violations found:\n")
    print(format_violations(vs))
