from .workflow import build_parser, run_pipeline

def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    outputs = run_pipeline(args)
    for name, path in outputs.items():
        print(f"{name}: {path}")

if __name__ == "__main__":
    main()
