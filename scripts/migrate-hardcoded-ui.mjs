import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('../apps/web/node_modules/typescript/lib/typescript.js');
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const platform = valueAfter('--platform');
const feature = valueAfter('--feature')?.toLowerCase();
const roots = platform === 'web' ? ['apps/web/src'] : platform === 'mobile' ? ['apps/mobile/src'] : ['apps/web/src', 'apps/mobile/src'];
const uiAttributes = new Set(['alt', 'aria-label', 'aria-description', 'accessibilityLabel', 'accessibilityHint', 'label', 'placeholder', 'subtitle', 'title', 'tooltip']);
const ignored = /(?:\.test|\.spec|\.stories)\.[jt]sx?$|[\\/]i18n[\\/]locales[\\/]|[\\/]features[\\/]admin[\\/]/;
const technical = /^(?:[A-Z0-9_./:@+-]+|https?:\/\/\S+|[a-z]+(?:_[a-z0-9]+)+|[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+|(?:application|audio|font|image|multipart|text|video)\/[\w.+-]+|\.[a-z0-9]{1,10})$/;
const common = new Map([
  ['Cancel', 'common.cancel'], ['Close', 'common.close'], ['Delete', 'common.delete'], ['Retry', 'common.retry'], ['Back', 'common.back'], ['Save', 'common.save'], ['Search', 'common.search'], ['Loading', 'common.loading'], ['Start', 'common.start'], ['Continue', 'common.continue'], ['Edit', 'common.edit'], ['Remove', 'common.remove'], ['Ready', 'sharedFocus.ready'], ['Preparing', 'sharedFocus.preparing'], ['Owner', 'sharedFocus.owner'], ['You', 'sharedFocus.you'], ['Participant', 'sharedFocus.participant'], ['Participants', 'sharedFocus.participants'], ['Pending', 'taskLabels.status.pending'], ['In Progress', 'taskLabels.status.inProgress'], ['Completed', 'taskLabels.status.completed'], ['Join with code', 'sharedFocus.joinWithCode'], ['Create Session', 'sharedFocus.createSession'], ['Start Session', 'sharedFocus.startSession'], ['Pause', 'focusUi.pause'], ['Resume', 'focusUi.resume'], ['Finish', 'focusUi.finish'], ['Add Time', 'focusUi.addTime'], ['Exit Focus', 'focusUi.exitFocus'], ['White Noise', 'focusUi.whiteNoise'], ['Ambient Sounds', 'focusUi.ambientSounds'], ['Focus sounds', 'focusUi.focusSounds'], ['Volume', 'focusUi.volume'], ['Stop', 'focusUi.stop'], ['Play', 'focusUi.play'], ['Mute', 'focusUi.mute'], ['Unmute', 'focusUi.unmute'],
]);
const records = [], manual = [], changed = [];
const hookInjection = { safe: [], unsafe: [], collisions: [] };
const generated = [];
const generatedArabic = new Map([['Open', 'فتح'], ['View', 'عرض'], ['Add', 'إضافة'], ['Remove', 'إزالة'], ['Next', 'التالي'], ['Previous', 'السابق'], ['Continue', 'متابعة'], ['Confirm', 'تأكيد'], ['Details', 'التفاصيل'], ['Settings', 'الإعدادات']]);

function valueAfter(flag) { const list = process.argv; const at = list.indexOf(flag); return at >= 0 ? list[at + 1] : undefined; }
function filesUnder(dir) { const out = []; for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) out.push(...filesUnder(file)); else if (/\.[jt]sx$/.test(entry.name) && !ignored.test(file)) out.push(file); } return out; }
function fileMatches(file) { return !feature || file.toLowerCase().includes(feature); }
function hasTranslationBinding(source) { return /const\s+\{[^}]*\bt\b[^}]*\}\s*=\s*useLanguage\s*\(/.test(source); }
function textOf(node) { return node.text.trim().replace(/\s+/g, ' '); }
function safeLiteral(text) { return text && /[A-Za-z]{2,}/.test(text) && !technical.test(text) && !/[{}$]|\n/.test(text); }
function staticBranch(node) { return ts.isStringLiteral(node) && safeLiteral(node.text) && keyFor(node.text, currentFile); }
let currentFile = '';
function countTemplate(node) { if (!ts.isTemplateExpression(node) || node.templateSpans.length !== 1 || node.head.text) return null; const span = node.templateSpans[0]; if (!ts.isIdentifier(span.expression)) return null; const noun = span.literal.text.trim(); const keys = new Map([['participants', 'sharedFocus.participants'], ['tasks', 'taskLabels.tasks'], ['sessions', 'focusHome.sessionsToday'], ['minutes', 'focusUi.minutes']]); return keys.get(noun) ? { variable: span.expression.text, key: keys.get(noun) } : null; }
function isComponentLocal(node) { let current = node.parent; while (current && !ts.isSourceFile(current)) { if (ts.isFunctionLike(current)) return Boolean(current.body && /<\s*[A-ZA-Za-z]/.test(current.body.getText())); current = current.parent; } return false; }
function topLevelComponent(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && /^[A-Z]/.test(statement.name.text) && statement.body && /<\s*[A-ZA-Za-z]/.test(statement.body.getText(sourceFile))) return { name: statement.name.text, body: statement.body };
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name) && /^[A-Z]/.test(declaration.name.text) && declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) && ts.isBlock(declaration.initializer.body) && /<\s*[A-ZA-Za-z]/.test(declaration.initializer.body.getText(sourceFile))) return { name: declaration.name.text, body: declaration.initializer.body };
  }
  return null;
}
function languageImportPath(file) { const sourceRoot = file.startsWith('apps/mobile') ? 'apps/mobile/src' : 'apps/web/src'; const target = path.join(sourceRoot, 'i18n', 'LanguageContext'); let relative = path.relative(path.dirname(file), target).replaceAll('\\', '/'); if (!relative.startsWith('.')) relative = `./${relative}`; return relative; }
function keyFor(text, file) {
  if (common.has(text)) return common.get(text);
  const arabic = generatedArabic.get(text);
  if (!arabic) return null;
  const platformName = file.startsWith('apps/mobile') ? 'mobile' : 'web';
  const featureName = path.basename(file, path.extname(file)).replace(/(?:Screen|Modal|Sheet)$/,'').replace(/[^A-Za-z0-9]/g, '').replace(/^./, c => c.toLowerCase());
  const key = `autoMigration.${platformName}.${featureName}.${text.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  return key;
}
function reportManual(file, sourceFile, node, kind, text, risk = 'manual_translation_required') { const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1; manual.push({ file: file.replaceAll('\\', '/'), line, kind, expression: text, risk, suggestedKey: `${path.basename(file, path.extname(file)).replace(/Screen$|Modal$|Sheet$/,'').replace(/[^A-Za-z0-9]/g, '').replace(/^./, c => c.toLowerCase())}.reviewRequired`, variables: [] }); }
function translationExpression(key) { return ts.factory.createJsxExpression(undefined, ts.factory.createCallExpression(ts.factory.createIdentifier('t'), undefined, [ts.factory.createStringLiteral(key)])); }

function transformFile(file) {
  currentFile = file;
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let canTranslate = hasTranslationBinding(source);
  let injectedBody = null;
  const canUseT = node => canTranslate && (!injectedBody || (node.getStart(sourceFile) >= injectedBody.pos && node.end <= injectedBody.end));
  const edits = [];
  if (!canTranslate && [...common.keys(), ...generatedArabic.keys()].some(text => source.includes(`>${text}<`) || source.includes(`\"${text}\"`) || source.includes(`'${text}'`))) {
    const component = topLevelComponent(sourceFile);
    if (!component) hookInjection.unsafe.push({ file, reason: 'unsupported_component_structure' });
    else if (/\b(?:const|let|var|function)\s+t\b/.test(component.body.getText(sourceFile))) hookInjection.collisions.push({ file, component: component.name });
    else {
      const imports = sourceFile.statements.filter(ts.isImportDeclaration);
      const lastImport = imports.at(-1);
      if (!lastImport) hookInjection.unsafe.push({ file, reason: 'missing_import_anchor' });
      else { canTranslate = true; injectedBody = component.body; hookInjection.safe.push({ file, component: component.name }); if (!/import\s+\{[^}]*\buseLanguage\b[^}]*\}\s+from/.test(source)) edits.push({ start: lastImport.end, end: lastImport.end, replacement: `\nimport { useLanguage } from '${languageImportPath(file)}';` }); edits.push({ start: component.body.getStart(sourceFile) + 1, end: component.body.getStart(sourceFile) + 1, replacement: `\n  const { t } = useLanguage();` }); }
    }
  }
  const transformer = context => root => {
    const visit = node => {
      if (ts.isJsxText(node)) { const text = textOf(node); const key = keyFor(text, file); if (safeLiteral(text) && key && canUseT(node)) { records.push({ file, kind: 'jsx', text, key }); if (key.startsWith('autoMigration.') && !generated.some(item => item.key === key)) generated.push({ key, english: text, arabic: generatedArabic.get(text) }); edits.push({ start: node.getStart(sourceFile), end: node.end, replacement: `{t('${key}')}` }); } if (safeLiteral(text) && !key) reportManual(file, sourceFile, node, 'jsx', text); }
      if (ts.isJsxAttribute(node) && node.initializer && uiAttributes.has(node.name.text) && ts.isStringLiteral(node.initializer)) { const text = node.initializer.text; const key = keyFor(text, file); if (safeLiteral(text) && key && canUseT(node)) { records.push({ file, kind: `attribute ${node.name.text}`, text, key }); if (key.startsWith('autoMigration.') && !generated.some(item => item.key === key)) generated.push({ key, english: text, arabic: generatedArabic.get(text) }); edits.push({ start: node.initializer.getStart(sourceFile), end: node.initializer.end, replacement: `{t('${key}')}` }); } if (safeLiteral(text) && !key) reportManual(file, sourceFile, node, `attribute ${node.name.text}`, text); }
      if (ts.isConditionalExpression(node) && ts.isStringLiteral(node.whenTrue) && ts.isStringLiteral(node.whenFalse)) { const trueKey = keyFor(node.whenTrue.text, file), falseKey = keyFor(node.whenFalse.text, file); if (canUseT(node) && isComponentLocal(node) && trueKey && falseKey) { records.push({ file, kind: 'ternary', text: node.getText(sourceFile), key: `${trueKey}, ${falseKey}` }); edits.push({ start: node.whenTrue.getStart(sourceFile), end: node.whenTrue.end, replacement: `t('${trueKey}')` }, { start: node.whenFalse.getStart(sourceFile), end: node.whenFalse.end, replacement: `t('${falseKey}')` }); } else reportManual(file, sourceFile, node, 'ternary', node.getText(sourceFile), isComponentLocal(node) ? 'dynamic_simple' : 'needs_hook_injection'); }
      if (ts.isTemplateExpression(node)) { const counted = countTemplate(node); if (canUseT(node) && isComponentLocal(node) && counted) { records.push({ file, kind: 'template', text: node.getText(sourceFile), key: counted.key }); edits.push({ start: node.getStart(sourceFile), end: node.end, replacement: `t('${counted.key}', { count: ${counted.variable} })` }); } else reportManual(file, sourceFile, node, 'template', node.getText(sourceFile), counted ? 'needs_hook_injection' : 'dynamic_complex'); }
      if (ts.isPropertyAssignment(node) && ['label', 'title', 'description', 'helperText', 'placeholder', 'accessibilityLabel'].includes(node.name.getText(sourceFile).replaceAll(/["']/g, '')) && ts.isStringLiteral(node.initializer)) { const key = keyFor(node.initializer.text, file); if (canTranslate && isComponentLocal(node) && key) { records.push({ file, kind: 'ui config', text: node.initializer.text, key }); edits.push({ start: node.initializer.getStart(sourceFile), end: node.initializer.end, replacement: `t('${key}')` }); } else if (safeLiteral(node.initializer.text)) reportManual(file, sourceFile, node, 'ui config', node.initializer.text, isComponentLocal(node) ? 'ambiguous_copy' : 'module_scope_options'); }
      return ts.visitEachChild(node, visit, context);
    };
    return ts.visitNode(root, visit);
  };
  ts.transform(sourceFile, [transformer]);
  if (apply && edits.length) { let output = source; for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end); fs.writeFileSync(file, output, 'utf8'); changed.push(file); }
}

for (const root of roots) for (const file of filesUnder(root)) if (fileMatches(file)) transformFile(file);
if (apply && generated.length) for (const [locale, valueField] of [['apps/web/src/i18n/locales/en.json', 'english'], ['apps/web/src/i18n/locales/ar.json', 'arabic'], ['apps/mobile/src/i18n/locales/en.json', 'english'], ['apps/mobile/src/i18n/locales/ar.json', 'arabic']]) { const localeData = JSON.parse(fs.readFileSync(locale, 'utf8')); for (const item of generated) { const targetPlatform = item.key.split('.')[1]; if ((locale.includes('/mobile/') ? 'mobile' : 'web') !== targetPlatform) continue; let branch = localeData; const parts = item.key.split('.'); for (const part of parts.slice(0, -1)) branch = branch[part] ??= {}; branch[parts.at(-1)] = item[valueField]; } fs.writeFileSync(locale, JSON.stringify(localeData, null, 2) + '\n', 'utf8'); }
const report = ['# i18n manual migration review', '', `Mode: ${apply ? 'apply' : 'dry-run'}`, '', `Safe auto-migrations: ${records.length}`, `Manual review candidates: ${manual.length}`, '', '## Manual review queue', '', '| Platform | File | Line | Risk | Expression | Suggested key | Variables |', '| --- | --- | ---: | --- | --- | --- | --- |', ...manual.map(item => `| ${item.file.startsWith('apps/mobile') ? 'Mobile' : 'Web'} | ${item.file} | ${item.line} | ${item.risk} | \`${item.expression.replaceAll('|', '\\|')}\` | \`${item.suggestedKey}\` | ${item.variables.join(', ')} |`)];
fs.writeFileSync('docs/i18n-manual-review.md', report.join('\n') + '\n', 'utf8');
console.log(`i18n migration ${apply ? 'applied' : 'dry-run'}: ${records.length} safe replacements, ${manual.length} manual-review candidates.`);
console.log(`Files ${apply ? 'changed' : 'that would change'}: ${[...new Set(records.map(x => x.file))].length}`);
console.log(`Generated locale keys: ${generated.length}; reused locale keys: ${records.length - generated.length}`);
console.log(`Hook injection: ${hookInjection.safe.length} safe component(s), ${hookInjection.unsafe.length} unsafe, ${hookInjection.collisions.length} name collision(s).`);
console.log(`Manual review report: docs/i18n-manual-review.md`);
if (apply && changed.length) console.log(changed.map(file => `  ${file}`).join('\n'));
