from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from price_lists.ocm_quality_import import build_quality_preview
from brands.models import Brand
from entities.models import Entity


class Command(BaseCommand):
    help = "Preview an OCM quality price-list file without database writes."

    def add_arguments(self, parser):
        parser.add_argument("path")
        parser.add_argument("--brand", required=True)

    def handle(self, *args, **options):
        path = Path(options["path"])
        brand = Brand.objects.filter(brand_code__iexact=options["brand"]).first()
        branch = Entity.objects.filter(brands=brand, status=Entity.Status.ACTIVE).first() if brand else None
        if not path.is_file():
            raise CommandError(f"File not found: {path}")
        if brand is None or branch is None:
            raise CommandError("The brand must exist and be mapped to an active branch.")
        try:
            preview = build_quality_preview(
                path.read_bytes(), file_name=path.name, branch_id=branch.id, brand_id=brand.id,
            )
        except Exception as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(f"Detected profile: {preview['format_id']}")
        self.stdout.write(f"Columns: {preview['detected_columns']}")
        self.stdout.write(f"Rows: {preview['rows_read']} imported={len(preview['entries'])} skipped={preview['skipped_lines']}")
        self.stdout.write(
            "Flags: "
            f"errors={sum(item['count'] for item in preview['error_summary'])} "
            f"warnings={sum(item['count'] for item in preview['warning_summary'])} "
            f"info={sum(item['count'] for item in preview['info_summary'])}"
        )
        for item in preview["warnings"]:
            self.stdout.write(f"{item['code']}: {item['message']}")
