# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from types import SimpleNamespace

from django.test import SimpleTestCase, override_settings

from cvat.apps.engine.tests.test_rest_api import create_db_users
from cvat.apps.engine.tests.utils import ApiTestBase, ForceLogin
from cvat.apps.organizations.permissions import MembershipPermission


class MembershipPermissionTestCase(SimpleTestCase):
    def test_role_change_resource_includes_requested_role(self):
        membership = SimpleNamespace(role="worker", is_active=True, user_id=2, organization_id=10)
        for new_role in ["owner", "maintainer", "supervisor", "worker"]:
            with self.subTest(new_role=new_role):
                permissions = MembershipPermission.create(
                    SimpleNamespace(method="PATCH", data={"role": new_role}),
                    SimpleNamespace(action="partial_update"),
                    membership,
                    {"user_id": 1},
                )
                role_permission = next(
                    p for p in permissions if p.scope == MembershipPermission.Scopes.UPDATE_ROLE
                )
                resource = role_permission.get_resource()

                self.assertEqual(resource["role"], "worker")
                self.assertEqual(resource["new_role"], new_role)

    def test_delete_resource_has_no_requested_role(self):
        permission = MembershipPermission(
            scope=MembershipPermission.Scopes.DELETE,
            obj=SimpleNamespace(role="worker", is_active=True, user_id=2, organization_id=10),
        )

        self.assertIsNone(permission.get_resource()["new_role"])


class OrganizationCreateAPITestCase(ApiTestBase):
    @classmethod
    def setUpTestData(cls):
        create_db_users(cls)

    def _run_api(self, user, data):
        with ForceLogin(user, self.client):
            return self.client.post("/api/organizations", data=data, format="json")

    def test_default_permissions(self):
        for user, expected_status in [(self.admin, 201), (self.owner, 201), (self.annotator, 403)]:
            response = self._run_api(user, {"slug": user.username + "org"})
            self.assertEqual(response.status_code, expected_status, response.content)

    @override_settings(ORGANIZATIONS_MIN_ROLE_TO_CREATE="admin")
    def test_overridden_permissions(self):
        for user, expected_status in [(self.admin, 201), (self.owner, 403), (self.annotator, 403)]:
            response = self._run_api(user, {"slug": user.username + "org"})
            self.assertEqual(response.status_code, expected_status, response.content)
