from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """Make Product.category nullable. Does not delete categories or rewrite existing rows."""

    dependencies = [
        ("products", "0003_client_item_code"),
    ]

    operations = [
        migrations.AlterField(
            model_name="product",
            name="category",
            field=models.ForeignKey(
                blank=True,
                help_text="Optional while PRODUCT_CATEGORY_ENABLED is off. When the flag is on, this must be a subcategory.",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="products",
                to="categories.category",
            ),
        ),
    ]
