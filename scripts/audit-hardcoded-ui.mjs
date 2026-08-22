import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('../apps/web/node_modules/typescript/lib/typescript.js');
const roots = ['apps/web/src', 'apps/mobile/src'];
const uiAttributes = new Set([
  'alt', 'aria-label', 'aria-description', 'accessibilityLabel', 'accessibilityHint',
  'label', 'placeholder', 'subtitle', 'title', 'tooltip',
]);
const uiObjectProperties = new Set([
  'ariaLabel', 'description', 'helperText', 'label', 'message', 'placeholder', 'subtitle', 'title', 'tooltip',
]);
const uiConfigName = /(?:action|button|choice|field|filter|item|menu|nav|option|section|status|tab)s?$/i;
const ignoredFiles = /(?:\.test|\.spec|\.stories)\.[jt]sx?$|[\\/]i18n[\\/]locales[\\/]|[\\/]__fixtures__[\\/]/;
const latinUi = /[A-Za-z]{2,}/;
const technicalOnly = /^(?:[A-Z0-9_./:@+-]+|https?:\/\/\S+|[a-z]+(?:_[a-z0-9]+)+|[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+|(?:application|audio|font|image|multipart|text|video)\/[\w.+-]+|\.[a-z0-9]{1,10})$/;
const technicalElements = new Set(['code', 'kbd', 'pre', 'samp']);
const findings = [];

function jsxTagName(node) {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText();
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText();
  return null;
}

function isTechnicalJsxText(node) {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    const tagName = jsxTagName(current);
    if (tagName && technicalElements.has(tagName)) return true;
    current = current.parent;
  }
  return false;
}

function filesUnder(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...filesUnder(file));
    else if (/\.[jt]sx$/.test(entry.name) && !ignoredFiles.test(file)) result.push(file);
  }
  return result;
}

function report(file, sourceFile, node, value, kind) {
  const text = value.trim().replace(/\s+/g, ' ');
  if (!latinUi.test(text) || technicalOnly.test(text)) return;
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const sourceLine = sourceFile.text.split(/\r?\n/)[line - 1] ?? '';
  if (sourceLine.includes('i18n-audit-ignore')) return;
  findings.push({ file: file.replaceAll('\\', '/'), line, kind, text });
}

function auditFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxText(node) && !isTechnicalJsxText(node)) report(file, sourceFile, node, node.text, 'JSX text');
    if (ts.isJsxAttribute(node) && node.initializer && uiAttributes.has(node.name.text)) {
      if (ts.isStringLiteral(node.initializer)) report(file, sourceFile, node, node.initializer.text, `attribute ${node.name.text}`);
    }
    if (ts.isPropertyAssignment(node) && isUiConfigProperty(node) && uiObjectProperties.has(node.name.getText(sourceFile).replaceAll(/["']/g, '')) && ts.isStringLiteralLike(node.initializer)) {
      report(file, sourceFile, node, node.initializer.text, `property ${node.name.getText(sourceFile)}`);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const call = node.expression.getText(sourceFile);
      if (call === 'Alert.alert' || call.endsWith('.alert')) {
        for (const argument of node.arguments.slice(0, 2)) if (ts.isStringLiteralLike(argument)) report(file, sourceFile, argument, argument.text, 'alert copy');
      }
    }
    ts.forEachChild(node, visit);
  }

  function isUiConfigProperty(node) {
    let current = node.parent;
    while (current && !ts.isSourceFile(current)) {
      if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) return uiConfigName.test(current.name.text);
      if (ts.isJsxExpression(current)) return true;
      current = current.parent;
    }
    return false;
  }
  visit(sourceFile);
}

for (const root of roots) for (const file of filesUnder(root)) auditFile(file);
findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

if (process.argv.includes('--summary')) {
  const byPlatform = new Map();
  const byFile = new Map();
  for (const finding of findings) {
    const platform = finding.file.includes('/features/admin/')
      ? 'Admin (excluded)'
      : finding.file.startsWith('apps/web/')
        ? 'Web normal-user'
        : 'Mobile normal-user';
    byPlatform.set(platform, (byPlatform.get(platform) ?? 0) + 1);
    byFile.set(finding.file, (byFile.get(finding.file) ?? 0) + 1);
  }
  console.log(`Hardcoded application-owned UI candidates: ${findings.length}`);
  for (const [platform, count] of [...byPlatform].sort((a, b) => b[1] - a[1])) console.log(`${platform}: ${count}`);
  console.log('Top files:');
  for (const [file, count] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 80)) console.log(`${count}\t${file}`);
  process.exit(findings.length ? 1 : 0);
}

if (findings.length) {
  console.error(`Hardcoded application-owned UI candidates: ${findings.length}`);
  for (const item of findings) console.error(`${item.file}:${item.line} [${item.kind}] ${item.text}`);
  process.exitCode = 1;
} else {
  console.log('Hardcoded application-owned UI candidates: 0');
}
