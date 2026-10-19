import re

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from entities.models import Entity

from .models import AuthUser

USERNAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,149}$")
STAFF_CODE_RE = re.compile(r"^[A-Za-z0-9-]{2,20}$")


class StaffSerializer(serializers.ModelSerializer):
    """Admin-managed staff account. Password is write-only and never returned."""

    password = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)
    entity_id = serializers.PrimaryKeyRelatedField(
        source="entity",
        queryset=Entity.objects.all(),
        allow_null=True,
        required=False,
    )
    entity_name = serializers.SerializerMethodField()
    entity_code = serializers.SerializerMethodField()

    class Meta:
        model = AuthUser
        fields = (
            "id",
            "username",
            "display_name",
            "email",
            "operator_code",
            "entity_id",
            "entity_name",
            "entity_code",
            "is_active",
            "login_bypass",
            "password",
            "last_login",
        )
        read_only_fields = ("id", "last_login", "entity_name", "entity_code")

    def get_entity_name(self, obj):
        return obj.entity.entity_name if obj.entity_id else ""

    def get_entity_code(self, obj):
        return obj.entity.short_code if obj.entity_id else ""

    def validate_username(self, value):
        value = (value or "").strip()
        if not USERNAME_RE.match(value):
            raise serializers.ValidationError(
                "Use 3–150 letters, numbers, dots, underscores, or hyphens, starting with a letter or number."
            )
        qs = AuthUser.objects.filter(username__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("That username is already in use.")
        return value

    def validate_operator_code(self, value):
        value = (value or "").strip().upper()
        if value and not STAFF_CODE_RE.match(value):
            raise serializers.ValidationError("Staff code may contain letters, numbers, and hyphens (2–20).")
        if value:
            qs = AuthUser.objects.filter(operator_code__iexact=value)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError("That staff code is already in use.")
        return value

    def validate_email(self, value):
        value = (value or "").strip()
        if not value:
            return ""
        qs = AuthUser.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("That email is already in use.")
        return value

    def validate_entity_id(self, entity):
        if entity is not None and entity.status != Entity.Status.ACTIVE:
            raise serializers.ValidationError("Choose an active branch.")
        return entity

    def validate_password(self, value):
        if value in (None, ""):
            return ""
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def validate(self, attrs):
        if self.instance is None and not attrs.get("password"):
            raise serializers.ValidationError({"password": "Password is required."})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password", "")
        user = AuthUser(
            role=AuthUser.Role.STAFF,
            is_superuser=False,
            is_staff=False,
            phone="",
            can_edit=False,
            can_delete=False,
            **validated_data,
        )
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", "")
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.role = AuthUser.Role.STAFF
        instance.is_superuser = False
        instance.is_staff = False
        instance.phone = ""
        instance.can_edit = False
        instance.can_delete = False
        if password:
            instance.set_password(password)
        instance.save()
        return instance
