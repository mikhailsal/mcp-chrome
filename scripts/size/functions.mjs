/**
 * Measure function lengths in TS/JS/Vue sources with the TypeScript parser.
 *
 * Each function gets a stable name: its own name (or the variable, property or
 * call it is passed to), qualified by the enclosing named functions and
 * classes. Repeated names in one file get a #2, #3 suffix in source order.
 */
import ts from 'typescript';

const FUNCTION_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
]);

function scriptKindFor(file) {
  if (/\.tsx$/.test(file)) return ts.ScriptKind.TSX;
  if (/\.(jsx)$/.test(file)) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** Return [{ code, lineOffset }] for every <script> block of a Vue SFC. */
function vueScriptBlocks(text) {
  const blocks = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const contentStart = match.index + match[0].indexOf('>') + 1;
    const lineOffset = text.slice(0, contentStart).split('\n').length - 1;
    blocks.push({ code: match[1], lineOffset });
  }
  return blocks;
}

function propertyNameText(name) {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return '[computed]';
}

function calleeText(call) {
  const expr = call.expression;
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return 'call';
}

/** Name of a function-like node, derived from where it is declared. */
function ownName(node) {
  if (node.kind === ts.SyntaxKind.Constructor) return 'constructor';
  const declared = propertyNameText(node.name);
  if (declared) return declared;
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent)) return propertyNameText(parent.name);
  if (parent && (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent))) {
    return propertyNameText(parent.name);
  }
  if (parent && ts.isCallExpression(parent)) return `${calleeText(parent)}(callback)`;
  if (parent && ts.isExportAssignment(parent)) return 'default';
  return '<anonymous>';
}

function containerName(node) {
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
    return propertyNameText(node.name) ?? '<class>';
  }
  return undefined;
}

function walkBlock(sourceFile, lineOffset, results) {
  const visit = (node, scope) => {
    let nextScope = scope;
    if (FUNCTION_KINDS.has(node.kind)) {
      const name = [...scope, ownName(node)].join('.');
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
      const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
      results.push({ name, line: start + lineOffset + 1, lines: end - start + 1 });
      nextScope = [...scope, ownName(node)];
    } else {
      const container = containerName(node);
      if (container) nextScope = [...scope, container];
    }
    ts.forEachChild(node, (child) => visit(child, nextScope));
  };
  visit(sourceFile, []);
}

/** Measure every function in a file. Returns [{ name, line, lines }]. */
export function measureFunctions(file, text) {
  const blocks = file.endsWith('.vue') ? vueScriptBlocks(text) : [{ code: text, lineOffset: 0 }];
  const results = [];
  for (const block of blocks) {
    const kind = file.endsWith('.vue') ? ts.ScriptKind.TS : scriptKindFor(file);
    const sourceFile = ts.createSourceFile(file, block.code, ts.ScriptTarget.Latest, true, kind);
    walkBlock(sourceFile, block.lineOffset, results);
  }
  const seen = new Map();
  return results.map((fn) => {
    const count = (seen.get(fn.name) ?? 0) + 1;
    seen.set(fn.name, count);
    return count === 1 ? fn : { ...fn, name: `${fn.name}#${count}` };
  });
}
