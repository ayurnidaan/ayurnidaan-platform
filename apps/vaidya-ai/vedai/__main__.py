import argparse
import json
from pathlib import Path
import sys

from .corpus import download, process
from .search import build_index, search
from .verify import verify


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="SARIT Ayurveda ingestion and lexical retrieval")
    parser.add_argument("--data", type=Path, default=Path("data"))
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("download")
    p = commands.add_parser("process")
    p.add_argument("--config", type=Path, default=Path("config/ayurveda.json"))
    p.add_argument("--reports", type=Path, default=Path("reports"))
    commands.add_parser("index")
    commands.add_parser("eval-create")
    commands.add_parser("terms-index")
    commands.add_parser("passages-index")
    p = commands.add_parser("evaluate")
    p.add_argument("--mode", choices=["lexical", "semantic", "hybrid", "expanded"], default="lexical")
    p = commands.add_parser("embed")
    p.add_argument("--model", default="embeddinggemma")
    p.add_argument("--batch-size", type=int, default=32)
    p = commands.add_parser("serve")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--mode", choices=["lexical", "semantic", "hybrid", "expanded"], default="expanded")
    p = commands.add_parser("ask")
    p.add_argument("question")
    p.add_argument("--work")
    p.add_argument("--language", choices=["en", "hi", "sa"], default="en")
    p.add_argument("--retrieval-only", action="store_true")
    p.add_argument("--corpus-only", action="store_true")
    p.add_argument("--no-enhance", action="store_true")
    p.add_argument("--mode", choices=["lexical", "semantic", "hybrid", "expanded"], default="expanded")
    p = commands.add_parser("verify")
    p.add_argument("--reports", type=Path, default=Path("reports"))
    p = commands.add_parser("search")
    p.add_argument("query")
    p.add_argument("--limit", type=int, default=5)
    p.add_argument("--work")
    args = parser.parse_args()
    if args.command == "download":
        root, manifest = download(args.data)
        print(f"Downloaded {manifest['file_count']} files to {root}")
    elif args.command == "process":
        summary = process(args.data, args.config, args.reports)
        print(f"Processed {summary['selected_works']} works, {summary['segments']} segments, {summary['chunks']} chunks")
    elif args.command == "index":
        print(f"Indexed {build_index(args.data)} chunks")
    elif args.command == "eval-create":
        from .evaluation import create_dataset
        print(f"Created {create_dataset(args.data)} draft evaluation cases")
    elif args.command == "terms-index":
        from .terminology import build_terms
        print(f"Indexed {build_terms(args.data)} chunks for vocabulary retrieval")
    elif args.command == "passages-index":
        from .passages import build_passages
        print(f"Indexed {build_passages(args.data)} complete source passages")
    elif args.command == "evaluate":
        from .evaluation import evaluate
        if args.mode == "lexical":
            retrieve = lambda q, k, w: search(args.data, q, k, w)
        else:
            from .retrieval import Retriever
            retrieve = Retriever(args.data, args.mode).search
        print(json.dumps(evaluate(args.data, retrieve, Path(f"reports/eval-{args.mode}.json")), indent=2))
    elif args.command == "embed":
        from .retrieval import build_vectors
        print(json.dumps(build_vectors(args.data, args.model, args.batch_size), indent=2))
    elif args.command == "serve":
        import uvicorn
        from .server import create_app
        uvicorn.run(create_app(args.data, args.mode), host="127.0.0.1", port=args.port, access_log=False)
    elif args.command == "ask":
        from .answers import answer, OpenRouter
        from .retrieval import Retriever
        from .passages import PassageStore
        from .query_planner import enhance_query, retrieve_plan
        provider = OpenRouter()
        plan = enhance_query(args.question, provider, enabled=not args.retrieval_only and not args.no_enhance)
        hits, packet = retrieve_plan(args.question, plan, Retriever(args.data, args.mode), PassageStore(args.data), filters={"work": args.work})
        result = answer(args.question, hits, args.language, provider=provider, generate=not args.retrieval_only, packet=packet, allow_general=not args.corpus_only, query_plan=plan)
        print(json.dumps({**result, "query_plan": plan}, ensure_ascii=False, indent=2))
    elif args.command == "verify":
        print(json.dumps(verify(args.data, args.reports), indent=2))
    else:
        print(json.dumps(search(args.data, args.query, args.limit, args.work), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
