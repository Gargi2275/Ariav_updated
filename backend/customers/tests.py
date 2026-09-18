from rest_framework.test import APIClient

from django.test import TestCase

from accounts.models import AuthUser
from customers.models import Customer, CustomerEntity
from entities.models import Entity


class CustomerMasterApiTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="cust-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.operator = AuthUser.objects.create_user(
            username="cust-op",
            password="pass12345",
            role=AuthUser.Role.OPERATOR,
        )
        self.guj = Entity.objects.create(
            short_code="GUJ",
            entity_name="Gujarat",
            entity_type=Entity.EntityType.BRANCH,
            status=Entity.Status.ACTIVE,
        )
        self.adt = Entity.objects.create(
            short_code="ADT",
            entity_name="Aditi",
            entity_type=Entity.EntityType.BRANCH,
            status=Entity.Status.ACTIVE,
        )
        self.srv = Entity.objects.create(
            short_code="SRV",
            entity_name="Shriva",
            entity_type=Entity.EntityType.BRANCH,
            status=Entity.Status.ACTIVE,
        )
        self.client = APIClient()

    def _auth(self, user):
        self.client.force_authenticate(user)

    def _payload(self, **kwargs):
        payload = {
            "customer_code": "CUST-01",
            "customer_name": "Sample Trading",
            "customer_type": "Company",
            "status": "Active",
            "entities": [
                {"entity_id": self.guj.id, "primary_entity": True},
            ],
        }
        payload.update(kwargs)
        return payload

    def _create(self, **kwargs):
        return self.client.post(
            "/api/customers/",
            self._payload(**kwargs),
            format="json",
            HTTP_HOST="localhost",
        )

    def test_unauthenticated_list_denied(self):
        res = self.client.get("/api/customers/", HTTP_HOST="localhost")
        self.assertIn(res.status_code, (401, 403))

    def test_operator_can_read_not_write(self):
        self._auth(self.operator)
        res = self.client.get("/api/customers/", HTTP_HOST="localhost")
        self.assertEqual(res.status_code, 200)
        res = self._create()
        self.assertEqual(res.status_code, 403)

    def test_admin_create_requires_entities_and_one_primary(self):
        self._auth(self.admin)
        missing = self._create(entities=[])
        self.assertEqual(missing.status_code, 400, missing.content)
        self.assertTrue(missing.json().get("entities"))

        none_primary = self._create(
            entities=[
                {"entity_id": self.guj.id, "primary_entity": False},
            ]
        )
        self.assertEqual(none_primary.status_code, 400, none_primary.content)

        two_primary = self._create(
            entities=[
                {"entity_id": self.guj.id, "primary_entity": True},
                {"entity_id": self.adt.id, "primary_entity": True},
            ]
        )
        self.assertEqual(two_primary.status_code, 400, two_primary.content)
        self.assertEqual(Customer.objects.count(), 0)

    def test_admin_create_list_search_entity_filter_and_soft_delete(self):
        self._auth(self.admin)
        res = self._create(
            entities=[
                {"entity_id": self.guj.id, "primary_entity": True},
                {"entity_id": self.adt.id, "primary_entity": False},
            ]
        )
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(body["customer_code"], "CUST-01")
        self.assertEqual(body["primary_entity_code"], "GUJ")
        self.assertEqual(len(body["entities"]), 2)
        customer_id = body["id"]

        listed = self.client.get("/api/customers/", HTTP_HOST="localhost")
        self.assertEqual(len(listed.json()), 1)

        search = self.client.get("/api/customers/", {"search": "sample"}, HTTP_HOST="localhost")
        self.assertEqual(len(search.json()), 1)

        by_secondary = self.client.get(
            "/api/customers/",
            {"entity_id": self.adt.id},
            HTTP_HOST="localhost",
        )
        self.assertEqual(len(by_secondary.json()), 1)

        by_unrelated = self.client.get(
            "/api/customers/",
            {"entity_id": self.srv.id},
            HTTP_HOST="localhost",
        )
        self.assertEqual(by_unrelated.json(), [])

        retrieve = self.client.get(f"/api/customers/{customer_id}/", HTTP_HOST="localhost")
        self.assertEqual(retrieve.status_code, 200)
        flags = {e["entity_id"]: e["primary_entity"] for e in retrieve.json()["entities"]}
        self.assertTrue(flags[self.guj.id])
        self.assertFalse(flags[self.adt.id])

        deleted = self.client.delete(f"/api/customers/{customer_id}/", HTTP_HOST="localhost")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.json()["status"], "Inactive")
        self.assertTrue(Customer.objects.filter(pk=customer_id).exists())

        still = self.client.get("/api/customers/", {"status": "Inactive"}, HTTP_HOST="localhost")
        self.assertEqual(len(still.json()), 1)

    def test_blank_code_rejected(self):
        self._auth(self.admin)
        res = self._create(customer_code="   ")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Customer.objects.count(), 0)

    def test_duplicate_code_three_times_creates_zero_extra_rows(self):
        self._auth(self.admin)
        first = self._create(customer_code="XYZ", customer_name="Original")
        self.assertEqual(first.status_code, 201, first.content)
        before = Customer.objects.count()
        for _ in range(3):
            res = self._create(customer_code="XYZ", customer_name="Clone")
            self.assertEqual(res.status_code, 400, res.content)
            body = res.json()
            self.assertTrue(body.get("customer_code"), body)
            self.assertIn("already in use", " ".join(body["customer_code"]).lower())
        self.assertEqual(Customer.objects.count(), before)
        self.assertEqual(Customer.objects.filter(customer_name="Clone").count(), 0)
        self.assertEqual(Customer.objects.filter(customer_code="XYZ").count(), 1)

    def test_permanent_delete_rejected_on_active(self):
        self._auth(self.admin)
        cid = self._create().json()["id"]
        res = self.client.delete(
            f"/api/customers/{cid}/?permanent=true",
            HTTP_HOST="localhost",
        )
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn("inactive", res.json()["detail"].lower())
        self.assertTrue(Customer.objects.filter(pk=cid, status="Active").exists())

    def test_permanent_delete_after_deactivate_removes_row(self):
        self._auth(self.admin)
        cid = self._create().json()["id"]
        soft = self.client.delete(f"/api/customers/{cid}/", HTTP_HOST="localhost")
        self.assertEqual(soft.status_code, 200)
        hard = self.client.delete(
            f"/api/customers/{cid}/?permanent=true",
            HTTP_HOST="localhost",
        )
        self.assertEqual(hard.status_code, 204, hard.content)
        self.assertFalse(Customer.objects.filter(pk=cid).exists())
        self.assertFalse(CustomerEntity.objects.filter(customer_id=cid).exists())

    def test_operator_cannot_permanent_delete(self):
        self._auth(self.admin)
        cid = self._create().json()["id"]
        self.client.delete(f"/api/customers/{cid}/", HTTP_HOST="localhost")
        self._auth(self.operator)
        res = self.client.delete(
            f"/api/customers/{cid}/?permanent=true",
            HTTP_HOST="localhost",
        )
        self.assertEqual(res.status_code, 403)
        self.assertTrue(Customer.objects.filter(pk=cid).exists())

    def test_reactivate_via_patch(self):
        self._auth(self.admin)
        cid = self._create().json()["id"]
        self.client.delete(f"/api/customers/{cid}/", HTTP_HOST="localhost")
        res = self.client.patch(
            f"/api/customers/{cid}/",
            {"status": "Active"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["status"], "Active")
        self.assertEqual(len(res.json()["entities"]), 1)
