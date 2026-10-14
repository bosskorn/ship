"""Find user-facing text written directly in UI code (not through i18n `t()`).

    python3 tools/i18n/find_hardcoded.py [src] [--json]

Looks in .tsx/.ts under src (tests excluded) for:
  - JSX text between tags:            <Text>Hello</Text>
  - string literals in text props:     title="Hello"  label={'Hello'}  accessibilityLabel="…"
  - literals passed to toast()/Alert:  toast('Saved')
  - English defaults of text props:    ({ backLabel = 'Back' })
Ignores: i18n keys and calls, numbers/punctuation/symbols only, brand names (OneScan),
units, testIDs, style values, icon names, routes and files under i18n/locales.
Exit code 1 when anything is found (for CI).
"""
import json, os, re, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'src'
AS_JSON = '--json' in sys.argv

TEXT_PROPS = r'(?:title|label|placeholder|accessibilityLabel|accessibilityHint|description|content|note|caption|message|subtitle|actionLabel|cancelLabel|confirmLabel|header|footer|emptyText|helperText|text)'
ALLOWED = {'OneScan', 'PDF', 'OCR', 'HD', 'MAX', 'AI', 'B', 'KB', 'MB', 'GB', 'JPEG', 'ID', 'A4', '%', '·', '—', '…', '/', '×', '+', '-'}
LETTERS = re.compile(r'[A-Za-z฀-๿]')

def is_text(s: str) -> bool:
    s = s.strip()
    if not s or not LETTERS.search(s):
        return False
    if s in ALLOWED:
        return False
    if re.fullmatch(r'[a-z0-9_.\-/\[\]]+', s) and ('.' in s or '/' in s or '_' in s):
        return False  # keys, routes, file names
    if re.fullmatch(r'[a-zA-Z]+', s) and s[0].islower():
        return False  # identifiers / enum values in props
    return True

findings = []
for dirpath, _, files in os.walk(ROOT):
    if '__tests__' in dirpath or os.sep + 'locales' in dirpath:
        continue
    for f in files:
        if not f.endswith(('.tsx', '.ts')) or f.endswith('.d.ts'):
            continue
        path = os.path.join(dirpath, f)
        src = open(path, encoding='utf-8').read()
        lines = src.split('\n')
        def add(kind, m, text):
            line = src.count('\n', 0, m.start()) + 1
            code = lines[line - 1]
            if 'i18n-ignore' in code:
                return
            findings.append({'file': path, 'line': line, 'kind': kind, 'text': text.strip()})
        if f.endswith('.tsx'):
            for m in re.finditer(r'>([^<>{}`]+)<', src):
                # Code between TypeScript generics / comparisons (`useState<X>(null)`, `a > 0 ? <`)
                # looks like a tag pair; real JSX text has no code punctuation.
                if re.search(r'[;=(){}?:]|&&|\|\|', m.group(1)):
                    continue
                if is_text(m.group(1)) and not re.search(r'=>\s*$', src[max(0, m.start() - 3):m.start() + 1]):
                    add('jsx-text', m, m.group(1))
        for m in re.finditer(TEXT_PROPS + r"""\s*=\s*\{?\s*(['"])((?:(?!\1).)+)\1""", src):
            if is_text(m.group(2)):
                add('prop', m, m.group(2))
        # Default values of text props in component signatures: ({ backLabel = 'Back' })
        for m in re.finditer(r"""\b\w*(?:Label|Text|Title|title|label|placeholder|Placeholder|Message|message)\s*=\s*(['"])((?:(?!\1).)+)\1\s*[,}]""", src):
            if is_text(m.group(2)):
                add('default-prop', m, m.group(2))
        for m in re.finditer(r"""\b(?:toast|Alert\.alert)\(\s*(['"`])((?:(?!\1).)+)\1""", src):
            if is_text(m.group(2)):
                add('toast/alert', m, m.group(2))

if AS_JSON:
    print(json.dumps(findings, ensure_ascii=False, indent=1))
else:
    for x in findings:
        print(f"{x['file']}:{x['line']}  [{x['kind']}]  {x['text'][:90]}")
    print(f'\n{len(findings)} hard-coded user-facing strings')
sys.exit(1 if findings else 0)
