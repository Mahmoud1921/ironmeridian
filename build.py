#!/usr/bin/env python3
"""Bundle the modular source into single-file builds:
   dist/iron-meridian.html  (standalone, open locally)
   dist/artifact.html       (page body for the published Artifact)"""
import re, pathlib
root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text()
css = (root / 'css/style.css').read_text()
scripts = re.findall(r'<script src="(js/[^"]+)"></script>', html)
js = '\n'.join((root / s).read_text() for s in scripts if (root / s).exists())
head = re.search(r'<!--BUILD:HEAD-->(.*)<!--/BUILD:HEAD-->', html, re.S).group(1)
head = head.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '\n</style>')
body = re.search(r'<!--BUILD:BODY-->(.*)<!--/BUILD:BODY-->', html, re.S).group(1)
bundle = head.strip() + '\n' + body.strip() + '\n<script>\n' + js.replace('</script', '<\\/script') + '\n</script>\n'
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist/artifact.html').write_text(bundle)
(root / 'dist/iron-meridian.html').write_text('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    + head.strip() + '\n</head>\n<body>\n' + body.strip() + '\n<script>\n' + js.replace('</script', '<\\/script') + '\n</script>\n</body>\n</html>\n')
print('built', len(bundle) // 1024, 'KB')
