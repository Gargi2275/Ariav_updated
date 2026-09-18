from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import AuthUser
from entities.models import Entity


def _entity(**kwargs):
    defaults = {
        "entity_type": Entity.EntityType.BRANCH,
        "status": Entity.Status.ACTIVE,
        "country": "India",
    }
    defaults.update(kwargs)
    return Entity.objects.create(**defaults)


def _flatten(nodes, acc=None):
    acc = acc if acc is not None else []
    for node in nodes:
        acc.append(node)
        _flatten(node.get("children") or [], acc)
    return acc


class EntityTreeStatusFilterTests(TestCase):
    def setUp(self):
        self.user = AuthUser.objects.create_user(
            username="tree-tester",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

        self.gujarat = _entity(short_code="GUJ", entity_name="Gujarat")
        self.shriva = _entity(short_code="SRV", entity_name="Shriva")
        self.aditi = _entity(short_code="ADT", entity_name="Aditi", parent_entity=self.gujarat)
        self.demo = _entity(
            short_code="DEM",
            entity_name="Demo",
            parent_entity=self.aditi,
            status=Entity.Status.INACTIVE,
        )
        self.inactive_parent = _entity(
            short_code="INP",
            entity_name="Inactive Parent",
            status=Entity.Status.INACTIVE,
        )
        self.inactive_child = _entity(
            short_code="INC",
            entity_name="Inactive Child",
            parent_entity=self.inactive_parent,
            status=Entity.Status.INACTIVE,
        )
        self.deep_root = _entity(short_code="L1", entity_name="Level One")
        self.deep_mid = _entity(short_code="L2", entity_name="Level Two", parent_entity=self.deep_root)
        self.deep_leaf = _entity(
            short_code="L3",
            entity_name="Level Three Inactive",
            parent_entity=self.deep_mid,
            status=Entity.Status.INACTIVE,
        )

    def _tree(self, **params):
        res = self.client.get("/api/entities/", {**params, "tree": 1}, HTTP_HOST="localhost")
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()

    def test_inactive_child_keeps_active_ancestors_as_context(self):
        nodes = _flatten(self._tree(status="Inactive"))
        by_name = {n["entity_name"]: n for n in nodes}
        self.assertIn("Demo", by_name)
        self.assertFalse(by_name["Demo"]["context_only"])
        self.assertEqual(by_name["Demo"]["status"], "Inactive")
        self.assertIn("Aditi", by_name)
        self.assertTrue(by_name["Aditi"]["context_only"])
        self.assertIn("Gujarat", by_name)
        self.assertTrue(by_name["Gujarat"]["context_only"])
        demo_parent = next(
            c for c in by_name["Aditi"]["children"] if c["entity_name"] == "Demo"
        )
        self.assertFalse(demo_parent["context_only"])

    def test_inactive_parent_and_child_are_both_matches(self):
        nodes = _flatten(self._tree(status="Inactive"))
        by_name = {n["entity_name"]: n for n in nodes}
        self.assertFalse(by_name["Inactive Parent"]["context_only"])
        self.assertFalse(by_name["Inactive Child"]["context_only"])

    def test_active_filter_excludes_inactive_leaf_without_context_row(self):
        nodes = _flatten(self._tree(status="Active"))
        names = {n["entity_name"] for n in nodes}
        self.assertEqual({"Gujarat", "Shriva", "Aditi", "Level One", "Level Two"} & names, {"Gujarat", "Shriva", "Aditi", "Level One", "Level Two"})
        self.assertNotIn("Demo", names)
        by_name = {n["entity_name"]: n for n in nodes}
        for name in ("Gujarat", "Shriva", "Aditi"):
            self.assertFalse(by_name[name]["context_only"])
        self.assertEqual(by_name["Aditi"]["children"], [])

    def test_all_filter_unchanged_no_context_only(self):
        nodes = _flatten(self._tree())
        by_name = {n["entity_name"]: n for n in nodes}
        self.assertIn("Demo", by_name)
        self.assertIn("Gujarat", by_name)
        self.assertFalse(any(n["context_only"] for n in nodes))

    def test_deeply_nested_inactive_includes_every_ancestor_as_context(self):
        nodes = _flatten(self._tree(status="Inactive"))
        by_name = {n["entity_name"]: n for n in nodes}
        self.assertTrue(by_name["Level One"]["context_only"])
        self.assertTrue(by_name["Level Two"]["context_only"])
        self.assertFalse(by_name["Level Three Inactive"]["context_only"])
        mid = next(c for c in by_name["Level One"]["children"] if c["entity_name"] == "Level Two")
        leaf = next(c for c in mid["children"] if c["entity_name"] == "Level Three Inactive")
        self.assertTrue(mid["context_only"])
        self.assertFalse(leaf["context_only"])


class EntityUniquenessApiTests(TestCase):
    def setUp(self):
        self.admin = AuthUser.objects.create_user(
            username="ent-uniq",
            password="pass12345",
            role=AuthUser.Role.ADMIN,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def _post(self, **kwargs):
        payload = {
            "short_code": "GUJ",
            "entity_name": "Gujarat",
            "entity_type": "Branch",
            "status": "Active",
            "parent_entity_id": None,
        }
        payload.update(kwargs)
        return self.client.post("/api/entities/", payload, format="json", HTTP_HOST="localhost")

    def test_duplicate_short_code_three_times_creates_zero_extra_rows(self):
        first = self._post()
        self.assertEqual(first.status_code, 201, first.content)
        before = Entity.objects.count()
        for i in range(3):
            res = self._post(entity_name=f"Gujarat Clone {i}")
            self.assertEqual(res.status_code, 400, res.content)
            body = res.json()
            self.assertTrue(body.get("short_code"), body)
            self.assertIn("already in use", " ".join(body["short_code"]).lower())
        self.assertEqual(Entity.objects.count(), before)
        self.assertEqual(Entity.objects.filter(short_code="GUJ").count(), 1)
