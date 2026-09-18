from rest_framework.test import APIClient

from django.test import TestCase

from accounts.models import AuthUser
from categories.models import Category


class CategoryMasterApiTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="cat-admin",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _post(self, **kwargs):
        payload = {
            "category_code": "YARN",
            "category_name": "Yarn",
            "status": "Active",
            "parent_category_id": None,
        }
        payload.update(kwargs)
        return self.client.post("/api/categories/", payload, format="json", HTTP_HOST="localhost")

    def test_two_level_tree_and_reject_third_level(self):
        root = self._post()
        self.assertEqual(root.status_code, 201, root.content)
        root_id = root.json()["id"]
        sub = self._post(category_code="CTN", category_name="Cotton", parent_category_id=root_id)
        self.assertEqual(sub.status_code, 201, sub.content)
        third = self._post(
            category_code="CTN-F",
            category_name="Cotton Fine",
            parent_category_id=sub.json()["id"],
        )
        self.assertEqual(third.status_code, 400)

        demote = self.client.put(
            f"/api/categories/{root_id}/",
            {
                "category_code": "YARN",
                "category_name": "Yarn",
                "status": "Active",
                "parent_category_id": sub.json()["id"],
            },
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(demote.status_code, 400)

        tree = self.client.get("/api/categories/", {"tree": 1}, HTTP_HOST="localhost")
        self.assertEqual(tree.status_code, 200)
        self.assertEqual(len(tree.json()), 1)
        self.assertEqual(tree.json()[0]["children"][0]["category_code"], "CTN")

    def test_inactive_child_keeps_parent_as_context(self):
        root_id = self._post().json()["id"]
        sub_id = self._post(
            category_code="CTN",
            category_name="Cotton",
            parent_category_id=root_id,
        ).json()["id"]
        self.client.patch(
            f"/api/categories/{sub_id}/",
            {"status": "Inactive"},
            format="json",
            HTTP_HOST="localhost",
        )
        tree = self.client.get(
            "/api/categories/",
            {"tree": 1, "status": "Inactive"},
            HTTP_HOST="localhost",
        )
        self.assertEqual(tree.status_code, 200)
        self.assertTrue(tree.json()[0]["context_only"])
        self.assertFalse(tree.json()[0]["children"][0]["context_only"])

    def test_soft_delete_empty_category(self):
        res = self._post(category_code="FAB", category_name="Fabric")
        cid = res.json()["id"]
        deleted = self.client.delete(f"/api/categories/{cid}/", HTTP_HOST="localhost")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.json()["status"], "Inactive")
        self.assertTrue(Category.objects.filter(pk=cid).exists())

    def test_duplicate_code_three_times_creates_zero_extra_rows(self):
        first = self._post(category_code="CF", category_name="Cotton Fabric")
        self.assertEqual(first.status_code, 201, first.content)
        before = Category.objects.count()
        for _ in range(3):
            res = self._post(category_code="CF", category_name="Toast Cotton")
            self.assertEqual(res.status_code, 400, res.content)
            body = res.json()
            self.assertTrue(body.get("category_code"), body)
            self.assertIn("already in use", " ".join(body["category_code"]).lower())
        self.assertEqual(Category.objects.count(), before)
        self.assertEqual(Category.objects.filter(category_name="Toast Cotton").count(), 0)
        self.assertEqual(Category.objects.filter(category_code="CF").count(), 1)

    def test_permanent_delete_rejected_on_active(self):
        cid = self._post(category_code="JUNK", category_name="Toast Cotton").json()["id"]
        res = self.client.delete(
            f"/api/categories/{cid}/?permanent=true",
            HTTP_HOST="localhost",
        )
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn("inactive", res.json()["detail"].lower())
        self.assertTrue(Category.objects.filter(pk=cid, status="Active").exists())

    def test_permanent_delete_after_deactivate_removes_row(self):
        cid = self._post(category_code="JUNK", category_name="Toast Cotton").json()["id"]
        soft = self.client.delete(f"/api/categories/{cid}/", HTTP_HOST="localhost")
        self.assertEqual(soft.status_code, 200)
        hard = self.client.delete(
            f"/api/categories/{cid}/?permanent=true",
            HTTP_HOST="localhost",
        )
        self.assertEqual(hard.status_code, 204, hard.content)
        self.assertFalse(Category.objects.filter(pk=cid).exists())

    def test_permanent_delete_blocked_when_subcategories_exist(self):
        root_id = self._post(category_code="FAB", category_name="Fabric").json()["id"]
        sub_id = self._post(
            category_code="CTN",
            category_name="Cotton",
            parent_category_id=root_id,
        ).json()["id"]
        self.client.delete(f"/api/categories/{sub_id}/", HTTP_HOST="localhost")
        self.client.delete(f"/api/categories/{root_id}/", HTTP_HOST="localhost")
        hard = self.client.delete(
            f"/api/categories/{root_id}/?permanent=true",
            HTTP_HOST="localhost",
        )
        self.assertEqual(hard.status_code, 409, hard.content)
        self.assertIn("subcategories first", hard.json()["detail"].lower())
        self.assertTrue(Category.objects.filter(pk=root_id).exists())
        self.assertTrue(Category.objects.filter(pk=sub_id).exists())

    def test_operator_cannot_permanent_delete(self):
        cid = self._post(category_code="JUNK", category_name="Toast Cotton").json()["id"]
        self.client.delete(f"/api/categories/{cid}/", HTTP_HOST="localhost")
        operator = AuthUser.objects.create_user(
            username="cat-op",
            password="pass12345",
            role=AuthUser.Role.OPERATOR,
        )
        self.client.force_authenticate(operator)
        res = self.client.delete(
            f"/api/categories/{cid}/?permanent=true",
            HTTP_HOST="localhost",
        )
        self.assertEqual(res.status_code, 403)
        self.assertTrue(Category.objects.filter(pk=cid).exists())
