"""Build a credential-free release with the pinned corpus and local indexes."""
import hashlib
import argparse
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'data/runtime/vedai-release.tar.gz'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--code-only', action='store_true', help='Reuse the already deployed corpus and indexes')
    args = parser.parse_args()
    output = ROOT / 'data/runtime/vedai-code.tar.gz' if args.code_only else OUTPUT
    paths = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT).decode().split('\0')
    selected = {Path(p) for p in paths if p and not p.startswith('data/')}
    if not args.code_only:
        for folder in ['index', 'processed/headers']:
            selected.update(p.relative_to(ROOT) for p in (ROOT / 'data' / folder).iterdir() if p.is_file())
        selected.update(Path('data') / p for p in ['processed/works.json', 'processed/chunks.jsonl', 'processed/segments.jsonl', 'source_manifest.json'])
        archives = list((ROOT / 'data/raw').glob('SARIT-corpus-????????????????????????????????????????.zip'))
        if len(archives) != 1:
            raise ValueError('Expected one pinned full-corpus archive')
        selected.add(archives[0].relative_to(ROOT))
    if any(p.name == '.env' or not (ROOT / p).is_file() for p in selected):
        raise ValueError('Unexpected file in release')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(output, 'w:gz', compresslevel=3) as archive:
        for path in sorted(selected):
            archive.add(ROOT / path, arcname=path.as_posix(), recursive=False)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    (output.parent / ('code-manifest.json' if args.code_only else 'release-manifest.json')).write_text(json.dumps({'sha256': digest, 'bytes': output.stat().st_size,
        'files': [p.as_posix() for p in sorted(selected)]}, indent=2) + '\n', encoding='utf-8')
    print(f'Release: {output.stat().st_size / 1024**2:.1f} MiB, {len(selected)} files, SHA256 {digest}')


if __name__ == '__main__':
    main()
