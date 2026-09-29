// Escaping for comment bodies stored inside the HTML comment block (SPEC.md §5.3). Order matters:
// & < > " first, then "-" only when directly preceded by another "-" (so "--" can never occur,
// which would otherwise prematurely close the surrounding `<!-- ... -->`), then newlines.
export function escapeCommentBody(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    switch (ch) {
      case "&":
        out += "&amp;";
        break;
      case "<":
        out += "&lt;";
        break;
      case ">":
        out += "&gt;";
        break;
      case '"':
        out += "&quot;";
        break;
      case "\n":
        out += "&#10;";
        break;
      case "\r":
        out += "&#13;";
        break;
      case "-":
        out += input[i - 1] === "-" ? "&#45;" : "-";
        break;
      default:
        out += ch;
    }
  }
  return out;
}

// Reverse order of escaping, so a literal "&lt;" produced by escaping a literal "&" followed by
// "lt;" doesn't get double-unescaped into "<".
export function unescapeCommentBody(input: string): string {
  return input
    .replace(/&#13;/g, "\r")
    .replace(/&#10;/g, "\n")
    .replace(/&#45;/g, "-")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}
