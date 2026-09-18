from django.db import IntegrityError, transaction
from rest_framework import serializers

from entities.models import Entity
from masters.serializers import validate_gstin, validate_pan, validate_phone

from .models import Customer, CustomerEntity


class CustomerEntityWriteSerializer(serializers.Serializer):
    entity_id = serializers.IntegerField()
    primary_entity = serializers.BooleanField(default=False)


class CustomerSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    entities = CustomerEntityWriteSerializer(many=True, required=False, write_only=True)

    class Meta:
        model = Customer
        fields = (
            "id",
            "customer_code",
            "customer_name",
            "customer_type",
            "status",
            "created_at",
            "updated_at",
            "created_by",
            "created_by_name",
            "entities",
            "contact_person",
            "phone",
            "mobile",
            "fax",
            "email",
            "website",
            "address_line_1",
            "address_line_2",
            "area",
            "city",
            "state",
            "pincode",
            "country",
            "district",
            "zone",
            "std_code",
            "pan_no",
            "gst_no",
            "vat_tin",
            "cst_tin",
            "licence_no",
            "ecc",
            "division",
            "range",
            "credit_days",
            "credit_limit",
            "opening_balance",
            "interest_rate",
            "lower_rate",
            "salesman_ref",
            "broker_ref",
            "commission_type",
            "bank_name",
            "rtgs_details",
            "tds_percent",
            "tds_form_no",
            "vat_date",
            "vat_date_1",
            "comp_id",
            "visit_day",
            "file_no",
            "mill_code",
            "transport",
            "other_1",
            "other_2",
        )
        read_only_fields = ("id", "created_at", "updated_at", "created_by", "created_by_name")
        extra_kwargs = {
            "customer_code": {"validators": []},
        }

    def get_created_by_name(self, obj):
        if not obj.created_by_id:
            return ""
        return obj.created_by.display_name or obj.created_by.username

    def validate_customer_code(self, value):
        value = (value or "").strip().upper()
        if not value:
            raise serializers.ValidationError("Customer code is required.")
        qs = Customer.objects.filter(customer_code__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"Customer code {value} is already in use.")
        return value

    def validate_customer_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Customer name is required.")
        return value

    def validate_customer_type(self, value):
        value = (value or "").strip()
        if value not in dict(Customer.CustomerType.choices):
            raise serializers.ValidationError(
                "Customer type must be Company, Individual, or Distributor."
            )
        return value

    def validate_gst_no(self, value):
        return validate_gstin(value)

    def validate_pan_no(self, value):
        return validate_pan(value)

    def validate_phone(self, value):
        return validate_phone(value)

    def validate_mobile(self, value):
        return validate_phone(value)

    def validate(self, attrs):
        request = self.context.get("request")
        method = getattr(request, "method", "POST") if request else "POST"
        links = attrs.get("entities")
        incoming = getattr(self, "initial_data", {}) or {}
        must_have_links = self.instance is None or method == "PUT" or "entities" in incoming
        if must_have_links:
            self._validate_entity_links(links or [])
        return attrs

    def _validate_entity_links(self, links):
        if not links:
            raise serializers.ValidationError(
                {"entities": ["Select at least one entity and mark exactly one as primary."]}
            )
        ids = [item["entity_id"] for item in links]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError({"entities": ["Duplicate entities are not allowed."]})
        primaries = [item for item in links if item.get("primary_entity")]
        if len(primaries) != 1:
            raise serializers.ValidationError(
                {"entities": ["Mark exactly one entity as primary."]}
            )
        found = set(Entity.objects.filter(pk__in=ids).values_list("id", flat=True))
        missing = [eid for eid in ids if eid not in found]
        if missing:
            raise serializers.ValidationError(
                {"entities": [f"Unknown entity id(s): {', '.join(str(i) for i in missing)}."]}
            )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        links = list(instance.entity_links.all())
        data["entities"] = [
            {
                "entity_id": link.entity_id,
                "short_code": link.entity.short_code,
                "entity_name": link.entity.entity_name,
                "primary_entity": link.primary_entity,
            }
            for link in links
        ]
        primary = next((link for link in links if link.primary_entity), None)
        data["primary_entity_id"] = primary.entity_id if primary else None
        data["primary_entity_code"] = primary.entity.short_code if primary else ""
        data["primary_entity_name"] = primary.entity.entity_name if primary else ""
        return data

    @staticmethod
    def _replace_links(customer: Customer, links: list[dict]) -> None:
        CustomerEntity.objects.filter(customer=customer).delete()
        CustomerEntity.objects.bulk_create(
            [
                CustomerEntity(
                    customer=customer,
                    entity_id=item["entity_id"],
                    primary_entity=bool(item.get("primary_entity")),
                )
                for item in links
            ]
        )

    def create(self, validated_data):
        links = validated_data.pop("entities", None)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            validated_data["created_by"] = user
        try:
            with transaction.atomic():
                customer = super().create(validated_data)
                self._replace_links(customer, links or [])
        except IntegrityError:
            raise serializers.ValidationError(
                {"customer_code": ["Customer code is already in use. Try a different code."]}
            )
        return customer

    def update(self, instance, validated_data):
        links = validated_data.pop("entities", None)
        try:
            with transaction.atomic():
                instance = super().update(instance, validated_data)
                if links is not None:
                    self._replace_links(instance, links)
        except IntegrityError:
            raise serializers.ValidationError(
                {"customer_code": ["Customer code is already in use. Try a different code."]}
            )
        return instance
